import 'package:equatable/equatable.dart';

class CommentEntity extends Equatable {
  const CommentEntity({
    required this.id,
    required this.text,
    required this.authorId,
    required this.authorName,
    required this.createdAt,
    required this.parentCommentId,
    required this.threadLevel,
    required this.replyCount,
    required this.moderationStatus,
    this.mediaUrls = const [],
  });

  final String id;
  final String text;
  final String authorId;
  final String authorName;
  final DateTime? createdAt;
  final String? parentCommentId;
  final int threadLevel;
  final int replyCount;
  final String moderationStatus;
  final List<String> mediaUrls;

  @override
  List<Object?> get props => <Object?>[
        id,
        text,
        authorId,
        authorName,
        createdAt,
        parentCommentId,
        threadLevel,
        replyCount,
        moderationStatus,
        mediaUrls,
      ];
}
