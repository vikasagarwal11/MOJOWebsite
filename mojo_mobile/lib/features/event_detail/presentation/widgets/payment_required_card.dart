import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../events/widgets/zelle_qr_modal.dart';
import '../../domain/entities/attendee_entity.dart';
import '../../domain/entities/event_entity.dart';
import '../bloc/event_detail_bloc.dart';
import 'attendee_list_tile.dart';
import 'pay_button.dart';

const Color _surfaceCard = Color(0xFFFFFCF8);
const Color _surfaceBorder = Color(0xFFEADBCB);
const Color _textPrimary = Color(0xFF2D231F);
const Color _textSecondary = Color(0xFF7D665A);

class PaymentRequiredCard extends StatelessWidget {
  const PaymentRequiredCard({
    super.key,
    required this.event,
    required this.attendees,
    required this.state,
    required this.onPay,
  });

  final EventEntity event;
  final List<AttendeeEntity> attendees;
  final EventDetailState state;
  final VoidCallback onPay;

  @override
  Widget build(BuildContext context) {
    bool isPayableStatus(PaymentStatus s) =>
        s == PaymentStatus.unpaid || s == PaymentStatus.pending;

    final unpaid = attendees
        .where((a) =>
            a.rsvpStatus == RsvpStatus.going &&
            isPayableStatus(a.paymentStatus))
        .toList(growable: false);
    final paid = attendees
        .where((a) =>
            a.rsvpStatus == RsvpStatus.going &&
            a.paymentStatus == PaymentStatus.paid)
        .toList(growable: false);
    final waiting = attendees
        .where((a) =>
            a.rsvpStatus == RsvpStatus.going &&
            a.paymentStatus == PaymentStatus.waitingForApproval)
        .toList(growable: false);

    final isProcessing = state is PaymentProcessing;
    final isSuccess = state is PaymentSuccess;
    final message =
        state is PaymentError ? (state as PaymentError).message : null;

    final netTotalCents = unpaid.fold<int>(0, (sum, a) => sum + a.amountCents);
    final isZelle = event.isZellePayment;

    final totalChargeCents = (event.isEffectivelyFree ||
            event.isPayThere ||
            isZelle ||
            netTotalCents <= 0)
        ? netTotalCents
        : ((netTotalCents + 30) / 0.971).round();

    final chargePerAttendee = <String, _AttendeeCharge>{};
    if (netTotalCents > 0 && unpaid.isNotEmpty) {
      int distributedSum = 0;
      for (final a in unpaid) {
        final proportion = a.amountCents / netTotalCents;
        final attendeeCharge =
            isZelle ? a.amountCents : (totalChargeCents * proportion).round();

        int ticketCharge;
        int supportCharge;
        if (a.amountCents == 0) {
          ticketCharge = 0;
          supportCharge = 0;
        } else {
          final ticketProportion = a.ticketCents / a.amountCents;
          ticketCharge = (attendeeCharge * ticketProportion).round();
          supportCharge = attendeeCharge - ticketCharge;
        }

        chargePerAttendee[a.id] = _AttendeeCharge(
          subtotal: attendeeCharge,
          ticket: ticketCharge,
          support: supportCharge,
        );
        distributedSum += attendeeCharge;
      }

      final remainder = totalChargeCents - distributedSum;
      if (remainder != 0) {
        var largest = unpaid.first;
        for (final attendee in unpaid.skip(1)) {
          if (attendee.amountCents > largest.amountCents) {
            largest = attendee;
          }
        }
        final c = chargePerAttendee[largest.id]!;
        chargePerAttendee[largest.id] = _AttendeeCharge(
          subtotal: c.subtotal + remainder,
          ticket: c.ticket + remainder,
          support: c.support,
        );
      }
    }

    final totalDueCents = totalChargeCents;
    final allPaid = unpaid.isEmpty && paid.isNotEmpty;

    bool isSelfAttendee(AttendeeEntity a) {
      final value = a.relationship.trim().toLowerCase();
      return value == 'self' || value == 'myself' || value == 'me';
    }

    final hasSelfAttendee = attendees.any(isSelfAttendee);

    int count(RsvpStatus status) =>
        attendees.where((a) => a.rsvpStatus == status).length;

    final canPay = !event.isEffectivelyFree && !event.isPayThere && unpaid.isNotEmpty;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _buildPaymentCard(
            context: context,
            unpaid: unpaid,
            paid: paid,
            waiting: waiting,
            chargePerAttendee: chargePerAttendee,
            totalDueCents: totalDueCents,
            canPay: canPay,
            allPaid: allPaid,
            isZelle: isZelle,
            isProcessing: isProcessing,
            isSuccess: isSuccess,
            errorMessage: message,
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
            decoration: BoxDecoration(
              color: _surfaceCard,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: _surfaceBorder),
              boxShadow: const <BoxShadow>[
                BoxShadow(
                  color: Color(0x14000000),
                  blurRadius: 16,
                  offset: Offset(0, 8),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Text(
                          'Manage Attendees',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          strutStyle: const StrutStyle(
                            forceStrutHeight: true,
                            height: 1.2,
                            leading: 0.1,
                          ),
                          style: GoogleFonts.manrope(
                            color: _textPrimary,
                            fontWeight: FontWeight.w700,
                            fontSize: 17,
                            height: 1.2,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      _AddAttendeeButton(
                        showSelfOption: !hasSelfAttendee,
                        onAdd: (name, relationship, ageGroup) {
                          context.read<EventDetailBloc>().add(AddAttendee(
                                name: name,
                                relationship: relationship,
                                ageGroup: ageGroup,
                              ));
                        },
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final chipWidth = (constraints.maxWidth - 16) / 3;
                    return Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: <Widget>[
                        SizedBox(
                          width: chipWidth,
                          child: _StatusCountChip(
                            label: 'Going',
                            value: count(RsvpStatus.going),
                            color: const Color(0xFF22C55E),
                          ),
                        ),
                        SizedBox(
                          width: chipWidth,
                          child: _StatusCountChip(
                            label: 'Not Going',
                            value: count(RsvpStatus.notGoing),
                            color: const Color(0xFFEF4444),
                          ),
                        ),
                        SizedBox(
                          width: chipWidth,
                          child: _StatusCountChip(
                            label: 'Waitlisted',
                            value: count(RsvpStatus.waitlisted),
                            color: const Color(0xFFFBBF24),
                          ),
                        ),
                      ],
                    );
                  },
                ),
                if (event.isFull && !event.canWaitlist) ...[
                  const SizedBox(height: 8),
                  _buildInfoBanner(
                    icon: Icons.block_rounded,
                    text: 'Event is full',
                    color: const Color(0xFFEF4444),
                  ),
                ],
                if (event.canWaitlist) ...[
                  const SizedBox(height: 8),
                  _buildInfoBanner(
                    icon: Icons.hourglass_top_rounded,
                    text: 'Event is full. You can join the waitlist.',
                    color: const Color(0xFFFBBF24),
                  ),
                ],
                if (event.maxAttendees > 0) ...[
                  const SizedBox(height: 6),
                  Text(
                    '${event.attendingCount}/${event.maxAttendees} spots filled',
                    style: GoogleFonts.plusJakartaSans(
                      color: _textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                ...attendees.map((a) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: AttendeeListTile(
                        attendee: a,
                        onRemove: () => _confirmRemove(context, a),
                      ),
                    )),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentCard({
    required BuildContext context,
    required List<AttendeeEntity> unpaid,
    required List<AttendeeEntity> paid,
    required List<AttendeeEntity> waiting,
    required Map<String, _AttendeeCharge> chargePerAttendee,
    required int totalDueCents,
    required bool canPay,
    required bool allPaid,
    required bool isZelle,
    required bool isProcessing,
    required bool isSuccess,
    required String? errorMessage,
  }) {
    String statusText;
    Color statusColor;

    if (event.isEffectivelyFree) {
      statusText = 'Free Event';
      statusColor = const Color(0xFF22C55E);
    } else if (event.isPayThere) {
      statusText = 'Pay at Event';
      statusColor = const Color(0xFF3B82F6);
    } else if (allPaid) {
      statusText = 'Payment Completed';
      statusColor = const Color(0xFF22C55E);
    } else if (waiting.isNotEmpty && unpaid.isEmpty) {
      statusText = 'Waiting for Approval';
      statusColor = const Color(0xFFF59E0B);
    } else {
      statusText = 'Payment Required';
      statusColor = const Color(0xFFEF4444);
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      decoration: BoxDecoration(
        color: _surfaceCard,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _surfaceBorder),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 14,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(Icons.receipt_long_rounded, color: statusColor, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  statusText,
                  style: GoogleFonts.manrope(
                    color: _textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 17,
                    height: 1.2,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (errorMessage != null && errorMessage.trim().isNotEmpty) ...[
            _buildInfoBanner(
              icon: Icons.error_outline_rounded,
              text: errorMessage,
              color: const Color(0xFFEF4444),
            ),
            const SizedBox(height: 10),
          ],
          if (event.isEffectivelyFree)
            Text(
              'No payment is required for this event.',
              style: GoogleFonts.plusJakartaSans(
                color: _textSecondary,
                fontWeight: FontWeight.w500,
                height: 1.3,
              ),
            )
          else if (event.isPayThere)
            Text(
              'Please pay directly at the event venue.',
              style: GoogleFonts.plusJakartaSans(
                color: _textSecondary,
                fontWeight: FontWeight.w500,
                height: 1.3,
              ),
            )
          else ...[
            ...unpaid.map(
              (a) => _buildAttendeeBreakdownRow(a, chargePerAttendee[a.id]),
            ),
            if (unpaid.isNotEmpty) const SizedBox(height: 6),
            if (unpaid.isNotEmpty)
              _buildAmountRow(
                'Total Due',
                _formatCents(totalDueCents),
                emphasize: true,
              ),
            if (waiting.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                '${waiting.length} attendee(s) are waiting for payment approval.',
                style: GoogleFonts.plusJakartaSans(
                  color: const Color(0xFFB45309),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            if (paid.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                '${paid.length} attendee(s) already paid',
                style: GoogleFonts.plusJakartaSans(
                  color: const Color(0xFF15803D),
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: 12),
            PayButton(
              onPressed: canPay
                  ? () => _handlePayTap(context, totalDueCents, isZelle)
                  : null,
              isProcessing: isProcessing,
              isSuccess: isSuccess,
              label: isZelle ? 'Pay with Zelle' : 'Pay Now',
            ),
            if (!canPay && !allPaid) ...[
              const SizedBox(height: 8),
              Text(
                'No unpaid attendees yet. Add attendees to continue.',
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  color: _textSecondary,
                  fontSize: 12,
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildAttendeeBreakdownRow(AttendeeEntity attendee, _AttendeeCharge? charge) {
    final amount = charge?.subtotal ?? attendee.amountCents;

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              attendee.fullName.isEmpty ? 'Attendee' : attendee.fullName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.plusJakartaSans(
                color: _textPrimary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            _formatCents(amount),
            style: GoogleFonts.plusJakartaSans(
              color: _textPrimary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAmountRow(
    String label,
    String value, {
    bool emphasize = false,
  }) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              color: emphasize ? _textPrimary : _textSecondary,
              fontWeight: emphasize ? FontWeight.w700 : FontWeight.w600,
            ),
          ),
        ),
        Text(
          value,
          style: GoogleFonts.plusJakartaSans(
            color: _textPrimary,
            fontWeight: emphasize ? FontWeight.w800 : FontWeight.w700,
            fontSize: emphasize ? 16 : 14,
          ),
        ),
      ],
    );
  }

  void _handlePayTap(BuildContext context, int amountCents, bool isZelle) {
    if (isZelle) {
      final email = event.zelleRecipientEmail.trim().isEmpty
          ? 'organizer@example.com'
          : event.zelleRecipientEmail.trim();
      final phone = event.zelleRecipientPhone.trim().isEmpty
          ? 'N/A'
          : event.zelleRecipientPhone.trim();
      showZelleQrModal(
        context,
        amountCents: amountCents,
        currency: event.currency,
        eventTitle: event.title,
        recipientEmail: email,
        recipientPhone: phone,
        onPaymentDone: () {
          Navigator.of(context).pop();
          onPay();
        },
      );
      return;
    }
    onPay();
  }

  void _confirmRemove(BuildContext context, AttendeeEntity attendee) {
    final isPaid = attendee.paymentStatus == PaymentStatus.paid;
    showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _surfaceCard,
        title: Text(
          'Remove Attendee',
          style: GoogleFonts.manrope(color: _textPrimary),
        ),
        content: Text(
          isPaid
              ? '${attendee.fullName} has already paid. Removing them may require organizer refund handling. Continue?'
              : 'Remove ${attendee.fullName} from this RSVP?',
          style: GoogleFonts.plusJakartaSans(color: _textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(
              'Cancel',
              style: GoogleFonts.plusJakartaSans(color: _textSecondary),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              'Remove',
              style: GoogleFonts.plusJakartaSans(color: const Color(0xFFEF4444)),
            ),
          ),
        ],
      ),
    ).then((confirmed) {
      if (confirmed == true && context.mounted) {
        context.read<EventDetailBloc>().add(RemoveAttendee(attendee.id));
      }
    });
  }

  Widget _buildInfoBanner({
    required IconData icon,
    required String text,
    required Color color,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.plusJakartaSans(
                color: const Color(0xFF2D231F),
                fontWeight: FontWeight.w600,
                fontSize: 12,
                height: 1.25,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatCents(int cents) {
    final dollars = (cents / 100).toStringAsFixed(2);
    return '\$$dollars';
  }
}

class _AttendeeCharge {
  const _AttendeeCharge({
    required this.subtotal,
    required this.ticket,
    required this.support,
  });
  final int subtotal;
  final int ticket;
  final int support;
}

class _StatusCountChip extends StatelessWidget {
  const _StatusCountChip({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.28)),
      ),
      child: Text(
        '$label: $value',
        textAlign: TextAlign.center,
        style: GoogleFonts.plusJakartaSans(
          color: const Color(0xFF2D231F),
          fontWeight: FontWeight.w700,
          fontSize: 11,
                      height: 1.0,
        ),
      ),
    );
  }
}

class _AddAttendeeButton extends StatelessWidget {
  const _AddAttendeeButton({
    required this.onAdd,
    required this.showSelfOption,
  });

  final void Function(String name, String relationship, String ageGroup) onAdd;
  final bool showSelfOption;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => _showAddDialog(context),
        borderRadius: BorderRadius.circular(22),
        child: Ink(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFFE86A35), Color(0xFFF39A5D)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(22),
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x30E86A35),
                blurRadius: 8,
                offset: Offset(0, 3),
              ),
            ],
          ),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 34, minWidth: 72),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  const Icon(Icons.person_add_rounded, color: Colors.white, size: 14),
                  const SizedBox(width: 4),
                  Text(
                    'Add',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 11,
                      height: 1.0,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showAddDialog(BuildContext context) {
    final nameController = TextEditingController();
    String relationship = 'guest';
    String ageGroup = 'adult';

    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          backgroundColor: _surfaceCard,
          title: Text(
            'Add Attendee',
            style: GoogleFonts.manrope(color: _textPrimary),
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  showSelfOption
                      ? 'You can add yourself first, then add family or guests.'
                      : 'Yourself is already added. Add family or guests here.',
                  style: GoogleFonts.plusJakartaSans(color: _textSecondary, height: 1.3),
                ),
                if (showSelfOption) ...[
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: OutlinedButton.icon(
                      onPressed: () {
                        final name = nameController.text.trim().isEmpty
                            ? 'Myself'
                            : nameController.text.trim();
                        Navigator.of(ctx).pop();
                        onAdd(name, 'self', ageGroup);
                      },
                      icon: const Icon(Icons.person_rounded, size: 16),
                      label: const Text('Add Myself'),
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                TextField(
                  controller: nameController,
                  style: GoogleFonts.plusJakartaSans(color: _textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Full Name',
                    labelStyle: GoogleFonts.plusJakartaSans(color: _textSecondary),
                    enabledBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: _surfaceBorder),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFFE86A35)),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: relationship,
                  dropdownColor: _surfaceCard,
                  style: GoogleFonts.plusJakartaSans(color: _textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Relationship',
                    labelStyle: GoogleFonts.plusJakartaSans(color: _textSecondary),
                    enabledBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: _surfaceBorder),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFFE86A35)),
                    ),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'spouse', child: Text('Spouse')),
                    DropdownMenuItem(value: 'parent', child: Text('Parent')),
                    DropdownMenuItem(value: 'sibling', child: Text('Sibling')),
                    DropdownMenuItem(value: 'child', child: Text('Child')),
                    DropdownMenuItem(value: 'guest', child: Text('Guest')),
                  ],
                  onChanged: (v) => setState(() => relationship = v ?? 'guest'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: ageGroup,
                  dropdownColor: _surfaceCard,
                  style: GoogleFonts.plusJakartaSans(color: _textPrimary),
                  decoration: InputDecoration(
                    labelText: 'Age Group',
                    labelStyle: GoogleFonts.plusJakartaSans(color: _textSecondary),
                    enabledBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: _surfaceBorder),
                    ),
                    focusedBorder: const OutlineInputBorder(
                      borderSide: BorderSide(color: Color(0xFFE86A35)),
                    ),
                  ),
                  items: const [
                    DropdownMenuItem(value: 'adult', child: Text('Adult')),
                    DropdownMenuItem(value: '0-2', child: Text('0-2 yrs')),
                    DropdownMenuItem(value: '3-5', child: Text('3-5 yrs')),
                    DropdownMenuItem(value: '6-10', child: Text('6-10 yrs')),
                    DropdownMenuItem(value: '11+', child: Text('11+ yrs')),
                  ],
                  onChanged: (v) => setState(() => ageGroup = v ?? 'adult'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: Text(
                'Cancel',
                style: GoogleFonts.plusJakartaSans(color: _textSecondary),
              ),
            ),
            TextButton(
              onPressed: () {
                final name = nameController.text.trim();
                if (name.isEmpty) return;
                Navigator.of(ctx).pop();
                onAdd(name, relationship, ageGroup);
              },
              child: Text(
                'Add',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(color: const Color(0xFFE86A35)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}









