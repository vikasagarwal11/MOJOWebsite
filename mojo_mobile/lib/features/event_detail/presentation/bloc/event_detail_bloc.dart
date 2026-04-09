import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_stripe/flutter_stripe.dart';

import '../../data/datasources/event_detail_remote_datasource.dart';
import '../../domain/entities/attendee_entity.dart';
import '../../domain/entities/event_entity.dart';
import '../../domain/entities/payment_entity.dart';
import '../../domain/usecases/add_attendee_usecase.dart';
import '../../domain/usecases/get_attendees_usecase.dart';
import '../../domain/usecases/get_event_detail_usecase.dart';
import '../../domain/usecases/process_payment_usecase.dart';
import '../../domain/usecases/remove_attendee_usecase.dart';
import '../../domain/usecases/toggle_description_usecase.dart';

part 'event_detail_event.dart';
part 'event_detail_state.dart';

class EventDetailBloc extends Bloc<EventDetailEvent, EventDetailState> {
  EventDetailBloc({
    required GetEventDetailUseCase getEventDetailUseCase,
    required GetAttendeesUseCase getAttendeesUseCase,
    required ProcessPaymentUseCase processPaymentUseCase,
    required ToggleDescriptionUseCase toggleDescriptionUseCase,
    required AddAttendeeUseCase addAttendeeUseCase,
    required RemoveAttendeeUseCase removeAttendeeUseCase,
    required EventDetailRemoteDataSource remoteDataSource,
  })  : _getEventDetailUseCase = getEventDetailUseCase,
        _getAttendeesUseCase = getAttendeesUseCase,
        _processPaymentUseCase = processPaymentUseCase,
        _toggleDescriptionUseCase = toggleDescriptionUseCase,
        _addAttendeeUseCase = addAttendeeUseCase,
        _removeAttendeeUseCase = removeAttendeeUseCase,
        _remoteDataSource = remoteDataSource,
        super(const EventDetailInitial()) {
    on<LoadEventDetail>(_onLoadEventDetail);
    on<ToggleDescription>(_onToggleDescription);
    on<SwitchTab>(_onSwitchTab);
    on<ProcessPayment>(_onProcessPayment);
    on<AddAttendee>(_onAddAttendee);
    on<RemoveAttendee>(_onRemoveAttendee);
    on<RefreshAttendees>(_onRefreshAttendees);
  }

  final GetEventDetailUseCase _getEventDetailUseCase;
  final GetAttendeesUseCase _getAttendeesUseCase;
  final ProcessPaymentUseCase _processPaymentUseCase;
  final ToggleDescriptionUseCase _toggleDescriptionUseCase;
  final AddAttendeeUseCase _addAttendeeUseCase;
  final RemoveAttendeeUseCase _removeAttendeeUseCase;
  final EventDetailRemoteDataSource _remoteDataSource;

  Future<void> _onLoadEventDetail(
    LoadEventDetail event,
    Emitter<EventDetailState> emit,
  ) async {
    emit(const EventDetailLoading());

    final eventResult =
        await _getEventDetailUseCase(EventDetailParams(event.eventId));
    final attendeesResult =
        await _getAttendeesUseCase(EventAttendeesParams(event.eventId));

    eventResult.fold(
      (failure) => emit(EventDetailError(failure.message)),
      (eventData) {
        attendeesResult.fold(
          (failure) => emit(EventDetailError(failure.message)),
          (attendees) => emit(
            EventDetailLoaded(
              event: eventData,
              isDescriptionExpanded: false,
              activeTab: RsvpTabType.rsvp,
              attendees: attendees,
            ),
          ),
        );
      },
    );
  }

  void _onToggleDescription(
    ToggleDescription event,
    Emitter<EventDetailState> emit,
  ) {
    final current = state;
    if (current is! EventDetailLoaded) return;

    emit(
      current.copyWith(
        isDescriptionExpanded:
            _toggleDescriptionUseCase(current.isDescriptionExpanded),
      ),
    );
  }

  void _onSwitchTab(
    SwitchTab event,
    Emitter<EventDetailState> emit,
  ) {
    final current = state;
    if (current is! EventDetailLoaded) return;

    emit(current.copyWith(activeTab: event.tab, clearMessage: true));
  }

  Future<void> _onAddAttendee(
    AddAttendee event,
    Emitter<EventDetailState> emit,
  ) async {
    final current = state;
    if (current is! EventDetailLoaded) return;

    final result = await _addAttendeeUseCase(AddAttendeeParams(
      eventId: current.event.id,
      name: event.name,
      relationship: event.relationship,
      ageGroup: event.ageGroup,
    ));

    await result.fold(
      (failure) async {
        emit(current.copyWith(message: failure.message));
      },
      (_) async {
        // Refresh attendees after adding
        final attendeesResult = await _getAttendeesUseCase(
          EventAttendeesParams(current.event.id),
        );
        attendeesResult.fold(
          (failure) => emit(current.copyWith(message: failure.message)),
          (attendees) => emit(current.copyWith(attendees: attendees)),
        );
      },
    );
  }

