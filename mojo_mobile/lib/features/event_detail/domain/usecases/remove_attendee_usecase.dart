import 'package:dartz/dartz.dart';
import 'package:equatable/equatable.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/usecase/usecase.dart';
import '../repositories/event_detail_repository.dart';

class RemoveAttendeeUseCase implements UseCase<void, RemoveAttendeeParams> {
  const RemoveAttendeeUseCase(this._repository);
  final EventDetailRepository _repository;

  @override
  Future<Either<Failure, void>> call(RemoveAttendeeParams params) {
    return _repository.removeAttendee(
      eventId: params.eventId,
      attendeeId: params.attendeeId,
    );
  }
}

class RemoveAttendeeParams extends Equatable {
  const RemoveAttendeeParams({
    required this.eventId,
    required this.attendeeId,
  });
  final String eventId;
  final String attendeeId;

  @override
  List<Object?> get props => <Object?>[eventId, attendeeId];
}
