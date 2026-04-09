import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../bloc/comment_bloc.dart';

/// Inline emoji picker that appears above the React button.
class EmojiPickerWidget extends StatelessWidget {
  const EmojiPickerWidget({
    super.key,
    required this.commentId,
    required this.onClose,
  });

  final String commentId;
  final VoidCallback onClose;

  static const List<String> emojis = [
    '\u2764\ufe0f',
    '\u{1F44D}',
    '\u{1F389}',
    '\u{1F64C}',
    '\u{1F602}',
    '\u{1F62E}',
    '\u{1F622}',
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFCF8),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFEADBCB)),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 12,
            offset: Offset(0, -4),
          ),
        ],
      ),
      child: Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 4,
        runSpacing: 4,
        children: [
          ...emojis.map((emoji) {
            return GestureDetector(
              onTap: () {
                final user = FirebaseAuth.instance.currentUser;
                if (user == null) return;
                context.read<CommentBloc>().add(ToggleReaction(
                      commentId: commentId,
                      userId: user.uid,
                      emoji: emoji,
                    ));
                onClose();
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: Text(emoji, style: const TextStyle(fontSize: 24)),
              ),
            );
          }),
          GestureDetector(
            onTap: onClose,
            child: const Padding(
              padding: EdgeInsets.only(left: 2),
              child: Icon(Icons.close, size: 16, color: Color(0xFF888888)),
            ),
          ),
        ],
      ),
    );
  }
}
