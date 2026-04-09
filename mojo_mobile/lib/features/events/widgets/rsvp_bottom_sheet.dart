import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import 'package:mojo_mobile/data/models/mojo_event.dart';
import '../services/event_payment_calculator.dart';
import '../services/stripe_payment_service.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';
import 'package:mojo_mobile/core/widgets/app_notice.dart';

@Deprecated(
  'Use EventRsvpPageScreen with AttendeeFormWidget instead. '
  'See mobile-rsvp-parity spec for details.',
)
class RsvpBottomSheet extends ConsumerStatefulWidget {
  final MojoEvent event;
  const RsvpBottomSheet({super.key, required this.event});

  @override
  ConsumerState<RsvpBottomSheet> createState() => _RsvpBottomSheetState();
}

class _RsvpBottomSheetState extends ConsumerState<RsvpBottomSheet> {
  final List<_SheetAttendee> _attendees = <_SheetAttendee>[
    const _SheetAttendee(relationship: 'self', ageGroup: 'adult'),
  ];
  bool _isProcessing = false;

  int get _adultCount => _attendees.length;

  String _money(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';

  Widget _buildCountAction({
    required IconData icon,
    required VoidCallback? onTap,
    required String tooltip,
  }) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Ink(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: onTap == null ? const Color(0xFFF1F1F1) : Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color:
                    onTap == null ? const Color(0xFFE6E6E6) : const Color(0xFFFFD8CB),
              ),
            ),
            child: Icon(
              icon,
              size: 18,
              color: onTap == null
                  ? const Color(0xFFB4B4B4)
                  : MojoColors.primaryOrange,
            ),
          ),
        ),
      ),
    );
  }

  String _ageLabel(String ageGroup) {
    switch (ageGroup) {
      case '0-2':
        return '0-2 yrs';
      case '3-5':
        return '3-5 yrs';
      case '6-10':
        return '6-10 yrs';
      case '11+':
        return '11+ yrs';
      case 'adult':
      default:
        return 'Adult';
    }
  }

  EventPaymentSummary _previewSummary() {
    final previewInputs = List<EventAttendeePaymentInput>.generate(
      _attendees.length,
      (i) {
        final attendee = _attendees[i];
        final fallbackName = i == 0 ? 'Member' : 'Guest ${i + 1}';
        final trimmedName = attendee.name.trim();
        return EventAttendeePaymentInput(
          id: 'preview_$i',
          name: trimmedName.isEmpty ? fallbackName : trimmedName,
          ageGroup: attendee.ageGroup,
          rsvpStatus: 'going',
          paymentStatus: 'unpaid',
        );
      },
    );

    return EventPaymentCalculator.calculateForAttendees(
      event: widget.event,
      attendees: previewInputs,
    );
  }

  Future<void> _showAddAttendeeDialog() async {
    final result = await showDialog<_SheetAttendee>(
      context: context,
      useRootNavigator: true,
      builder: (_) => const _AddAttendeeDialog(),
    );

    if (!mounted) return;
    if (result == null || result.name.trim().isEmpty) return;

    setState(() => _attendees.add(result));
  }

  void _removeLastAttendee() {
    if (_attendees.length <= 1) return;
    setState(() => _attendees.removeLast());
  }

  void _removeAttendeeAt(int index) {
    if (index <= 0 || index >= _attendees.length) return;
    setState(() => _attendees.removeAt(index));
  }

  Future<void> _processRsvp() async {
    final user = ref.read(authStateProvider).valueOrNull;
    if (user == null) {
      AppNotice.warning(context, 'Please log in to RSVP.');
      return;
    }

    setState(() => _isProcessing = true);

    try {
      final profile = ref.read(userProfileProvider(user.uid)).valueOrNull;
      final fromFirestore = profile?.resolvedPublicName?.trim();
      final fromAuth = user.displayName?.trim();
      final fromEmail = user.email != null && user.email!.contains('@')
          ? user.email!.split('@').first.trim()
          : null;
      final displayName = (fromFirestore != null && fromFirestore.isNotEmpty)
          ? fromFirestore
          : (fromAuth != null && fromAuth.isNotEmpty)
              ? fromAuth
              : (fromEmail != null && fromEmail.isNotEmpty)
                  ? fromEmail
                  : 'Member';

      if (displayName.trim().length < 2) {
        AppNotice.warning(context, 'Add your name under Profile (tap your photo on Home), then try again.');
        setState(() => _isProcessing = false);
        return;
      }

      final attendeesCol = FirebaseFirestore.instance
          .collection('events')
          .doc(widget.event.id)
          .collection('attendees');

      final existingPrimary = await attendeesCol
          .where('userId', isEqualTo: user.uid)
          .where('attendeeType', isEqualTo: 'primary')
          .limit(1)
          .get();

      final hasPrimary = existingPrimary.docs.isNotEmpty;
      if (hasPrimary && _adultCount == 1) {
        if (mounted) {
          AppNotice.info(context, 'You already have an RSVP. Use Manage my RSVP on the event, or Events -> I\'m Going -> Manage RSVP.');
        }
        setState(() => _isProcessing = false);
        return;
      }

      final int startIndex = hasPrimary ? 1 : 0;
      final List<_SheetAttendee> toCreate = _attendees.sublist(startIndex);
      if (toCreate.isEmpty) {
        if (mounted) {
          AppNotice.warning(context, 'Please add at least one attendee.');
        }
        setState(() => _isProcessing = false);
        return;
      }

      final attendeeIds = List.generate(toCreate.length, (_) => const Uuid().v4());
      final mode = EventPaymentCalculator.modeForEvent(widget.event);
      final paymentStatus = switch (mode) {
        UserPaymentMode.free => 'paid',
        UserPaymentMode.payThere => 'pending',
        UserPaymentMode.zelle => 'waiting_for_approval',
        UserPaymentMode.stripe => 'unpaid',
      };

      final batch = FirebaseFirestore.instance.batch();
      for (var i = 0; i < toCreate.length; i++) {
        final id = attendeeIds[i];
        final refDoc = attendeesCol.doc(id);
        final bool asPrimary = !hasPrimary && i == 0;
        final attendee = toCreate[i];
        final type = asPrimary ? 'primary' : 'guest';
        final rel = asPrimary ? 'self' : attendee.relationship;

        final enteredName = attendee.name.trim();
        final rawName = enteredName.isNotEmpty
            ? enteredName
            : (asPrimary
                ? displayName.trim()
                : '${displayName.trim()} (guest ${i + 1})');
        final name = rawName.length >= 2 ? rawName : 'Guest ${i + 1}';

        batch.set(refDoc, {
          'eventId': widget.event.id,
          'userId': user.uid,
          'attendeeType': type,
          'relationship': rel,
          'name': name,
          'ageGroup': attendee.ageGroup,
          'rsvpStatus': 'going',
          'paymentStatus': paymentStatus,
          'createdAt': FieldValue.serverTimestamp(),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      if (mode == UserPaymentMode.free || mode == UserPaymentMode.payThere) {
        if (!mounted) return;
        final message = mode == UserPaymentMode.free
            ? 'RSVP confirmed. This event is free.'
            : 'RSVP confirmed. This event is Pay There (offline payment).';
        AppNotice.success(context, message);
        Navigator.pop(context, true);
        return;
      }

      final stripeService = ref.read(stripePaymentServiceProvider);

      if (mode == UserPaymentMode.zelle) {
        await stripeService.markZelleWaitingForApproval(
          eventId: widget.event.id,
          attendeeIds: attendeeIds,
        );

        if (!mounted) return;
        final summary = EventPaymentCalculator.calculateForAttendees(
          event: widget.event,
          attendees: toCreate
              .asMap()
              .entries
              .map(
                (entry) => EventAttendeePaymentInput(
                  id: 'zelle_${entry.key}',
                  name: entry.value.name.trim().isEmpty
                      ? 'Guest ${entry.key + 1}'
                      : entry.value.name.trim(),
                  ageGroup: entry.value.ageGroup,
                  rsvpStatus: 'going',
                  paymentStatus: 'unpaid',
                ),
              )
              .toList(),
        );

        final recipient = dotenv.env['ZELLE_RECIPIENT_EMAIL']?.trim();
        final phone = dotenv.env['ZELLE_RECIPIENT_PHONE']?.trim();
        final amountText = _money(summary.totalDueCents);
        final zelleTarget = (recipient != null && recipient.isNotEmpty)
            ? recipient
            : (phone != null && phone.isNotEmpty)
                ? phone
                : 'organizer Zelle account';

        AppNotice.info(
          context,
          'RSVP saved. Send $amountText via Zelle to $zelleTarget. Status: waiting for approval.',
          duration: const Duration(seconds: 6),
        );
        Navigator.pop(context, true);
        return;
      }

      final success = await stripeService.processEventRSVPPayment(
        context: context,
        eventId: widget.event.id,
        userId: user.uid,
        attendeeIds: attendeeIds,
        merchantDisplayName: 'Moms Fitness MOJO',
      );

      if (success && mounted) {
        AppNotice.success(
          context,
          'Payment submitted. Your RSVP will show as paid when Stripe finishes processing.',
        );
        Navigator.pop(context, true);
      } else if (mounted) {
        AppNotice.warning(
          context,
          'Payment was not completed. Your RSVP is saved as unpaid. You can pay later from RSVP page.',
        );
        Navigator.pop(context, false);
      }
    } catch (e) {
      if (mounted) {
        AppNotice.error(context, 'RSVP failed: $e');
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final viewInsets = MediaQuery.of(context).viewInsets;
    final summary = _previewSummary();
    final mode = summary.mode;

    final isFree = mode == UserPaymentMode.free;
    final payThere = mode == UserPaymentMode.payThere;
    final isZelle = mode == UserPaymentMode.zelle;
    final isStripe = mode == UserPaymentMode.stripe;

    final totalLabel = isFree
        ? 'FREE'
        : payThere
            ? 'Pay There'
            : _money(summary.totalDueCents);

    final ctaLabel = isFree
        ? 'Confirm RSVP'
        : payThere
            ? 'Confirm RSVP (Pay There)'
            : isZelle
                ? 'Confirm RSVP (Zelle)'
                : 'Save RSVP & pay with Stripe';

    final amountByPreviewId = <String, int>{
      for (final line in summary.lines) line.attendeeId: line.chargeSubtotalCents,
    };

    return AnimatedPadding(
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
      padding: EdgeInsets.only(bottom: viewInsets.bottom),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: <Color>[
              scheme.surface,
              scheme.surfaceContainerLowest,
            ],
          ),
          border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.25)),
          boxShadow: <BoxShadow>[
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.10),
              blurRadius: 18,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 42,
                    height: 4,
                    decoration: BoxDecoration(
                      color: scheme.outlineVariant.withValues(alpha: 0.70),
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'RSVP',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: scheme.onSurface,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.event.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFEFE4DF)),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Attendees',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: scheme.onSurface,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Add names and age groups',
                              style: TextStyle(
                                fontSize: 12,
                                color: scheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                      _buildCountAction(
                        icon: Icons.remove_rounded,
                        onTap: _adultCount > 1 ? _removeLastAttendee : null,
                        tooltip: 'Remove last attendee',
                      ),
                      SizedBox(
                        width: 44,
                        child: Text(
                          '$_adultCount',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: scheme.onSurface,
                          ),
                        ),
                      ),
                      _buildCountAction(
                        icon: Icons.add_rounded,
                        onTap: _showAddAttendeeDialog,
                        tooltip: 'Add attendee',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                ...List<Widget>.generate(_attendees.length, (i) {
                  final attendee = _attendees[i];
                  final isPrimary = i == 0;
                  final lineAmountCents = amountByPreviewId['preview_$i'] ?? 0;
                  final title = attendee.name.trim().isEmpty
                      ? (isPrimary ? 'You (Primary)' : 'Guest ${i + 1}')
                      : attendee.name.trim();
                  final subtitle = isPrimary
                      ? _ageLabel(attendee.ageGroup)
                      : '${attendee.relationship} • ${_ageLabel(attendee.ageGroup)}';

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFEFE4DF)),
                        boxShadow: <BoxShadow>[
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.03),
                            blurRadius: 10,
                            offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          CircleAvatar(
                            radius: 14,
                            backgroundColor: scheme.primary.withValues(alpha: 0.15),
                            child: Icon(
                              isPrimary ? Icons.person : Icons.group_add_outlined,
                              size: 16,
                              color: scheme.primary,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  title,
                                  style: const TextStyle(fontWeight: FontWeight.w600),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  subtitle,
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: scheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (!isFree)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: MojoColors.primaryOrange.withValues(alpha: 0.10),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                  color: MojoColors.primaryOrange.withValues(alpha: 0.25),
                                ),
                              ),
                              child: Text(
                                payThere ? 'Pay there' : _money(lineAmountCents),
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: MojoColors.primaryOrange,
                                ),
                              ),
                            ),
                          if (!isFree) const SizedBox(width: 4),
                          if (!isPrimary)
                            IconButton(
                              onPressed: () => _removeAttendeeAt(i),
                              icon: const Icon(Icons.close_rounded, size: 18),
                              tooltip: 'Remove attendee',
                            ),
                        ],
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF6F2),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xFFFFDACB)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Amount Due',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: scheme.onSurface,
                        ),
                      ),
                      Text(
                        totalLabel,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: MojoColors.primaryOrange,
                        ),
                      ),
                    ],
                  ),
                ),
                if (!isFree) ...[
                  const SizedBox(height: 8),
                  Text(
                    isStripe
                        ? 'Each attendee amount and total already include Stripe charges.'
                        : 'Each attendee amount shown is final payable amount.',
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                  ),
                ],
                if (isZelle) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Zelle payment is manual and will be marked after organizer approval.',
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                  ),
                ],
                if (payThere) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Payment for this event is handled in-person/by organizer.',
                    style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                  ),
                ],
                const SizedBox(height: 20),
                SizedBox(
                  height: 52,
                  child: ElevatedButton.icon(
                    onPressed: _isProcessing ? null : _processRsvp,
                    icon: _isProcessing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: AppLoadingIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : Icon(
                            isFree
                                ? Icons.check_circle_outline_rounded
                                : Icons.lock_outline_rounded,
                            color: Colors.white,
                          ),
                    label: Text(
                      ctaLabel,
                      style: const TextStyle(
                        fontSize: 16,
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      elevation: 2,
                      backgroundColor: MojoColors.primaryOrange,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SheetAttendee {
  final String name;
  final String relationship;
  final String ageGroup;

  const _SheetAttendee({
    this.name = '',
    this.relationship = 'guest',
    this.ageGroup = 'adult',
  });
}

class _AddAttendeeDialog extends StatefulWidget {
  const _AddAttendeeDialog();

  @override
  State<_AddAttendeeDialog> createState() => _AddAttendeeDialogState();
}

class _AddAttendeeDialogState extends State<_AddAttendeeDialog> {
  final TextEditingController _nameController = TextEditingController();
  String _relationship = 'guest';
  String _ageGroup = 'adult';

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _nameController.text.trim();
    if (name.length < 2) return;
    Navigator.of(context).pop(
      _SheetAttendee(
        name: name,
        relationship: _relationship,
        ageGroup: _ageGroup,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      title: const Text('Add Attendee'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Add family member or guest details.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _nameController,
              autofocus: true,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: 'Full Name',
                border: OutlineInputBorder(),
              ),
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _relationship,
              decoration: const InputDecoration(
                labelText: 'Relationship',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'spouse', child: Text('Spouse')),
                DropdownMenuItem(value: 'parent', child: Text('Parent')),
                DropdownMenuItem(value: 'sibling', child: Text('Sibling')),
                DropdownMenuItem(value: 'child', child: Text('Child')),
                DropdownMenuItem(value: 'guest', child: Text('Guest')),
              ],
              onChanged: (v) => setState(() => _relationship = v ?? 'guest'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _ageGroup,
              decoration: const InputDecoration(
                labelText: 'Age Group',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(value: 'adult', child: Text('Adult')),
                DropdownMenuItem(value: '0-2', child: Text('0-2 yrs')),
                DropdownMenuItem(value: '3-5', child: Text('3-5 yrs')),
                DropdownMenuItem(value: '6-10', child: Text('6-10 yrs')),
                DropdownMenuItem(value: '11+', child: Text('11+ yrs')),
              ],
              onChanged: (v) => setState(() => _ageGroup = v ?? 'adult'),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: const Text('Add'),
        ),
      ],
    );
  }
}







