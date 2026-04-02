import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_event.dart';
import '../services/stripe_payment_service.dart';

class RsvpBottomSheet extends ConsumerStatefulWidget {
  final MojoEvent event;
  const RsvpBottomSheet({super.key, required this.event});

  @override
  ConsumerState<RsvpBottomSheet> createState() => _RsvpBottomSheetState();
}

class _RsvpBottomSheetState extends ConsumerState<RsvpBottomSheet> {
  int _adultCount = 1;
  bool _isProcessing = false;

  Future<void> _processRsvp() async {
    final user = ref.read(authStateProvider).valueOrNull;
    if (user == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please log in to RSVP.')));
      return;
    }

    setState(() => _isProcessing = true);

    try {
      final displayName = user.displayName ?? user.email ?? 'Member';
      if (displayName.trim().length < 2) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Please set a display name in your profile (at least 2 characters).')),
        );
        setState(() => _isProcessing = false);
        return;
      }

      final attendeesCol = FirebaseFirestore.instance.collection('events').doc(widget.event.id).collection('attendees');

      final existingPrimary = await attendeesCol
          .where('userId', isEqualTo: user.uid)
          .where('attendeeType', isEqualTo: 'primary')
          .limit(1)
          .get();

      final hasPrimary = existingPrimary.docs.isNotEmpty;
      if (hasPrimary && _adultCount == 1) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('You already have an RSVP for this event.')),
          );
        }
        setState(() => _isProcessing = false);
        return;
      }

      final attendeeIds = List.generate(_adultCount, (_) => const Uuid().v4());
      final paymentStatus = widget.event.requiresStripeCheckout ? 'unpaid' : 'paid';

      final batch = FirebaseFirestore.instance.batch();
      for (var i = 0; i < attendeeIds.length; i++) {
        final id = attendeeIds[i];
        final refDoc = attendeesCol.doc(id);
        final bool asPrimary = !hasPrimary && i == 0;
        final type = asPrimary ? 'primary' : 'guest';
        final rel = asPrimary ? 'self' : 'guest';
        final rawName = asPrimary ? displayName.trim() : '${displayName.trim()} (guest ${i + 1})';
        final name = rawName.length >= 2 ? rawName : 'Guest ${i + 1}';
        batch.set(refDoc, {
          'eventId': widget.event.id,
          'userId': user.uid,
          'attendeeType': type,
          'relationship': rel,
          'name': name,
          'ageGroup': 'adult',
          'rsvpStatus': 'going',
          'paymentStatus': paymentStatus,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      if (!widget.event.requiresStripeCheckout) {
        if (mounted) Navigator.pop(context, true);
        return;
      }

      final stripeService = ref.read(stripePaymentServiceProvider);
      final success = await stripeService.processEventRSVPPayment(
        context: context,
        eventId: widget.event.id,
        userId: user.uid,
        attendeeIds: attendeeIds,
        merchantDisplayName: 'Moms Fitness MOJO',
      );

      if (success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Payment submitted. Your RSVP will show as paid when Stripe finishes processing.'),
          ),
        );
        Navigator.pop(context, true);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Payment was not completed. Your spot is reserved — open the event on the web or try Pay again from Events.'),
          ),
        );
        Navigator.pop(context, false);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('RSVP failed: $e')));
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final unitPrice = widget.event.adultPriceCents / 100.0;
    final total = unitPrice * _adultCount;
    final support = widget.event.eventSupportAmountCents / 100.0 * _adultCount;

    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'RSVP to ${widget.event.title}',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Number of attendees', style: TextStyle(fontSize: 16)),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.remove_circle_outline),
                      onPressed: _adultCount > 1 ? () => setState(() => _adultCount--) : null,
                    ),
                    Text('$_adultCount', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    IconButton(
                      icon: const Icon(Icons.add_circle_outline),
                      onPressed: () => setState(() => _adultCount++),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Divider(),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Total:', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                Text(
                  !widget.event.requiresStripeCheckout
                      ? 'FREE'
                      : '\$${total.toStringAsFixed(2)}${widget.event.eventSupportAmountCents > 0 ? ' + \$${support.toStringAsFixed(2)} support' : ''}',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: MojoColors.primaryOrange),
                ),
              ],
            ),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _isProcessing ? null : _processRsvp,
              style: ElevatedButton.styleFrom(
                backgroundColor: MojoColors.primaryOrange,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: _isProcessing
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                    )
                  : Text(
                      widget.event.requiresStripeCheckout ? 'Save RSVP & pay with Stripe' : 'Confirm RSVP',
                      style: const TextStyle(fontSize: 16, color: Colors.white, fontWeight: FontWeight.bold),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
