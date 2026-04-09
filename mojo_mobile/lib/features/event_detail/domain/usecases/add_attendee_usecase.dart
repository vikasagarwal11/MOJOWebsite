import 'package:dartz/dartz.dart';
import 'package:equatable/equatable.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/usecase/usecase.dart';
import '../repositories/event_detail_repository.dart';

class AddAttendeeUseCase implements UseCase<void, AddAttendeeParams> {
  const AddAttendeeUseCase(this._repository);
  final EventDetailRepository _repository;

  @override
  Future<Either<Failure, void>> call(AddAttendeeParams params) {
    return _repository.addAttendee(
      eventId: params.eventId,
      name: params.name,
      relationship: params.relationship,
      ageGroup: params.ageGroup,
    );
  }
}

class AddAttendeeParams extends Equatable {
  const AddAttendeeParams({
    required this.eventId,
    required this.name,
    required this.relationship,
    required this.ageGroup,
  });
  final String eventId;
  final String name;
  final String relationship;
  final String ageGroup;

  @override
  List<Object?> get props => <Object?>[eventId, name, relationship, ageGroup];
}
