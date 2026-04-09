part of 'comment_bloc.dart';

sealed class CommentState extends Equatable {
  const CommentState();

  @override
  List<Object?> get props => [];
}

class CommentInitial extends CommentState {
  const CommentInitial();
}

class CommentLoaded extends CommentState {
  const CommentLoaded({
    this.comments = const [],
    this.replies = const {},
    this.expandedThreads = const {},
    this.replyingToCommentId,
    this.isExpanded = false,
    this.hasMore = true,
    this.totalCommentCount = 0,
    this.isSubmitting = false,
    this.errorMessage,
    this.optimisticLikes = const {},
    this.optimisticLikeCounts = const {},
    this.optimisticReactions = const {},
    this.optimisticUserReactions = const {},
  });

  final List<CommentEntity> comments;
  final Map<String, List<CommentEntity>> replies;
  final Set<String> expandedThreads;
  final String? replyingToCommentId;
  final bool isExpanded;
  final bool hasMore;
  final int totalCommentCount;
  final bool isSubmitting;
  final String? errorMessage;
  final Map<String, bool> optimisticLikes;
  final Map<String, int> optimisticLikeCounts;
  final Map<String, Map<String, int>> optimisticReactions;
  final Map<String, Set<String>> optimisticUserReactions;

  CommentLoaded copyWith({
    List<CommentEntity>? comments,
    Map<String, List<CommentEntity>>? replies,
    Set<String>? expandedThreads,
    String? replyingToCommentId,
    bool clearReplyingTo = false,
    bool? isExpanded,
    bool? hasMore,
    int? totalCommentCount,
    bool? isSubmitting,
    String? errorMessage,
    bool clearError = false,
    Map<String, bool>? optimisticLikes,
    Map<String, int>? optimisticLikeCounts,
    Map<String, Map<String, int>>? optimisticReactions,
    Map<String, Set<String>>? optimisticUserReactions,
  }) {
    return CommentLoaded(
      comments: comments ?? this.comments,
      replies: replies ?? this.replies,
      expandedThreads: expandedThreads ?? this.expandedThreads,
      replyingToCommentId: clearReplyingTo
          ? null
          : (replyingToCommentId ?? this.replyingToCommentId),
      isExpanded: isExpanded ?? this.isExpanded,
      hasMore: hasMore ?? this.hasMore,
      totalCommentCount: totalCommentCount ?? this.totalCommentCount,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      optimisticLikes: optimisticLikes ?? this.optimisticLikes,
      optimisticLikeCounts: optimisticLikeCounts ?? this.optimisticLikeCounts,
      optimisticReactions: optimisticReactions ?? this.optimisticReactions,
      optimisticUserReactions:
          optimisticUserReactions ?? this.optimisticUserReactions,
    );
  }

  @override
  List<Object?> get props => [
        comments,
        replies,
        expandedThreads,
        replyingToCommentId,
        isExpanded,
        hasMore,
        totalCommentCount,
        isSubmitting,
        errorMessage,
        optimisticLikes,
        optimisticLikeCounts,
        optimisticReactions,
        optimisticUserReactions,
      ];
}

class CommentError extends CommentState {
  const CommentError({required this.message});

  final String message;

  @override
  List<Object?> get props => [message];
}

