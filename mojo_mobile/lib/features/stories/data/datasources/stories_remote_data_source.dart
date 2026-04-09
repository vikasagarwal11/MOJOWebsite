import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/story_model.dart';

class StoriesRemoteDataSource {
  const StoriesRemoteDataSource(this._firestore);

  final FirebaseFirestore _firestore;

  Stream<List<StoryModel>> watchRecentStories({int limit = 100}) {
    return _firestore
        .collection('stories')
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .snapshots()
        .map((QuerySnapshot<Map<String, dynamic>> snap) {
      final DateTime now = DateTime.now();
      return snap.docs
          .map(StoryModel.fromDoc)
          .where((StoryModel story) => story.userId.isNotEmpty && story.url.isNotEmpty)
          .where((StoryModel story) => story.isActiveAt(now))
          .toList(growable: false);
    });
  }
}
