part of 'comment_bloc.dart';

sealed class CommentEvent extends Equatable {
  const CommentEvent();

  @override
  List<Object?> get props => [];
}

class LoadComments extends CommentEvent {
  const LoadComments();
}

class LoadMoreComments extends CommentEvent {
  const LoadMoreComments();
}

class ToggleCommentSection extends CommentEvent {
  const ToggleCommentSection();
}

class PostComment extends CommentEvent {
  const PostComment({
    required this.text,
    required this.authorId,
    required this.authorName,
  });

  final String text;
  final String authorId;
  final String authorName;

  @override
  List<Object?> get props => [text, authorId, authorName];
}

class PostReply extends CommentEvent {
  const PostReply({
    required this.text,
    required this.authorId,
    required this.authorName,
    required this.parentCommentId,
  });

  final String text;
  final String authorId;
  final String authorName;
  final String parentCommentId;

  @override
  List<Object?> get props => [text, authorId, authorName, parentCommentId];
}

class DeleteComment extends CommentEvent {
  const DeleteComment({required this.commentId});

  final String commentId;

  @override
  List<Object?> get props => [commentId];
}

class DeleteThread extends CommentEvent {
  const DeleteThread({required this.commentId});

  final String commentId;

  @override
  List<Object?> get props => [commentId];
}

class ToggleLike extends CommentEvent {
  const ToggleLike({required this.commentId, required this.userId});

  final String commentId;
  final String userId;

  @override
  List<Object?> get props => [commentId, userId];
}

class ToggleReaction extends CommentEvent {
  const ToggleReaction({
    required this.commentId,
    required this.userId,
    required this.emoji,
  });

  final String commentId;
  final String userId;
  final String emoji;

  @override
  List<Object?> get props => [commentId, userId, emoji];
}

class ExpandThread extends CommentEvent {
  const ExpandThread({required this.commentId});

  final String commentId;

  @override
  List<Object?> get props => [commentId];
}

class CollapseThread extends CommentEvent {
  const CollapseThread({required this.commentId});

  final String commentId;

  @override
  List<Object?> get props => [commentId];
}

class StartReply extends CommentEvent {
  const StartReply({required this.commentId});

  final String commentId;

  @override
  List<Object?> get props => [commentId];
}

class CancelReply extends CommentEvent {
  const CancelReply();
}

/// Internal event emitted when the comment count stream updates.
class _CommentCountUpdated extends CommentEvent {
  const _CommentCountUpdated(this.count);

  final int count;

  @override
  List<Object?> get props => [count];
}

/// Internal event emitted when the comments stream updates.
class _CommentsUpdated extends CommentEvent {
  const _CommentsUpdated(this.comments);

  final List<CommentModel> comments;

  @override
  List<Object?> get props => [comments];
}

