import '../../domain/entities/story.dart';
import '../../domain/repositories/stories_repository.dart';
import '../datasources/stories_remote_data_source.dart';

class StoriesRepositoryImpl implements StoriesRepository {
  const StoriesRepositoryImpl({required StoriesRemoteDataSource remoteDataSource})
      : _remoteDataSource = remoteDataSource;

  final StoriesRemoteDataSource _remoteDataSource;

  @override
  Stream<List<Story>> watchRecentStories({int limit = 100}) {
    return _remoteDataSource.watchRecentStories(limit: limit);
  }
}
