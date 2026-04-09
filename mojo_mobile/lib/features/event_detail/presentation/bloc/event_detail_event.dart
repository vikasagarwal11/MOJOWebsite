part of 'event_detail_bloc.dart';

sealed class EventDetailEvent extends Equatable {
  const EventDetailEvent();
  @override
  List<Object?> get props => <Object?>[];
}

class LoadEventDetail extends EventDetailEvent {
  const LoadEventDetail(this.eventId);
  final String eventId;
  @override
  List<Object?> get props => <Object?>[eventId];
}

class ToggleDescription extends EventDetailEvent {
  const ToggleDescription();
}

class SwitchTab extends EventDetailEvent {
  const SwitchTab(this.tab);
  final RsvpTabType tab;
  @override
  List<Object?> get props => <Object?>[tab];
}

class ProcessPayment extends EventDetailEvent {
  const ProcessPayment();
}

class AddAttendee extends EventDetailEvent {
  const AddAttendee({
    required this.name,
    required this.relationship,
    required this.ageGroup,
  });
  final String name;
  final String relationship;
  final String ageGroup;
  @override
  List<Object?> get props => <Object?>[name, relationship, ageGroup];
}

class RemoveAttendee extends EventDetailEvent {
  const RemoveAttendee(this.attendeeId);
  final String attendeeId;
  @override
  List<Object?> get props => <Object?>[attendeeId];
}

class RefreshAttendees extends EventDetailEvent {
  const RefreshAttendees();
}

