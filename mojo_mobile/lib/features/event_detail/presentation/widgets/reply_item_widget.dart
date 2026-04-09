import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../domain/entities/comment_entity.dart';
import '../bloc/comment_bloc.dart';
import 'emoji_picker_widget.dart';
import 'reaction_chips_widget.dart';

class ReplyItemWidget extends StatefulWidget {
  const ReplyItemWidget({
    super.key,
    required this.comment,
    this.optimisticLiked,
    this.optimisticLikeCount,
    this.optimisticReactions,
    this.optimisticUserReactions,
  });

  final CommentEntity comment;
  final bool? optimisticLiked;
  final int? optimisticLikeCount;
  final Map<String, int>? optimisticReactions;
  final Set<String>? optimisticUserReactions;

  @override
  State<ReplyItemWidget> createState() => _ReplyItemWidgetState();
}

class _ReplyItemWidgetState extends State<ReplyItemWidget> {
  bool _showPicker = false;

  String _formatTimestamp(DateTime? dt) {
    if (dt == null) return 'Just now';
    return DateFormat('MMM d, h:mm a').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    final currentUser = FirebaseAuth.instance.currentUser;
    final isOwner = currentUser?.uid == widget.comment.authorId;
    final canDelete = isOwner;
    final liked = widget.optimisticLiked ?? false;
    final likeCount = widget.optimisticLikeCount ?? 0;

    return Container(
      margin: const EdgeInsets.only(left: 36, right: 12, top: 4, bottom: 8),
      padding: const EdgeInsets.fromLTRB(11, 10, 11, 10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F0E7),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE6D4C6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: const Color(0xFFFFE3D6),
                  border: Border.all(color: const Color(0xFFFFD1BD)),
                ),
                child: const Icon(
                  Icons.person_rounded,
                  color: Color(0xFFE86A35),
                  size: 15,
                ),
              ),
              const SizedBox(width: 8),
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
                              fontSize: 12.5,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        if (isOwner)
                          Text(
                            'You',
                            style: GoogleFonts.plusJakartaSans(
                              color: const Color(0xFFFF4D1C),
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _formatTimestamp(widget.comment.createdAt),
                      style: GoogleFonts.plusJakartaSans(
                        color: const Color(0xFF8A766B),
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            widget.comment.text,
            style: GoogleFonts.plusJakartaSans(
              color: const Color(0xFF2D231F),
              fontSize: 12.5,
              height: 1.4,
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
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _ReplyPill(
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
              _ReplyPill(
                icon: Icons.emoji_emotions_outlined,
                color: _showPicker
                    ? const Color(0xFFF59E0B)
                    : const Color(0xFF7C5CFA),
                active: _showPicker,
                onTap: () => setState(() => _showPicker = !_showPicker),
              ),
              if (canDelete)
                _ReplyPill(
                  icon: Icons.delete_outline_rounded,
                  color: const Color(0xFFEF4444),
                  onTap: () => _confirmDelete(context),
                ),
            ],
          ),
        ],
      ),
    );
  }

  void _confirmDelete(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFFFFFCF8),
        title: Text(
          'Delete Reply?',
          style: GoogleFonts.manrope(color: const Color(0xFF2D231F)),
        ),
        content: Text(
          'Are you sure you want to delete this reply?',
          style: GoogleFonts.plusJakartaSans(color: const Color(0xFF7D665A)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(
              'Cancel',
              style: GoogleFonts.plusJakartaSans(
                color: const Color(0xFF7D665A),
              ),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              context
                  .read<CommentBloc>()
                  .add(DeleteComment(commentId: widget.comment.id));
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

class _ReplyPill extends StatelessWidget {
  const _ReplyPill({
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
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            color: active ? const Color(0xFFFFE7DA) : const Color(0xFFF4E9DE),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: active ? const Color(0xFFF3B497) : const Color(0xFFE2CEBE),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 15, color: color),
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
