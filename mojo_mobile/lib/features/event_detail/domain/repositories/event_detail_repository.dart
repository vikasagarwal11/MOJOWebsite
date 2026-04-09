import 'package:dartz/dartz.dart';
import '../../../../core/error/failure.dart';
import '../entities/attendee_entity.dart';
import '../entities/event_entity.dart';
import '../entities/payment_entity.dart';

abstract class EventDetailRepository {
  Future<Either<Failure, EventEntity>> getEventDetail(String eventId);
  Future<Either<Failure, List<AttendeeEntity>>> getAttendees(String eventId);
  Future<Either<Failure, PaymentEntity>> processPayment({
    required String eventId,
    required List<String> attendeeIds,
    required double amount,
  });
  Future<Either<Failure, void>> addAttendee({
    required String eventId,
    required String name,
    required String relationship,
    required String ageGroup,
  });
  Future<Either<Failure, void>> removeAttendee({
    required String eventId,
    required String attendeeId,
  });
}
