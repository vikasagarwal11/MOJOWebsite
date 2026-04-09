import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../domain/entities/comment_entity.dart';
import '../bloc/comment_bloc.dart';
import 'comment_input_widget.dart';
import 'emoji_picker_widget.dart';
import 'reaction_chips_widget.dart';

class CommentItemWidget extends StatefulWidget {
  const CommentItemWidget({
    super.key,
    required this.comment,
    this.isExpanded = false,
    this.isReplyingTo = false,
    this.isSubmitting = false,
    this.optimisticLiked,
    this.optimisticLikeCount,
    this.optimisticReactions,
    this.optimisticUserReactions,
  });

  final CommentEntity comment;
  final bool isExpanded;
  final bool isReplyingTo;
  final bool isSubmitting;
  final bool? optimisticLiked;
  final int? optimisticLikeCount;
  final Map<String, int>? optimisticReactions;
  final Set<String>? optimisticUserReactions;

  @override
  State<CommentItemWidget> createState() => _CommentItemWidgetState();
}

class _CommentItemWidgetState extends State<CommentItemWidget> {
  bool _showPicker = false;

  String _formatTimestamp(DateTime? dt) {
    if (dt == null) return 'Just now';
    return DateFormat('MMM d, h:mm a').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = FirebaseAuth.instance.currentUser;
    final isOwner = currentUser?.uid == widget.comment.authorId;
    const isAdmin = false;
    final canDelete = isOwner || isAdmin;
    final liked = widget.optimisticLiked ?? false;
    final likeCount = widget.optimisticLikeCount ?? 0;

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 8),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: <Color>[Color(0xFFFFF9F3), Color(0xFFFFF5EC)],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFEADBCB)),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x10000000),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFFFFE3D6),
                  border: Border.all(color: const Color(0xFFFFD1BD)),
                ),
                child: const Icon(
                  Icons.person_rounded,
                  color: Color(0xFFE86A35),
                  size: 18,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            widget.comment.authorName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.manrope(
                              color: const Color(0xFF2D231F),
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                              height: 1.15,
                            ),
                          ),
                        ),
                        if (isOwner)
                          Container(
                            margin: const EdgeInsets.only(left: 6),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: const Color(0xFFFF4D1C).withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              'You',
                              style: GoogleFonts.plusJakartaSans(
                                color: const Color(0xFFFF4D1C),
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _formatTimestamp(widget.comment.createdAt),
                      style: GoogleFonts.plusJakartaSans(
                        color: const Color(0xFF8A766B),
                        fontSize: 10.5,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            widget.comment.text,
            style: GoogleFonts.plusJakartaSans(
              color: const Color(0xFF2D231F),
              fontSize: 13.5,
              height: 1.45,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (widget.optimisticReactions != null &&
              widget.optimisticReactions!.isNotEmpty)
            ReactionChipsWidget(
              commentId: widget.comment.id,
              reactionCounts: widget.optimisticReactions!,
              userReactions: widget.optimisticUserReactions ?? {},
            ),
          if (_showPicker)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: EmojiPickerWidget(
                commentId: widget.comment.id,
                onClose: () => setState(() => _showPicker = false),
              ),
            ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _ActionPill(
                icon:
                    liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                color:
                    liked ? const Color(0xFFFF4D1C) : const Color(0xFFE86A35),
                active: liked,
                badgeValue: likeCount > 0 ? '$likeCount' : null,
                onTap: () {
                  if (currentUser == null) return;
                  context.read<CommentBloc>().add(ToggleLike(
                        commentId: widget.comment.id,
                        userId: currentUser.uid,
                      ));
                },
              ),
              _ActionPill(
                icon: Icons.emoji_emotions_outlined,
                color: _showPicker
                    ? const Color(0xFFF59E0B)
                    : const Color(0xFF7C5CFA),
                active: _showPicker,
                onTap: () => setState(() => _showPicker = !_showPicker),
              ),
              if (widget.comment.threadLevel == 0)
                _ActionPill(
                  icon: Icons.reply_rounded,
                  color: const Color(0xFF3B82F6),
                  active: widget.isReplyingTo,
                  onTap: () => context
                      .read<CommentBloc>()
                      .add(StartReply(commentId: widget.comment.id)),
                ),
              if (canDelete)
                _ActionPill(
                  icon: Icons.delete_outline_rounded,
                  color: const Color(0xFFEF4444),
                  onTap: () => _confirmDelete(context, isOwner),
                ),
            ],
          ),
          if (widget.comment.threadLevel == 0 && widget.comment.replyCount > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: InkWell(
                onTap: () {
                  final bloc = context.read<CommentBloc>();
                  if (widget.isExpanded) {
                    bloc.add(CollapseThread(commentId: widget.comment.id));
                  } else {
                    bloc.add(ExpandThread(commentId: widget.comment.id));
                  }
                },
                borderRadius: BorderRadius.circular(10),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        widget.isExpanded
                            ? Icons.unfold_less_rounded
                            : Icons.unfold_more_rounded,
                        size: 16,
                        color: const Color(0xFFE86A35),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        widget.isExpanded
                            ? 'Hide replies (${widget.comment.replyCount})'
                            : 'View replies (${widget.comment.replyCount})',
                        style: GoogleFonts.plusJakartaSans(
                          color: const Color(0xFFE86A35),
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          if (widget.isReplyingTo) ...[
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(
                color: const Color(0xFFFFFAF5),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFEEDFD2)),
              ),
              child: CommentInputWidget(parentCommentId: widget.comment.id),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () =>
                    context.read<CommentBloc>().add(const CancelReply()),
                child: Text(
                  'Cancel reply',
                  style: GoogleFonts.plusJakartaSans(
                    color: const Color(0xFF8A766B),
                    fontSize: 12,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _confirmDelete(BuildContext context, bool isOwner) {
    final isTopLevel = widget.comment.threadLevel == 0;
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: const Color(0xFFFFFCF8),
        title: Text(
          'Delete ${isTopLevel && !isOwner ? 'Thread' : 'Comment'}?',
          style: GoogleFonts.manrope(color: const Color(0xFF2D231F)),
        ),
        content: Text(
          isTopLevel && !isOwner
              ? 'This removes the comment with all replies and reactions.'
              : 'Are you sure you want to delete this comment?',
          style: GoogleFonts.plusJakartaSans(color: const Color(0xFF7D665A)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(
              'Cancel',
              style: GoogleFonts.plusJakartaSans(
                color: const Color(0xFF7D665A),
              ),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              final bloc = context.read<CommentBloc>();
              if (isTopLevel && !isOwner) {
                bloc.add(DeleteThread(commentId: widget.comment.id));
              } else {
                bloc.add(DeleteComment(commentId: widget.comment.id));
              }
            },
            child: Text(
              'Delete',
              style: GoogleFonts.plusJakartaSans(color: Colors.red),
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({
    required this.icon,
    required this.color,
    required this.onTap,
    this.active = false,
    this.badgeValue,
  });

  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final bool active;
  final String? badgeValue;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
          decoration: BoxDecoration(
            color: active ? const Color(0xFFFFE7DA) : const Color(0xFFF8F0E7),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active ? const Color(0xFFF3B497) : const Color(0xFFE6D4C6),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: color),
              if (badgeValue != null) ...[
                const SizedBox(width: 4),
                Text(
                  badgeValue!,
                  style: GoogleFonts.plusJakartaSans(
                    color: const Color(0xFF7D665A),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
