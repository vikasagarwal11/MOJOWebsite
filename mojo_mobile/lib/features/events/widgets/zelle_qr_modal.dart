import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/theme/mojo_colors.dart';

/// Modal bottom sheet displaying a Zelle QR code, recipient details,
/// transfer instructions, and action buttons.
///
/// Use [showZelleQrModal] to present this as a modal bottom sheet.
///
/// **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
class ZelleQrModal extends StatelessWidget {
  const ZelleQrModal({
    super.key,
    required this.amountCents,
    required this.currency,
    required this.eventTitle,
    required this.recipientEmail,
    required this.recipientPhone,
    required this.onPaymentDone,
    required this.onCancel,
  });

  final int amountCents;
  final String currency;
  final String eventTitle;
  final String recipientEmail;
  final String recipientPhone;
  final VoidCallback onPaymentDone;
  final VoidCallback onCancel;

  String get _formattedAmount {
    final dollars = (amountCents / 100).toStringAsFixed(2);
    final symbol = currency == 'USD' ? '\$' : currency;
    return '$symbol$dollars';
  }

  /// The memo the user should include in their Zelle transfer.
  String get _memo => '$eventTitle - RSVP Payment';

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Drag handle
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),

              // Title
              const Text(
                'Pay via Zelle',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: MojoColors.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Amount: $_formattedAmount',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: MojoColors.primaryOrange,
                ),
              ),
              const SizedBox(height: 20),

              // QR Code
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: QrImageView(
                  data: recipientEmail,
                  version: QrVersions.auto,
                  size: 180,
                  gapless: true,
                ),
              ),
              const SizedBox(height: 20),

              // Recipient details
              _detailRow(Icons.email_outlined, 'Email', recipientEmail),
              const SizedBox(height: 8),
              _detailRow(Icons.phone_outlined, 'Phone', recipientPhone),
              const SizedBox(height: 20),

              // Step-by-step instructions
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'How to pay via Zelle',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.blue.shade800,
                      ),
                    ),
                    const SizedBox(height: 8),
                    _step('1', 'Open your banking app and go to Zelle.'),
                    _step('2',
                        'Send $_formattedAmount to the email or phone above.'),
                    _step('3', 'Use this memo: "$_memo"'),
                    _step('4', 'Tap "Payment Done" below once sent.'),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Action buttons
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: onPaymentDone,
                  icon: const Icon(Icons.check, size: 18),
                  label: const Text('Payment Done'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: MojoColors.primaryOrange,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: onCancel,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: MojoColors.textSecondary,
                    side: BorderSide(color: Colors.grey.shade300),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: const Text('Cancel'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 18, color: MojoColors.textSecondary),
        const SizedBox(width: 8),
        Text(
          '$label: ',
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: MojoColors.textSecondary,
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: MojoColors.textPrimary,
            ),
          ),
        ),
      ],
    );
  }

  Widget _step(String number, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 20,
            height: 20,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.blue.shade700,
              shape: BoxShape.circle,
            ),
            child: Text(
              number,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                color: Colors.blue.shade900,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Convenience function to show the [ZelleQrModal] as a modal bottom sheet.
Future<void> showZelleQrModal(
  BuildContext context, {
  required int amountCents,
  required String currency,
  required String eventTitle,
  required String recipientEmail,
  required String recipientPhone,
  required VoidCallback onPaymentDone,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => ZelleQrModal(
      amountCents: amountCents,
      currency: currency,
      eventTitle: eventTitle,
      recipientEmail: recipientEmail,
      recipientPhone: recipientPhone,
      onPaymentDone: () {
        Navigator.of(context).pop();
        onPaymentDone();
      },
      onCancel: () => Navigator.of(context).pop(),
    ),
  );
}
