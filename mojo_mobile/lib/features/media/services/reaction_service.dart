import 'package:cloud_firestore/cloud_firestore.dart';

/// Handles atomic like/unlike toggling on media documents.
class ReactionService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  /// Toggles a like for [uid] on the media document [mediaId].
  ///
  /// Uses a Firestore transaction to atomically read the current state,
  /// then either add or remove the UID from the `likes` array and
  /// increment or decrement `likesCount`.
  ///
  /// Returns the updated `(likesCount, isLiked)` tuple.
  Future<(int, bool)> toggleLike(String mediaId, String uid) async {
    final docRef = _db.collection('media').doc(mediaId);

    return _db.runTransaction<(int, bool)>((transaction) async {
      final snapshot = await transaction.get(docRef);
      if (!snapshot.exists) {
        throw Exception('Media document $mediaId does not exist');
      }

      final data = snapshot.data() as Map<String, dynamic>;
      final likes = List<String>.from(
        (data['likes'] as List<dynamic>?) ?? <String>[],
      );
      final currentCount = (data['likesCount'] as num?)?.toInt() ?? 0;

      if (likes.contains(uid)) {
        // Unlike
        transaction.update(docRef, {
          'likes': FieldValue.arrayRemove([uid]),
          'likesCount': FieldValue.increment(-1),
        });
        final newCount = (currentCount - 1).clamp(0, currentCount);
        return (newCount, false);
      } else {
        // Like
        transaction.update(docRef, {
          'likes': FieldValue.arrayUnion([uid]),
          'likesCount': FieldValue.increment(1),
        });
        return (currentCount + 1, true);
      }
    });
  }
}
