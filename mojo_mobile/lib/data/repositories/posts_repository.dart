import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/mojo_post.dart';

class PostsRepository {
  PostsRepository(this._db);

  final FirebaseFirestore _db;

  /// Guest-safe query uses [isPublic]; approved members use full feed ordered by [createdAt].
  Stream<List<MojoPost>> watchFeed({required bool useMemberFeed}) {
    final col = _db.collection('posts');
    final q = useMemberFeed
        ? col.orderBy('createdAt', descending: true).limit(50)
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
