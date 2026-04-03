import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/mojo_post.dart';

class PostsRepository {
  PostsRepository(this._db);

  final FirebaseFirestore _db;

  /// Guest-safe query uses [isPublic]; approved members query rows that match
  /// [firestore.rules] read rules (cannot use a bare `orderBy(createdAt)` —
  /// that can return others' pending posts and Firestore rejects the whole query
  /// with PERMISSION_DENIED).
  Stream<List<MojoPost>> watchFeed({required bool useMemberFeed}) {
    final col = _db.collection('posts');
    final Query<Map<String, dynamic>> q = useMemberFeed
        ? col
            .where(
              Filter.or(
                Filter('moderationStatus', isEqualTo: 'approved'),
                Filter('moderationStatus', isNull: true),
              ),
            )
            .orderBy('createdAt', descending: true)
            .limit(50)
        : col
            .where('isPublic', isEqualTo: true)
            .orderBy('createdAt', descending: true)
            .limit(50);

    return q.snapshots().map((snap) {
      return snap.docs
          .map(MojoPost.fromDoc)
          .where((p) => p.isFeedVisible)
          .toList();
    });
  }
}
