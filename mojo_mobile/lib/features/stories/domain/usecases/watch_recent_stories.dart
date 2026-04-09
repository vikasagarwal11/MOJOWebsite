import '../entities/story.dart';
import '../repositories/stories_repository.dart';

class WatchRecentStories {
  const WatchRecentStories(this._repository);

  final StoriesRepository _repository;

  Stream<List<Story>> call({int limit = 100}) {
    return _repository.watchRecentStories(limit: limit);
  }
}
