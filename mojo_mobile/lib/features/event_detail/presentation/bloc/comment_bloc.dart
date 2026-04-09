import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../data/datasources/comment_remote_datasource.dart';
import '../../data/models/comment_model.dart';
import '../../domain/entities/comment_entity.dart';

part 'comment_event.dart';
part 'comment_state.dart';

class CommentBloc extends Bloc<CommentEvent, CommentState> {
  CommentBloc({
    required CommentRemoteDataSource dataSource,
    required String eventId,
  })  : _dataSource = dataSource,
        _eventId = eventId,
        super(const CommentInitial()) {
    on<LoadComments>(_onLoadComments);
    on<LoadMoreComments>(_onLoadMoreComments);
    on<ToggleCommentSection>(_onToggleCommentSection);
    on<PostComment>(_onPostComment);
    on<PostReply>(_onPostReply);
    on<DeleteComment>(_onDeleteComment);
    on<DeleteThread>(_onDeleteThread);
    on<ToggleLike>(_onToggleLike);
    on<ToggleReaction>(_onToggleReaction);
    on<ExpandThread>(_onExpandThread);
    on<CollapseThread>(_onCollapseThread);
    on<StartReply>(_onStartReply);
    on<CancelReply>(_onCancelReply);
    on<_CommentCountUpdated>(_onCommentCountUpdated);
    on<_CommentsUpdated>(_onCommentsUpdated);

    // Always listen to comment count
    _countSub = _dataSource.watchCommentCount(_eventId).listen(
          (count) => add(_CommentCountUpdated(count)),
        );
  }

  final CommentRemoteDataSource _dataSource;
  final String _eventId;

  StreamSubscription<int>? _countSub;
  StreamSubscription<List<CommentModel>>? _commentsSub;

  void _onCommentCountUpdated(
    _CommentCountUpdated event,
    Emitter<CommentState> emit,
  ) {
    final current = state;
    if (current is CommentLoaded) {
      emit(current.copyWith(totalCommentCount: event.count));
    } else {
      emit(CommentLoaded(totalCommentCount: event.count));
    }
  }

  void _onCommentsUpdated(
    _CommentsUpdated event,
    Emitter<CommentState> emit,
  ) {
    final current = state;
    if (current is CommentLoaded) {
      emit(current.copyWith(
        comments: event.comments,
        hasMore: event.comments.length >= 10,
        clearError: true,
      ));
    }
  }

  void _onToggleCommentSection(
    ToggleCommentSection event,
    Emitter<CommentState> emit,
  ) {
    final current = state;
    if (current is CommentLoaded) {
      final expanding = !current.isExpanded;
      if (expanding) {
        _subscribeToComments();
      } else {
        _commentsSub?.cancel();
        _commentsSub = null;
      }
      emit(current.copyWith(isExpanded: expanding));
    } else {
      _subscribeToComments();
      emit(const CommentLoaded(isExpanded: true));
    }
  }

  void _subscribeToComments() {
    _commentsSub?.cancel();
    _commentsSub = _dataSource.watchTopLevelComments(_eventId).listen(
          (comments) => add(_CommentsUpdated(comments)),
        );
  }

  void _onLoadComments(
    LoadComments event,
    Emitter<CommentState> emit,
  ) {
    _subscribeToComments();
    final current = state;
    if (current is CommentLoaded) {
      emit(current.copyWith(isExpanded: true));
    } else {
      emit(const CommentLoaded(isExpanded: true));
    }
  }

  Future<void> _onLoadMoreComments(
    LoadMoreComments event,
    Emitter<CommentState> emit,
  ) async {
    final current = state;
    if (current is! CommentLoaded || current.comments.isEmpty) return;

    final lastComment = current.comments.last;
    if (lastComment is! CommentModel) return;
    final lastDoc = lastComment.documentSnapshot;
    if (lastDoc == null) return;

    try {
      final more = await _dataSource.fetchMoreComments(
        _eventId,
        lastDocument: lastDoc,
      );
      final allComments = [...current.comments, ...more];
      emit(current.copyWith(
        comments: allComments,
        hasMore: more.length >= 10,
      ));
    } catch (e) {
      emit(current.copyWith(errorMessage: 'Failed to load more comments.'));
    }
  }

  Future<void> _onPostComment(
    PostComment event,
    Emitter<CommentState> emit,
  ) async {
    final current = state;
    if (current is! CommentLoaded) return;

    emit(current.copyWith(isSubmitting: true, clearError: true));
    try {
      await _dataSource.addComment(
        _eventId,
        text: event.text,
        authorId: event.authorId,
        authorName: event.authorName,
      );
      emit(current.copyWith(isSubmitting: false));
    } catch (e) {
      emit(current.copyWith(
        isSubmitting: false,
        errorMessage: 'Failed to post comment.',
      ));
    }
  }

  Future<void> _onPostReply(
    PostReply event,
    Emitter<CommentState> emit,
  ) async {
    final current = state;
    if (current is! CommentLoaded) return;

    emit(current.copyWith(isSubmitting: true, clearError: true));
    try {
      await _dataSource.addComment(
        _eventId,
        text: event.text,
        authorId: event.authorId,
        authorName: event.authorName,
        parentCommentId: event.parentCommentId,
        threadLevel: 1,
      );
      emit(current.copyWith(isSubmitting: false, clearReplyingTo: true));
    } catch (e) {
      emit(current.copyWith(
        isSubmitting: false,
        errorMessage: 'Failed to post reply.',
      ));
    }
  }

