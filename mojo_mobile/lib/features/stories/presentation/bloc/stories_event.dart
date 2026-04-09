import 'package:equatable/equatable.dart';

abstract class StoriesEvent extends Equatable {
  const StoriesEvent();

  @override
  List<Object?> get props => <Object?>[];
}

class StoriesStarted extends StoriesEvent {
  const StoriesStarted({this.limit = 100});

  final int limit;

  @override
  List<Object?> get props => <Object?>[limit];
}
