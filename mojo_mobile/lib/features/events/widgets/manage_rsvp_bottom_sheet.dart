import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_event.dart';

/// Change RSVP to match web quick actions: Going / Not going (and cascade dependents for primary).
Future<void> showManageRsvpSheet({
  required BuildContext context,
  required WidgetRef ref,
  required MojoEvent event,
  required QueryDocumentSnapshot<Map<String, dynamic>> attendeeDoc,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _ManageRsvpSheet(
      event: event,
      attendeeDoc: attendeeDoc,
    ),
  );
}

class _ManageRsvpSheet extends ConsumerStatefulWidget {
  const _ManageRsvpSheet({
    required this.event,
    required this.attendeeDoc,
  });

  final MojoEvent event;
  final QueryDocumentSnapshot<Map<String, dynamic>> attendeeDoc;

  @override
  ConsumerState<_ManageRsvpSheet> createState() => _ManageRsvpSheetState();
}

class _ManageRsvpSheetState extends ConsumerState<_ManageRsvpSheet> {
  bool _busy = false;

  Map<String, dynamic> get _d => widget.attendeeDoc.data();
  String get _status => (_d['rsvpStatus'] as String?) ?? '—';
  String get _name => (_d['name'] as String?) ?? 'Guest';
  String? get _attendeeType => _d['attendeeType'] as String?;

  bool _needsPaidNotGoingWarning() {
    if (!widget.event.requiresStripeCheckout) return false;
    final ps = _d['paymentStatus'] as String?;
    if (ps != 'paid') return false;
    return _status == 'going';
  }

  Future<bool> _confirmPaidNotGoing() async {
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Paid event'),
        content: const Text(
          'You paid for this event. Changing to “Not going” does not automatically refund your payment. '
          'Continue?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Change to Not going'),
          ),
        ],
      ),
    );
    return r == true;
  }

  Future<void> _setStatus(String newStatus) async {
    final user = ref.read(authStateProvider).valueOrNull;
    if (user == null) return;

    if (newStatus == 'not-going' && _needsPaidNotGoingWarning()) {
      final ok = await _confirmPaidNotGoing();
      if (!ok || !mounted) return;
    }

    setState(() => _busy = true);
    try {
      final svc = ref.read(rsvpUpdateServiceProvider);
      await svc.updateMyAttendeeStatus(
        eventId: widget.event.id,
        attendeeId: widget.attendeeDoc.id,
        userId: user.uid,
        newStatus: newStatus,
      );
      if (mounted) {
        final messenger = ScaffoldMessenger.of(context);
        Navigator.pop(context);
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              newStatus == 'not-going'
                  ? 'You’re marked as not going.'
                  : 'You’re marked as going.',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not update RSVP: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isPast = widget.event.startAt.isBefore(DateTime.now());
    final canChange = !isPast;
    final showNotGoing = canChange && (_status == 'going' || _status == 'waitlisted');
    final showGoing = canChange && (_status == 'not-going' || _status == 'waitlisted');

    return Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: 24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
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
              'Manage RSVP',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              widget.event.title,
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 14),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Icon(Icons.person_outline, size: 18, color: scheme.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _name,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            if (_attendeeType != null) ...[
              const SizedBox(height: 4),
              Text(
                'Type: $_attendeeType',
                style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ],
            const SizedBox(height: 12),
            Chip(
              label: Text('Status: $_status'),
              visualDensity: VisualDensity.compact,
              backgroundColor: MojoColors.primaryOrange.withValues(alpha: 0.12),
            ),
            if (isPast) ...[
              const SizedBox(height: 16),
              Text(
                'This event has ended — RSVP can’t be changed.',
                style: TextStyle(color: scheme.error, fontSize: 13),
              ),
            ],
            const SizedBox(height: 24),
            if (_busy)
              const Center(child: CircularProgressIndicator())
            else ...[
              if (showNotGoing)
                FilledButton.tonal(
                  onPressed: () => _setStatus('not-going'),
                  style: FilledButton.styleFrom(
                    foregroundColor: scheme.error,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: const Text('Change to Not going'),
                ),
              if (showNotGoing && showGoing) const SizedBox(height: 12),
              if (showGoing)
                FilledButton(
                  onPressed: () => _setStatus('going'),
                  style: FilledButton.styleFrom(
                    backgroundColor: MojoColors.primaryOrange,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text(_status == 'waitlisted' ? 'Confirm Going (leave waitlist)' : 'Change to Going'),
                ),
              if (!showNotGoing && !showGoing && canChange)
                Text(
                  'Your RSVP is up to date.',
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
                ),
            ],
            const SizedBox(height: 12),
            TextButton(
              onPressed: _busy ? null : () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
  }
}
