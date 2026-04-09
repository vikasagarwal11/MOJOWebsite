import '../../domain/entities/payment_entity.dart';

class PaymentModel extends PaymentEntity {
  const PaymentModel({
    required super.transactionId,
    required super.amount,
    required super.currency,
    required super.success,
    required super.processedAt,
    required super.attendeeIds,
    super.clientSecret,
  });
  factory PaymentModel.fromMap(Map<String, dynamic> map,
      {required List<String> attendeeIds}) {
    return PaymentModel(
      transactionId: (map['transactionId'] as String?) ?? '',
      amount: (map['amount'] as num?)?.toDouble() ?? 0,
      currency: (map['currency'] as String?) ?? 'USD',
      success: (map['success'] as bool?) ?? true,
      processedAt: DateTime.now(),
      attendeeIds: attendeeIds,
      clientSecret: map['clientSecret'] as String?,
    );
  }
}