  Future<void> _onDeleteComment(
    DeleteComment event,
    Emitter<CommentState> emit,
  ) async {
    final current = state;
    if (current is! CommentLoaded) return;

    try {
      await _dataSource.deleteComment(_eventId, event.commentId);
    } catch (e) {
      emit(current.copyWith(errorMessage: 'Failed to delete comment.'));
    }
  }

  Future<void> _onDeleteThread(
    DeleteThread event,
    Emitter<CommentState> emit,
  ) async {
    final current = state;
    if (current is! CommentLoaded) return;

    try {
      await _dataSource.deleteThread(_eventId, event.commentId);
    } catch (e) {
      emit(current.copyWith(errorMessage: 'Failed to delete thread.'));
    }
  }

  Future<void> _onToggleLike(
    ToggleLike event,
    Emitter<CommentState> emit,
  ) async {
    final current = state;
    if (current is! CommentLoaded) return;

    final currentlyLiked = current.optimisticLikes[event.commentId] ?? false;
    final currentCount = current.optimisticLikeCounts[event.commentId] ?? 0;

    // Optimistic update
    final newLikes = Map<String, bool>.from(current.optimisticLikes)
      ..[event.commentId] = !currentlyLiked;
    final newCounts = Map<String, int>.from(current.optimisticLikeCounts)
      ..[event.commentId] = currentlyLiked
          ? (currentCount - 1).clamp(0, double.maxFinite.toInt())
          : currentCount + 1;

    emit(current.copyWith(
      optimisticLikes: newLikes,
      optimisticLikeCounts: newCounts,
      clearError: true,
    ));

    try {
      await _dataSource.toggleLike(_eventId, event.commentId, event.userId);
    } catch (e) {
      // Revert optimistic update
      final revertLikes = Map<String, bool>.from(current.optimisticLikes);
      final revertCounts = Map<String, int>.from(current.optimisticLikeCounts);
      final reverted = state;
      if (reverted is CommentLoaded) {
        emit(reverted.copyWith(
          optimisticLikes: revertLikes,
          optimisticLikeCounts: revertCounts,
          errorMessage: 'Failed to update like.',
        ));
      }
    }
  }

  Future<void> _onToggleReaction(
    ToggleReaction event,
    Emitter<CommentState> emit,
  ) async {
    final current = state;
    if (current is! CommentLoaded) return;

    final userReactions = Set<String>.from(
        current.optimisticUserReactions[event.commentId] ?? {});
    final reactionCounts = Map<String, int>.from(
        current.optimisticReactions[event.commentId] ?? {});

    final hasReaction = userReactions.contains(event.emoji);
    if (hasReaction) {
      userReactions.remove(event.emoji);
      reactionCounts[event.emoji] = ((reactionCounts[event.emoji] ?? 1) - 1)
          .clamp(0, double.maxFinite.toInt());
    } else {
      userReactions.add(event.emoji);
      reactionCounts[event.emoji] = (reactionCounts[event.emoji] ?? 0) + 1;
    }

    final newUserReactions =
        Map<String, Set<String>>.from(current.optimisticUserReactions)
          ..[event.commentId] = userReactions;
    final newReactions =
        Map<String, Map<String, int>>.from(current.optimisticReactions)
          ..[event.commentId] = reactionCounts;

    emit(current.copyWith(
      optimisticUserReactions: newUserReactions,
      optimisticReactions: newReactions,
      clearError: true,
    ));

    try {
      await _dataSource.toggleReaction(
        _eventId,
        event.commentId,
        event.userId,
        event.emoji,
      );
    } catch (e) {
      // Revert
      final reverted = state;
      if (reverted is CommentLoaded) {
        emit(reverted.copyWith(
          optimisticUserReactions: current.optimisticUserReactions,
          optimisticReactions: current.optimisticReactions,
          errorMessage: 'Failed to update reaction.',
        ));
      }
    }
  }

  Future<void> _onExpandThread(
    ExpandThread event,
    Emitter<CommentState> emit,
  ) async {
    final current = state;
    if (current is! CommentLoaded) return;

    try {
      final threadReplies =
          await _dataSource.fetchReplies(_eventId, event.commentId);
      final newReplies = Map<String, List<CommentEntity>>.from(current.replies)
        ..[event.commentId] = threadReplies;
      final newExpanded = Set<String>.from(current.expandedThreads)
        ..add(event.commentId);
      emit(current.copyWith(
        replies: newReplies,
        expandedThreads: newExpanded,
      ));
    } catch (e) {
      emit(current.copyWith(errorMessage: 'Failed to load replies.'));
    }
  }

  void _onCollapseThread(
    CollapseThread event,
    Emitter<CommentState> emit,
  ) {
    final current = state;
    if (current is! CommentLoaded) return;

    final newExpanded = Set<String>.from(current.expandedThreads)
      ..remove(event.commentId);
    emit(current.copyWith(expandedThreads: newExpanded));
  }

  void _onStartReply(
    StartReply event,
    Emitter<CommentState> emit,
  ) {
    final current = state;
    if (current is! CommentLoaded) return;

    emit(current.copyWith(replyingToCommentId: event.commentId));
  }

  void _onCancelReply(
    CancelReply event,
    Emitter<CommentState> emit,
  ) {
    final current = state;
    if (current is! CommentLoaded) return;

    emit(current.copyWith(clearReplyingTo: true));
  }

  @override
  Future<void> close() {
    _countSub?.cancel();
    _commentsSub?.cancel();
    return super.close();
  }
}

