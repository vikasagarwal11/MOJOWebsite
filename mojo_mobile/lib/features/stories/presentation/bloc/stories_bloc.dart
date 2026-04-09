import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/story.dart';
import '../../domain/usecases/watch_recent_stories.dart';
import 'stories_event.dart';
import 'stories_state.dart';

class StoriesBloc extends Bloc<StoriesEvent, StoriesState> {
  StoriesBloc({required WatchRecentStories watchRecentStories})
      : _watchRecentStories = watchRecentStories,
        super(const StoriesInitial()) {
    on<StoriesStarted>(_onStarted);
    on<_StoriesUpdated>(_onStoriesUpdated);
    on<_StoriesErrored>(_onStoriesErrored);
  }

  final WatchRecentStories _watchRecentStories;
  StreamSubscription<List<Story>>? _storiesSubscription;

  Future<void> _onStarted(StoriesStarted event, Emitter<StoriesState> emit) async {
    emit(const StoriesLoading());
    await _storiesSubscription?.cancel();

    _storiesSubscription = _watchRecentStories(limit: event.limit).listen(
      (List<Story> stories) {
        add(_StoriesUpdated(stories));
      },
      onError: (Object error, StackTrace stackTrace) {
        add(_StoriesErrored(error.toString()));
      },
    );
  }

  void _onStoriesUpdated(_StoriesUpdated event, Emitter<StoriesState> emit) {
    emit(StoriesLoaded(event.stories));
  }

  void _onStoriesErrored(_StoriesErrored event, Emitter<StoriesState> emit) {
    emit(StoriesFailure(event.message));
  }

  @override
  Future<void> close() async {
    await _storiesSubscription?.cancel();
    return super.close();
  }
}

class _StoriesUpdated extends StoriesEvent {
  const _StoriesUpdated(this.stories);

  final List<Story> stories;

  @override
  List<Object?> get props => <Object?>[stories];
}

class _StoriesErrored extends StoriesEvent {
  const _StoriesErrored(this.message);

  final String message;

  @override
  List<Object?> get props => <Object?>[message];
}
