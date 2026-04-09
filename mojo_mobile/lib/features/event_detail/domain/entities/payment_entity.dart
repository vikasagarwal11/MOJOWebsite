import 'package:equatable/equatable.dart';

class PaymentEntity extends Equatable {
  const PaymentEntity({
    required this.transactionId,
    required this.amount,
    required this.currency,
    required this.success,
    required this.processedAt,
    required this.attendeeIds,
    this.clientSecret,
  });
  final String transactionId;
  final double amount;
  final String currency;
  final bool success;
  final DateTime processedAt;
  final List<String> attendeeIds;

  /// Stripe client secret for presenting the Payment Sheet.
  /// Only present for Stripe payments (not Zelle/free/payThere).
  final String? clientSecret;

  @override
  List<Object?> get props => <Object?>[
        transactionId,
        amount,
        currency,
        success,
        processedAt,
        attendeeIds,
        clientSecret,
      ];
}
