import 'package:dartz/dartz.dart';
import 'package:equatable/equatable.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/usecase/usecase.dart';
import '../entities/attendee_entity.dart';
import '../repositories/event_detail_repository.dart';

class GetAttendeesUseCase
    implements UseCase<List<AttendeeEntity>, EventAttendeesParams> {
  const GetAttendeesUseCase(this._repository);
  final EventDetailRepository _repository;
  @override
  Future<Either<Failure, List<AttendeeEntity>>> call(
    EventAttendeesParams params,
  ) {
    return _repository.getAttendees(params.eventId);
  }
}

class EventAttendeesParams extends Equatable {
  const EventAttendeesParams(this.eventId);
  final String eventId;
  @override
  List<Object?> get props => <Object?>[eventId];
}
