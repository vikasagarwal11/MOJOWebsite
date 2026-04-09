import 'package:dartz/dartz.dart';
import 'package:equatable/equatable.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/usecase/usecase.dart';
import '../entities/payment_entity.dart';
import '../repositories/event_detail_repository.dart';

class ProcessPaymentUseCase
    implements UseCase<PaymentEntity, ProcessPaymentParams> {
  const ProcessPaymentUseCase(this._repository);
  final EventDetailRepository _repository;
  @override
  Future<Either<Failure, PaymentEntity>> call(ProcessPaymentParams params) {
    return _repository.processPayment(
      eventId: params.eventId,
      attendeeIds: params.attendeeIds,
      amount: params.amount,
    );
  }
}

class ProcessPaymentParams extends Equatable {
  const ProcessPaymentParams({
    required this.eventId,
    required this.attendeeIds,
    required this.amount,
  });
  final String eventId;
  final List<String> attendeeIds;
  final double amount;
  @override
  List<Object?> get props => <Object?>[eventId, attendeeIds, amount];
}
