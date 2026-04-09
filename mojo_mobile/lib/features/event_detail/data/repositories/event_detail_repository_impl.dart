import 'package:dartz/dartz.dart';

import '../../../../core/error/failure.dart';
import '../../domain/entities/attendee_entity.dart';
import '../../domain/entities/event_entity.dart';
import '../../domain/entities/payment_entity.dart';
import '../../domain/repositories/event_detail_repository.dart';
import '../datasources/event_detail_remote_datasource.dart';

class EventDetailRepositoryImpl implements EventDetailRepository {
  const EventDetailRepositoryImpl(this._remoteDataSource);

  final EventDetailRemoteDataSource _remoteDataSource;

  @override
  Future<Either<Failure, EventEntity>> getEventDetail(String eventId) async {
    try {
      final event = await _remoteDataSource.getEventDetail(eventId);
      return Right<Failure, EventEntity>(event);
    } catch (e) {
      return Left<Failure, EventEntity>(
        ServerFailure('Could not load event details: $e'),
      );
    }
  }

  @override
  Future<Either<Failure, List<AttendeeEntity>>> getAttendees(
    String eventId,
  ) async {
    try {
      final attendees = await _remoteDataSource.getAttendees(eventId);
      return Right<Failure, List<AttendeeEntity>>(attendees);
    } catch (e) {
      return Left<Failure, List<AttendeeEntity>>(
        ServerFailure('Could not load attendees: $e'),
      );
    }
  }

  @override
  Future<Either<Failure, PaymentEntity>> processPayment({
    required String eventId,
    required List<String> attendeeIds,
    required double amount,
  }) async {
    try {
      final payment = await _remoteDataSource.processPayment(
        eventId: eventId,
        attendeeIds: attendeeIds,
        amount: amount,
      );
      return Right<Failure, PaymentEntity>(payment);
    } catch (e) {
      return Left<Failure, PaymentEntity>(
        ServerFailure('Payment failed: $e'),
      );
    }
  }

  @override
  Future<Either<Failure, void>> addAttendee({
    required String eventId,
    required String name,
    required String relationship,
    required String ageGroup,
  }) async {
    try {
      await _remoteDataSource.addAttendee(
        eventId: eventId,
        name: name,
        relationship: relationship,
        ageGroup: ageGroup,
      );
      return const Right<Failure, void>(null);
    } catch (e) {
      return Left<Failure, void>(
        ServerFailure('Could not add attendee: $e'),
      );
    }
  }

  @override
  Future<Either<Failure, void>> removeAttendee({
    required String eventId,
    required String attendeeId,
  }) async {
    try {
      await _remoteDataSource.removeAttendee(
        eventId: eventId,
        attendeeId: attendeeId,
      );
      return const Right<Failure, void>(null);
    } catch (e) {
      return Left<Failure, void>(
        ServerFailure('Could not remove attendee: $e'),
      );
    }
  }
}
