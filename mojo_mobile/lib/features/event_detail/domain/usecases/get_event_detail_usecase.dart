import 'package:dartz/dartz.dart';
import 'package:equatable/equatable.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/usecase/usecase.dart';
import '../entities/event_entity.dart';
import '../repositories/event_detail_repository.dart';

class GetEventDetailUseCase implements UseCase<EventEntity, EventDetailParams> {
  const GetEventDetailUseCase(this._repository);
  final EventDetailRepository _repository;
  @override
  Future<Either<Failure, EventEntity>> call(EventDetailParams params) {
    return _repository.getEventDetail(params.eventId);
  }
}

class EventDetailParams extends Equatable {
  const EventDetailParams(this.eventId);
  final String eventId;
  @override
  List<Object?> get props => <Object?>[eventId];
}
