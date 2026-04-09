import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../data/datasources/comment_remote_datasource.dart';
import '../../event_detail_injection.dart';
import '../bloc/comment_bloc.dart';
import 'comment_input_widget.dart';
import 'comment_item_widget.dart';
import 'reply_item_widget.dart';

class CommentSectionWidget extends StatelessWidget {
  const CommentSectionWidget({super.key, required this.eventId});

  final String eventId;

  @override
  Widget build(BuildContext context) {
    return BlocProvider<CommentBloc>(
      create: (_) => CommentBloc(
        dataSource: eventDetailSl<CommentRemoteDataSource>(),
        eventId: eventId,
      ),
      child: const _CommentSectionBody(),
    );
  }
}

class _CommentSectionBody extends StatelessWidget {
  const _CommentSectionBody();

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<CommentBloc, CommentState>(
      listener: (context, state) {
        if (state is CommentLoaded && state.errorMessage != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.errorMessage!),
              backgroundColor: Colors.red.shade700,
            ),
          );
        }
      },
      builder: (context, state) {
        final isExpanded = state is CommentLoaded ? state.isExpanded : false;
        final count = state is CommentLoaded ? state.totalCommentCount : 0;

        return Container(
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: <Color>[Color(0xFFFFFEFC), Color(0xFFFFF8F1)],
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFEADBCB)),
            boxShadow: const <BoxShadow>[
              BoxShadow(
                color: Color(0x14000000),
                blurRadius: 18,
                offset: Offset(0, 10),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _Header(
                  count: count,
                  isExpanded: isExpanded,
                  onTap: () =>
                      context.read<CommentBloc>().add(const ToggleCommentSection()),
                ),
                AnimatedCrossFade(
                  duration: const Duration(milliseconds: 220),
                  firstChild: const SizedBox.shrink(),
                  secondChild: _ExpandedContent(state: state),
                  crossFadeState: isExpanded
                      ? CrossFadeState.showSecond
                      : CrossFadeState.showFirst,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.count,
    required this.isExpanded,
    required this.onTap,
  });

  final int count;
  final bool isExpanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFFF8A5B), Color(0xFFE86A35)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(
                Icons.forum_rounded,
                color: Colors.white,
                size: 18,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Comments',
                    style: GoogleFonts.manrope(
                      color: const Color(0xFF2D231F),
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      height: 1.2,
                    ),
                  ),
                  Text(
                    'Join the event conversation',
                    style: GoogleFonts.plusJakartaSans(
                      color: const Color(0xFF8A766B),
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: const Color(0xFFFF4D1C),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '$count',
                style: GoogleFonts.plusJakartaSans(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 8),
            AnimatedRotation(
              turns: isExpanded ? 0.5 : 0,
              duration: const Duration(milliseconds: 200),
              child: const Icon(
                Icons.keyboard_arrow_down_rounded,
                color: Color(0xFF8A766B),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ExpandedContent extends StatelessWidget {
  const _ExpandedContent({required this.state});

  final CommentState state;

  @override
  Widget build(BuildContext context) {
    if (state is CommentError) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(
              (state as CommentError).message,
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                color: const Color(0xFF8A766B),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.tonal(
              onPressed: () =>
                  context.read<CommentBloc>().add(const LoadComments()),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFFFE3D6),
                foregroundColor: const Color(0xFFE86A35),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: Text(
                'Retry',
                style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      );
    }

    if (state is! CommentLoaded) return const SizedBox.shrink();

    final loaded = state as CommentLoaded;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Divider(color: Color(0xFFEADBCB), height: 1),
        if (loaded.comments.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 20, 18, 24),
            child: Column(
              children: [
                const Icon(
                  Icons.chat_bubble_outline_rounded,
                  color: Color(0xFFC5AA9A),
                  size: 30,
                ),
                const SizedBox(height: 8),
                Text(
                  'No comments yet',
                  style: GoogleFonts.manrope(
                    color: const Color(0xFF2D231F),
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Be the first to start the conversation.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    color: const Color(0xFF8A766B),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          )
        else
          ...loaded.comments.asMap().entries.map((entry) {
            final index = entry.key;
            final comment = entry.value;
            final isExpanded = loaded.expandedThreads.contains(comment.id);
            final replies = loaded.replies[comment.id] ?? [];

            return TweenAnimationBuilder<double>(
              key: ValueKey<String>('comment_${comment.id}'),
              tween: Tween<double>(begin: 0, end: 1),
              duration: Duration(milliseconds: 220 + (index * 30)),
              curve: Curves.easeOutCubic,
              builder: (context, value, child) {
                return Opacity(
                  opacity: value,
                  child: Transform.translate(
                    offset: Offset(0, (1 - value) * 10),
                    child: child,
                  ),
                );
              },
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  CommentItemWidget(
                    comment: comment,
                    isExpanded: isExpanded,
                    isReplyingTo: loaded.replyingToCommentId == comment.id,
                    isSubmitting: loaded.isSubmitting,
                    optimisticLiked: loaded.optimisticLikes[comment.id],
                    optimisticLikeCount: loaded.optimisticLikeCounts[comment.id],
                    optimisticReactions: loaded.optimisticReactions[comment.id],
                    optimisticUserReactions:
                        loaded.optimisticUserReactions[comment.id],
                  ),
                  if (isExpanded && replies.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(left: 16, right: 10, bottom: 2),
                      child: IntrinsicHeight(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Container(
                              width: 2,
                              margin: const EdgeInsets.only(top: 2, bottom: 6),
                              decoration: BoxDecoration(
                                color: const Color(0xFFE6D4C6),
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: replies
                                    .map(
                                      (reply) => ReplyItemWidget(
                                        comment: reply,
                                        optimisticLiked:
                                            loaded.optimisticLikes[reply.id],
                                        optimisticLikeCount:
                                            loaded.optimisticLikeCounts[reply.id],
                                        optimisticReactions:
                                            loaded.optimisticReactions[reply.id],
                                        optimisticUserReactions: loaded
                                            .optimisticUserReactions[reply.id],
                                      ),
                                    )
                                    .toList(),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            );
          }),
        if (loaded.hasMore && loaded.comments.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Center(
              child: FilledButton.tonal(
                onPressed: () =>
                    context.read<CommentBloc>().add(const LoadMoreComments()),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFFFE7DA),
                  foregroundColor: const Color(0xFFE86A35),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Text(
                  'Load More',
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
        const Divider(color: Color(0xFFEADBCB), height: 1),
        const CommentInputWidget(),
      ],
    );
  }
}
