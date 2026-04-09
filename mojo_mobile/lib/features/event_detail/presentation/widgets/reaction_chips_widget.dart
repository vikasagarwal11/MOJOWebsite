import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';

import '../bloc/comment_bloc.dart';

class ReactionChipsWidget extends StatelessWidget {
  const ReactionChipsWidget({
    super.key,
    required this.commentId,
    required this.reactionCounts,
    required this.userReactions,
  });

  final String commentId;
  final Map<String, int> reactionCounts;
  final Set<String> userReactions;

  @override
  Widget build(BuildContext context) {
    final entries = reactionCounts.entries.where((e) => e.value > 0).toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    if (entries.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: entries.map((entry) {
          final isActive = userReactions.contains(entry.key);
          return GestureDetector(
            onTap: () {
              final user = FirebaseAuth.instance.currentUser;
              if (user == null) return;
              context.read<CommentBloc>().add(ToggleReaction(
                    commentId: commentId,
                    userId: user.uid,
                    emoji: entry.key,
                  ));
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: isActive
                    ? const Color(0xFFFF4D1C).withValues(alpha: 0.15)
                    : const Color(0xFFF8F0E7),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isActive
                      ? const Color(0xFFFF4D1C).withValues(alpha: 0.4)
                      : const Color(0xFFEADBCB),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(entry.key, style: const TextStyle(fontSize: 14)),
                  const SizedBox(width: 4),
                  Text(
                    '${entry.value}',
                    style: GoogleFonts.plusJakartaSans(
                      color: isActive
                          ? const Color(0xFFFF4D1C)
                          : const Color(0xFF8A766B),
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
