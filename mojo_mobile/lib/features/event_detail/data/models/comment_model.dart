import 'package:cloud_firestore/cloud_firestore.dart';

import '../../domain/entities/comment_entity.dart';

class CommentModel extends CommentEntity {
  const CommentModel({
    required super.id,
    required super.text,
    required super.authorId,
    required super.authorName,
    required super.createdAt,
    required super.parentCommentId,
    required super.threadLevel,
    required super.replyCount,
    required super.moderationStatus,
    super.mediaUrls,
    this.documentSnapshot,
  });

  final DocumentSnapshot? documentSnapshot;

  factory CommentModel.fromSnapshot(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return CommentModel(
      id: doc.id,
      text: (data['text'] as String?) ?? '',
      authorId: (data['authorId'] as String?) ?? '',
      authorName: (data['authorName'] as String?) ?? 'Member',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      parentCommentId: data['parentCommentId'] as String?,
      threadLevel: (data['threadLevel'] as num?)?.toInt() ?? 0,
      replyCount: (data['replyCount'] as num?)?.toInt() ?? 0,
      moderationStatus: (data['moderationStatus'] as String?) ?? 'pending',
      mediaUrls: List<String>.from(data['mediaUrls'] ?? []),
      documentSnapshot: doc,
    );
  }

  Map<String, dynamic> toFirestoreMap() => {
        'text': text,
        'authorId': authorId,
        'authorName': authorName,
        'createdAt': FieldValue.serverTimestamp(),
        'parentCommentId': parentCommentId,
        'threadLevel': threadLevel,
        'replyCount': replyCount,
        'moderationStatus': moderationStatus,
        'mediaUrls': mediaUrls,
      };
}
