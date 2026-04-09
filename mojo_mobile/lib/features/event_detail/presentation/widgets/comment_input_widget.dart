import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';

import '../bloc/comment_bloc.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

class CommentInputWidget extends StatefulWidget {
  const CommentInputWidget({super.key, this.parentCommentId});

  final String? parentCommentId;

  @override
  State<CommentInputWidget> createState() => _CommentInputWidgetState();
}

class _CommentInputWidgetState extends State<CommentInputWidget> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  static const _maxLength = 1000;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  bool get _canSubmit {
    final trimmed = _controller.text.trim();
    return trimmed.isNotEmpty && trimmed.length <= _maxLength;
  }

  void _submit(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;

    final bloc = context.read<CommentBloc>();
    final text = _controller.text.trim();

    if (widget.parentCommentId != null) {
      bloc.add(PostReply(
        text: text,
        authorId: user.uid,
        authorName: user.displayName ?? 'Member',
        parentCommentId: widget.parentCommentId!,
      ));
    } else {
      bloc.add(PostComment(
        text: text,
        authorId: user.uid,
        authorName: user.displayName ?? 'Member',
      ));
    }

    _controller.clear();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return const SizedBox.shrink();

    return BlocBuilder<CommentBloc, CommentState>(
      builder: (context, state) {
        final isSubmitting = state is CommentLoaded && state.isSubmitting;

        return Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOutCubic,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: _focusNode.hasFocus
                  ? const Color(0xFFFFF7EF)
                  : const Color(0xFFFAF2E9),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: _focusNode.hasFocus
                    ? const Color(0xFFF3B497)
                    : const Color(0xFFEADBCB),
                width: _focusNode.hasFocus ? 1.25 : 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: _focusNode.hasFocus
                      ? const Color(0x1A000000)
                      : const Color(0x12000000),
                  blurRadius: _focusNode.hasFocus ? 14 : 10,
                  offset: Offset(0, _focusNode.hasFocus ? 6 : 4),
                ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    focusNode: _focusNode,
                    maxLength: _maxLength,
                    maxLines: 4,
                    minLines: 1,
                    enabled: !isSubmitting,
                    textInputAction: TextInputAction.newline,
                    onChanged: (_) => setState(() {}),
                    onTap: () => setState(() {}),
                    style: GoogleFonts.plusJakartaSans(
                      color: const Color(0xFF2D231F),
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      height: 1.35,
                    ),
                    decoration: InputDecoration(
                      hintText: widget.parentCommentId != null
                          ? 'Write a reply...'
                          : 'Write a comment...',
                      hintStyle: GoogleFonts.plusJakartaSans(
                        color: const Color(0xFFA59084),
                        fontSize: 13,
                      ),
                      counterText: '',
                      border: InputBorder.none,
                      isCollapsed: true,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 2,
                        vertical: 10,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                if (isSubmitting)
                  const SizedBox(
                    width: 28,
                    height: 28,
                    child: AppLoadingIndicator(
                      strokeWidth: 2.1,
                      color: Color(0xFFFF4D1C),
                    ),
                  )
                else
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: _canSubmit ? () => _submit(context) : null,
                      borderRadius: BorderRadius.circular(999),
                      child: Ink(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: _canSubmit
                              ? const LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [Color(0xFFFF8A5B), Color(0xFFE86A35)],
                                )
                              : null,
                          color: _canSubmit ? null : const Color(0xFFE2D4C8),
                          boxShadow: _canSubmit
                              ? const <BoxShadow>[
                                  BoxShadow(
                                    color: Color(0x2AE86A35),
                                    blurRadius: 10,
                                    offset: Offset(0, 4),
                                  ),
                                ]
                              : null,
                        ),
                        child: Icon(
                          Icons.send_rounded,
                          size: 18,
                          color:
                              _canSubmit ? Colors.white : const Color(0xFFAD9C91),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}