  Future<void> _onRemoveAttendee(
    RemoveAttendee event,
    Emitter<EventDetailState> emit,
  ) async {
    final current = state;
    if (current is! EventDetailLoaded) return;

    final result = await _removeAttendeeUseCase(RemoveAttendeeParams(
      eventId: current.event.id,
      attendeeId: event.attendeeId,
    ));

    await result.fold(
      (failure) async {
        emit(current.copyWith(message: failure.message));
      },
      (_) async {
        // Refresh attendees after removing
        final attendeesResult = await _getAttendeesUseCase(
          EventAttendeesParams(current.event.id),
        );
        attendeesResult.fold(
          (failure) => emit(current.copyWith(message: failure.message)),
          (attendees) => emit(current.copyWith(attendees: attendees)),
        );
      },
    );
  }

  Future<void> _onRefreshAttendees(
    RefreshAttendees event,
    Emitter<EventDetailState> emit,
  ) async {
    final current = state;
    if (current is! EventDetailLoaded) return;

    final attendeesResult = await _getAttendeesUseCase(
      EventAttendeesParams(current.event.id),
    );
    attendeesResult.fold(
      (failure) => emit(current.copyWith(message: failure.message)),
      (attendees) => emit(current.copyWith(attendees: attendees)),
    );
  }

  Future<void> _onProcessPayment(
    ProcessPayment event,
    Emitter<EventDetailState> emit,
  ) async {
    final current = state;
    if (current is! EventDetailLoaded) return;

    final payables = current.attendees
        .where(
          (a) =>
              a.rsvpStatus == RsvpStatus.going &&
              (a.paymentStatus == PaymentStatus.unpaid ||
                  a.paymentStatus == PaymentStatus.pending),
        )
        .toList(growable: false);

    if (payables.isEmpty) {
      emit(
        PaymentError(
          event: current.event,
          isDescriptionExpanded: current.isDescriptionExpanded,
          activeTab: current.activeTab,
          attendees: current.attendees,
          payment: current.payment,
          message: 'No unpaid attendees found for payment.',
        ),
      );
      return;
    }

    // Calculate amount in cents, then convert to dollars for the existing API
    final amountCents =
        payables.fold<int>(0, (sum, item) => sum + item.amountCents);
    final amount = amountCents / 100;

    emit(
      PaymentProcessing(
        event: current.event,
        isDescriptionExpanded: current.isDescriptionExpanded,
        activeTab: current.activeTab,
        attendees: current.attendees,
        payment: current.payment,
      ),
    );

    final result = await _processPaymentUseCase(
      ProcessPaymentParams(
        eventId: current.event.id,
        attendeeIds: payables.map((p) => p.id).toList(growable: false),
        amount: amount,
      ),
    );

    await result.fold(
      (failure) async => emit(
        PaymentError(
          event: current.event,
          isDescriptionExpanded: current.isDescriptionExpanded,
          activeTab: current.activeTab,
          attendees: current.attendees,
          payment: current.payment,
          message: failure.message,
        ),
      ),
      (payment) async {
        // For Zelle/free/payThere — no Stripe sheet needed
        if (payment.clientSecret == null || payment.clientSecret!.isEmpty) {
          // Refresh attendees from Firestore to get real status
          final attendeesResult = await _getAttendeesUseCase(
            EventAttendeesParams(current.event.id),
          );
          final refreshed = attendeesResult.fold(
            (_) => current.attendees,
            (a) => a,
          );
          emit(PaymentSuccess(
            event: current.event,
            isDescriptionExpanded: current.isDescriptionExpanded,
            activeTab: current.activeTab,
            attendees: refreshed,
            payment: payment,
          ));
          return;
        }

        // Stripe flow: present the native Payment Sheet
        try {
          await Stripe.instance.initPaymentSheet(
            paymentSheetParameters: SetupPaymentSheetParameters(
              paymentIntentClientSecret: payment.clientSecret!,
              merchantDisplayName: 'Moms Fitness MOJO',
              style: ThemeMode.system,
              applePay: const PaymentSheetApplePay(merchantCountryCode: 'US'),
              googlePay: PaymentSheetGooglePay(
                merchantCountryCode: 'US',
                testEnv: kDebugMode,
              ),
            ),
          );

          await Stripe.instance.presentPaymentSheet();

          // Payment sheet completed — poll Firestore for webhook confirmation
          final attendeeIds = payables.map((p) => p.id).toList(growable: false);
          await _remoteDataSource.pollPaymentStatus(
            current.event.id,
            attendeeIds,
          );

          // Refresh attendees from Firestore to get real payment status
          final attendeesResult = await _getAttendeesUseCase(
            EventAttendeesParams(current.event.id),
          );
          final refreshed = attendeesResult.fold(
            (_) => current.attendees,
            (a) => a,
          );

          emit(PaymentSuccess(
            event: current.event,
            isDescriptionExpanded: current.isDescriptionExpanded,
            activeTab: current.activeTab,
            attendees: refreshed,
            payment: payment,
          ));
        } on StripeException catch (e) {
          // User cancelled or card declined
          final msg = e.error.localizedMessage ??
              'Payment was not completed. Your RSVP is saved as unpaid.';
          emit(PaymentError(
            event: current.event,
            isDescriptionExpanded: current.isDescriptionExpanded,
            activeTab: current.activeTab,
            attendees: current.attendees,
            payment: current.payment,
            message: msg,
          ));
        } catch (e) {
          emit(PaymentError(
            event: current.event,
            isDescriptionExpanded: current.isDescriptionExpanded,
            activeTab: current.activeTab,
            attendees: current.attendees,
            payment: current.payment,
            message: 'Payment error: $e',
          ));
        }
      },
    );
  }
}


