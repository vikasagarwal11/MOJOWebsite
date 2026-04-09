import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/comment_model.dart';

/// Abstract interface for comment-related Firestore operations.
abstract class CommentRemoteDataSource {
  Stream<int> watchCommentCount(String eventId);

  Stream<List<CommentModel>> watchTopLevelComments(
    String eventId, {
    int pageSize = 10,
  });

  Future<List<CommentModel>> fetchMoreComments(
    String eventId, {
    required DocumentSnapshot lastDocument,
    int pageSize = 10,
  });

  Future<List<CommentModel>> fetchReplies(
    String eventId,
    String parentCommentId,
  );

  Future<void> addComment(
    String eventId, {
    required String text,
    required String authorId,
    required String authorName,
    String? parentCommentId,
    int threadLevel = 0,
  });

  Future<void> deleteComment(String eventId, String commentId);

  Future<void> deleteThread(String eventId, String commentId);

  Future<void> toggleLike(
    String eventId,
    String commentId,
    String userId,
  );

  Future<void> toggleReaction(
    String eventId,
    String commentId,
    String userId,
    String emoji,
  );

  Stream<int> watchLikeCount(String eventId, String commentId);

  Stream<bool> watchUserLiked(
    String eventId,
    String commentId,
    String userId,
  );

  Stream<Map<String, int>> watchReactionCounts(
    String eventId,
    String commentId,
  );

  Stream<Set<String>> watchUserReactions(
    String eventId,
    String commentId,
    String userId,
  );
}

/// Firestore implementation of [CommentRemoteDataSource].
class CommentRemoteDataSourceImpl implements CommentRemoteDataSource {
  CommentRemoteDataSourceImpl({required FirebaseFirestore firestore})
      : _firestore = firestore;

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> _commentsRef(String eventId) =>
      _firestore.collection('events').doc(eventId).collection('comments');

  @override
  Stream<int> watchCommentCount(String eventId) {
    return _commentsRef(eventId).snapshots().map((snap) => snap.size);
  }

  @override
  Stream<List<CommentModel>> watchTopLevelComments(
    String eventId, {
    int pageSize = 10,
  }) {
    return _commentsRef(eventId)
        .where('threadLevel', isEqualTo: 0)
        .orderBy('createdAt', descending: true)
        .limit(pageSize)
        .snapshots()
        .map((snap) =>
            snap.docs.map((doc) => CommentModel.fromSnapshot(doc)).toList());
  }

  @override
  Future<List<CommentModel>> fetchMoreComments(
    String eventId, {
    required DocumentSnapshot lastDocument,
    int pageSize = 10,
  }) async {
    final snap = await _commentsRef(eventId)
        .where('threadLevel', isEqualTo: 0)
        .orderBy('createdAt', descending: true)
        .startAfterDocument(lastDocument)
        .limit(pageSize)
        .get();
    return snap.docs.map((doc) => CommentModel.fromSnapshot(doc)).toList();
  }

  @override
  Future<List<CommentModel>> fetchReplies(
    String eventId,
    String parentCommentId,
  ) async {
    final snap = await _commentsRef(eventId)
        .where('parentCommentId', isEqualTo: parentCommentId)
        .orderBy('createdAt', descending: false)
        .get();
    return snap.docs.map((doc) => CommentModel.fromSnapshot(doc)).toList();
  }

  @override
  Future<void> addComment(
    String eventId, {
    required String text,
    required String authorId,
    required String authorName,
    String? parentCommentId,
    int threadLevel = 0,
  }) async {
    final model = CommentModel(
      id: '',
      text: text,
      authorId: authorId,
      authorName: authorName,
      createdAt: null,
      parentCommentId: parentCommentId,
      threadLevel: threadLevel,
      replyCount: 0,
      moderationStatus: 'pending',
    );
    await _commentsRef(eventId).add(model.toFirestoreMap());
  }

  @override
  Future<void> deleteComment(String eventId, String commentId) async {
    await _commentsRef(eventId).doc(commentId).delete();
  }

  @override
  Future<void> deleteThread(String eventId, String commentId) async {
    final batch = _firestore.batch();
    final commentRef = _commentsRef(eventId).doc(commentId);

    // Delete likes subcollection
    final likes = await commentRef.collection('likes').get();
    for (final doc in likes.docs) {
      batch.delete(doc.reference);
    }

    // Delete reactions subcollection
    final reactions = await commentRef.collection('reactions').get();
    for (final doc in reactions.docs) {
      batch.delete(doc.reference);
    }

    // Delete all replies and their subcollections
    final replies = await _commentsRef(eventId)
        .where('parentCommentId', isEqualTo: commentId)
        .get();
    for (final replyDoc in replies.docs) {
      final replyLikes = await replyDoc.reference.collection('likes').get();
      for (final doc in replyLikes.docs) {
        batch.delete(doc.reference);
      }
      final replyReactions =
          await replyDoc.reference.collection('reactions').get();
      for (final doc in replyReactions.docs) {
        batch.delete(doc.reference);
      }
      batch.delete(replyDoc.reference);
    }

    // Delete the comment itself
    batch.delete(commentRef);
    await batch.commit();
  }

  @override
  Future<void> toggleLike(
    String eventId,
    String commentId,
    String userId,
  ) async {
    final likeRef =
        _commentsRef(eventId).doc(commentId).collection('likes').doc(userId);
    final doc = await likeRef.get();
    if (doc.exists) {
      await likeRef.delete();
    } else {
      await likeRef.set({
        'userId': userId,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  @override
  Future<void> toggleReaction(
    String eventId,
    String commentId,
    String userId,
    String emoji,
  ) async {
    final docId = '${userId}_$emoji';
    final reactionRef =
        _commentsRef(eventId).doc(commentId).collection('reactions').doc(docId);
    final doc = await reactionRef.get();
    if (doc.exists) {
      await reactionRef.delete();
    } else {
      await reactionRef.set({
        'userId': userId,
        'emoji': emoji,
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  @override
  Stream<int> watchLikeCount(String eventId, String commentId) {
    return _commentsRef(eventId)
        .doc(commentId)
        .collection('likes')
        .snapshots()
        .map((snap) => snap.size);
  }

  @override
  Stream<bool> watchUserLiked(
    String eventId,
    String commentId,
    String userId,
  ) {
    return _commentsRef(eventId)
        .doc(commentId)
        .collection('likes')
        .doc(userId)
        .snapshots()
        .map((snap) => snap.exists);
  }

  @override
  Stream<Map<String, int>> watchReactionCounts(
    String eventId,
    String commentId,
  ) {
    return _commentsRef(eventId)
        .doc(commentId)
        .collection('reactions')
        .snapshots()
        .map((snap) {
      final counts = <String, int>{};
      for (final doc in snap.docs) {
        final emoji = (doc.data()['emoji'] as String?) ?? '';
        if (emoji.isNotEmpty) {
          counts[emoji] = (counts[emoji] ?? 0) + 1;
        }
      }
      return counts;
    });
  }

  @override
  Stream<Set<String>> watchUserReactions(
    String eventId,
    String commentId,
    String userId,
  ) {
    return _commentsRef(eventId)
        .doc(commentId)
        .collection('reactions')
        .where('userId', isEqualTo: userId)
        .snapshots()
        .map((snap) {
      return snap.docs
          .map((doc) => (doc.data()['emoji'] as String?) ?? '')
          .where((e) => e.isNotEmpty)
          .toSet();
    });
  }
}
