import '../entities/story.dart';

abstract class StoriesRepository {
  Stream<List<Story>> watchRecentStories({int limit = 100});
}
