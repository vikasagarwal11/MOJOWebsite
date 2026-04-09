part of 'event_detail_bloc.dart';

sealed class EventDetailState extends Equatable {
  const EventDetailState();
  @override
  List<Object?> get props => <Object?>[];
}

class EventDetailInitial extends EventDetailState {
  const EventDetailInitial();
}

class EventDetailLoading extends EventDetailState {
  const EventDetailLoading();
}

class EventDetailLoaded extends EventDetailState {
  const EventDetailLoaded({
    required this.event,
    required this.isDescriptionExpanded,
    required this.activeTab,
    required this.attendees,
    this.payment,
    this.message,
  });
  final EventEntity event;
  final bool isDescriptionExpanded;
  final RsvpTabType activeTab;
  final List<AttendeeEntity> attendees;
  final PaymentEntity? payment;
  final String? message;
  EventDetailLoaded copyWith({
    EventEntity? event,
    bool? isDescriptionExpanded,
    RsvpTabType? activeTab,
    List<AttendeeEntity>? attendees,
    PaymentEntity? payment,
    String? message,
    bool clearMessage = false,
  }) {
    return EventDetailLoaded(
      event: event ?? this.event,
      isDescriptionExpanded:
          isDescriptionExpanded ?? this.isDescriptionExpanded,
      activeTab: activeTab ?? this.activeTab,
      attendees: attendees ?? this.attendees,
      payment: payment ?? this.payment,
      message: clearMessage ? null : (message ?? this.message),
    );
  }

  @override
  List<Object?> get props => <Object?>[
        event,
        isDescriptionExpanded,
        activeTab,
        attendees,
        payment,
        message,
      ];
}

class EventDetailError extends EventDetailState {
  const EventDetailError(this.message);
  final String message;
  @override
  List<Object?> get props => <Object?>[message];
}

class PaymentProcessing extends EventDetailLoaded {
  const PaymentProcessing({
    required super.event,
    required super.isDescriptionExpanded,
    required super.activeTab,
    required super.attendees,
    super.payment,
  });
}

class PaymentSuccess extends EventDetailLoaded {
  const PaymentSuccess({
    required super.event,
    required super.isDescriptionExpanded,
    required super.activeTab,
    required super.attendees,
    required super.payment,
  });
}

class PaymentError extends EventDetailLoaded {
  const PaymentError({
    required super.event,
    required super.isDescriptionExpanded,
    required super.activeTab,
    required super.attendees,
    required String message,
    super.payment,
  }) : super(message: message);
}

