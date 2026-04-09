import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:get_it/get_it.dart';

import 'data/datasources/comment_remote_datasource.dart';
import 'data/datasources/event_detail_remote_datasource.dart';
import 'data/repositories/event_detail_repository_impl.dart';
import 'domain/repositories/event_detail_repository.dart';
import 'domain/usecases/add_attendee_usecase.dart';
import 'domain/usecases/get_attendees_usecase.dart';
import 'domain/usecases/get_event_detail_usecase.dart';
import 'domain/usecases/process_payment_usecase.dart';
import 'domain/usecases/remove_attendee_usecase.dart';
import 'domain/usecases/toggle_description_usecase.dart';
import 'presentation/bloc/event_detail_bloc.dart';

final GetIt eventDetailSl = GetIt.instance;

class EventDetailInjection {
  static bool _initialized = false;

  static void ensureInitialized() {
    if (_initialized) return;

    if (!eventDetailSl.isRegistered<FirebaseFirestore>()) {
      eventDetailSl.registerLazySingleton<FirebaseFirestore>(
        () => FirebaseFirestore.instance,
      );
    }
    if (!eventDetailSl.isRegistered<FirebaseFunctions>()) {
      eventDetailSl.registerLazySingleton<FirebaseFunctions>(
        () => FirebaseFunctions.instanceFor(region: 'us-east1'),
      );
    }

    eventDetailSl.registerLazySingleton<EventDetailRemoteDataSource>(
      () => EventDetailRemoteDataSourceImpl(
        firestore: eventDetailSl<FirebaseFirestore>(),
        functions: eventDetailSl<FirebaseFunctions>(),
      ),
    );

    eventDetailSl.registerLazySingleton<EventDetailRepository>(
      () => EventDetailRepositoryImpl(
        eventDetailSl<EventDetailRemoteDataSource>(),
      ),
    );

    eventDetailSl.registerLazySingleton<GetEventDetailUseCase>(
      () => GetEventDetailUseCase(eventDetailSl<EventDetailRepository>()),
    );
    eventDetailSl.registerLazySingleton<GetAttendeesUseCase>(
      () => GetAttendeesUseCase(eventDetailSl<EventDetailRepository>()),
    );
    eventDetailSl.registerLazySingleton<ProcessPaymentUseCase>(
      () => ProcessPaymentUseCase(eventDetailSl<EventDetailRepository>()),
    );
    eventDetailSl.registerLazySingleton<AddAttendeeUseCase>(
      () => AddAttendeeUseCase(eventDetailSl<EventDetailRepository>()),
    );
    eventDetailSl.registerLazySingleton<RemoveAttendeeUseCase>(
      () => RemoveAttendeeUseCase(eventDetailSl<EventDetailRepository>()),
    );
    eventDetailSl.registerLazySingleton<ToggleDescriptionUseCase>(
      () => const ToggleDescriptionUseCase(),
    );

    eventDetailSl.registerFactory<EventDetailBloc>(
      () => EventDetailBloc(
        getEventDetailUseCase: eventDetailSl<GetEventDetailUseCase>(),
        getAttendeesUseCase: eventDetailSl<GetAttendeesUseCase>(),
        processPaymentUseCase: eventDetailSl<ProcessPaymentUseCase>(),
        toggleDescriptionUseCase: eventDetailSl<ToggleDescriptionUseCase>(),
        addAttendeeUseCase: eventDetailSl<AddAttendeeUseCase>(),
        removeAttendeeUseCase: eventDetailSl<RemoveAttendeeUseCase>(),
        remoteDataSource: eventDetailSl<EventDetailRemoteDataSource>(),
      ),
    );

    if (!eventDetailSl.isRegistered<CommentRemoteDataSource>()) {
      eventDetailSl.registerLazySingleton<CommentRemoteDataSource>(
        () => CommentRemoteDataSourceImpl(
          firestore: eventDetailSl<FirebaseFirestore>(),
        ),
      );
    }

    _initialized = true;
  }
}
