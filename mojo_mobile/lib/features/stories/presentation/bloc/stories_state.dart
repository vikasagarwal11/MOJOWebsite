import 'package:equatable/equatable.dart';

import '../../domain/entities/story.dart';

abstract class StoriesState extends Equatable {
  const StoriesState();

  @override
  List<Object?> get props => <Object?>[];
}

class StoriesInitial extends StoriesState {
  const StoriesInitial();
}

class StoriesLoading extends StoriesState {
  const StoriesLoading();
}

class StoriesLoaded extends StoriesState {
  const StoriesLoaded(this.stories);

  final List<Story> stories;

  @override
  List<Object?> get props => <Object?>[stories];
}

class StoriesFailure extends StoriesState {
  const StoriesFailure(this.message);

  final String message;

  @override
  List<Object?> get props => <Object?>[message];
}
