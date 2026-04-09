import 'package:flutter/material.dart';

import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_event.dart';
import '../models/attendee_row_data.dart';
import '../services/event_payment_calculator.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

/// Displays an itemized payment breakdown per attendee with fees and total,
/// separated into Unpaid / Paid / Waiting for Approval groups.
///
/// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
class PaymentSummaryWidget extends StatelessWidget {
  const PaymentSummaryWidget({
    super.key,
    required this.event,
    required this.summary,
    required this.unpaidAttendees,
    required this.paidAttendees,
    required this.waitingAttendees,
    required this.onPayNow,
    this.isProcessing = false,
  });

  final MojoEvent event;
  final EventPaymentSummary summary;
  final List<AttendeeRowData> unpaidAttendees;
  final List<AttendeeRowData> paidAttendees;
  final List<AttendeeRowData> waitingAttendees;
  final VoidCallback onPayNow;
  final bool isProcessing;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  String _formatCents(int cents) {
    final dollars = (cents / 100).toStringAsFixed(2);
    final symbol = summary.currency == 'USD' ? '\$' : summary.currency;
    return '$symbol$dollars';
  }

  static const _ageGroupLabels = <String, String>{
    'adult': 'Adult',
    '0-2': '0-2 yrs',
    '3-5': '3-5 yrs',
    '6-10': '6-10 yrs',
    '11+': '11+ yrs',
  };

  String _ageLabel(String ageGroup) => _ageGroupLabels[ageGroup] ?? ageGroup;

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    // Free event
    if (summary.mode == UserPaymentMode.free) {
      return _infoCard(
        icon: Icons.celebration,
        color: Colors.green,
        text: 'This is a free event. No payment required.',
      );
    }

    // Pay-there event
    if (summary.mode == UserPaymentMode.payThere) {
      return _infoCard(
        icon: Icons.storefront,
        color: Colors.blue,
        text: 'Pay There event. Payment is handled offline.',
      );
    }

    // All paid
    final allPaid = unpaidAttendees.isEmpty && waitingAttendees.isEmpty;
    if (allPaid && paidAttendees.isNotEmpty) {
      return _allPaidCard();
    }

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Section title
            const Text(
              'Payment Summary',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: MojoColors.textPrimary,
              ),
            ),
            const SizedBox(height: 12),

            // Unpaid attendees
            if (unpaidAttendees.isNotEmpty) ...[
              _sectionHeader('Unpaid', Colors.red.shade700, Colors.red.shade50),
              ...summary.lines.map(_buildPaymentLine),
              const Divider(height: 20),
            ],

            // Paid attendees
            if (paidAttendees.isNotEmpty) ...[
              _sectionHeader(
                  'Paid', Colors.green.shade700, Colors.green.shade50),
              ...paidAttendees.map(_buildPaidRow),
              const Divider(height: 20),
            ],

            // Waiting for approval
            if (waitingAttendees.isNotEmpty) ...[
              _sectionHeader('Waiting for Approval', Colors.amber.shade800,
                  Colors.amber.shade50),
              ...waitingAttendees.map(_buildWaitingRow),
              const Divider(height: 20),
            ],

            // Stripe fees line
            if (summary.mode == UserPaymentMode.stripe &&
                summary.netTotalCents > 0) ...[
              _feeRow(
                'Stripe fees',
                _formatCents(summary.totalDueCents - summary.netTotalCents),
              ),
              const SizedBox(height: 8),
            ],

            // Total due
            if (unpaidAttendees.isNotEmpty) ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Total Due',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: MojoColors.textPrimary,
                    ),
                  ),
                  Text(
                    _formatCents(summary.totalDueCents),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: MojoColors.primaryOrange,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Pay button
              _buildPayButton(),
            ],
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Sub-widgets
  // ---------------------------------------------------------------------------

  Widget _infoCard({
    required IconData icon,
    required Color color,
    required String text,
  }) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(icon, color: color, size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: color,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _allPaidCard() {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.green.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle, color: Colors.green.shade600, size: 28),
            const SizedBox(width: 10),
            Text(
              'All Paid',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.green.shade700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionHeader(String label, Color textColor, Color bgColor) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: textColor,
        ),
      ),
    );
  }

  Widget _buildPaymentLine(EventPaymentLine line) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.attendeeName.isEmpty ? 'Attendee' : line.attendeeName,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: MojoColors.textPrimary,
                  ),
                ),
                Text(
                  _ageLabel(line.ageGroup),
                  style: const TextStyle(
                    fontSize: 11,
                    color: MojoColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 2,
            child: Text(
              _formatCents(line.ticketNetCents),
              textAlign: TextAlign.right,
              style:
                  const TextStyle(fontSize: 13, color: MojoColors.textPrimary),
            ),
          ),
          if (line.supportNetCents > 0)
            Expanded(
              flex: 2,
              child: Text(
                '+ ${_formatCents(line.supportNetCents)}',
                textAlign: TextAlign.right,
                style: const TextStyle(
                  fontSize: 12,
                  color: MojoColors.textSecondary,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildPaidRow(AttendeeRowData attendee) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(Icons.check_circle, size: 16, color: Colors.green.shade600),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              attendee.name.isEmpty ? 'Attendee' : attendee.name,
              style: const TextStyle(
                fontSize: 13,
                color: MojoColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWaitingRow(AttendeeRowData attendee) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(Icons.hourglass_top, size: 16, color: Colors.amber.shade700),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              attendee.name.isEmpty ? 'Attendee' : attendee.name,
              style: const TextStyle(
                fontSize: 13,
                color: MojoColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _feeRow(String label, String amount) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 13,
            color: MojoColors.textSecondary,
          ),
        ),
        Text(
          amount,
          style: const TextStyle(
            fontSize: 13,
            color: MojoColors.textSecondary,
          ),
        ),
      ],
    );
  }

  Widget _buildPayButton() {
    final isZelle = summary.mode == UserPaymentMode.zelle;
    final label = isZelle ? 'Pay via Zelle' : 'Pay Now';
    final icon = isZelle ? Icons.account_balance : Icons.payment;

    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: isProcessing ? null : onPayNow,
        icon: isProcessing
            ? const SizedBox(
                width: 18,
                height: 18,
                child: AppLoadingIndicator(strokeWidth: 2),
              )
            : Icon(icon, size: 18),
        label: Text(isProcessing ? 'Processingâ€¦' : label),
        style: ElevatedButton.styleFrom(
          backgroundColor: MojoColors.primaryOrange,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
    );
  }
}

