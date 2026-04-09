import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/mojo_colors.dart';
import '../providers/feed_paginator_provider.dart';

/// Opens a modal bottom sheet displaying comments for [item].
///
/// [currentUid] / [currentUserName] identify the poster.
/// [onUpdate] is called with an optimistically-updated [MediaItem] after a
/// comment is successfully written to Firestore.
void showCommentSheet(
  BuildContext context, {
  required MediaItem item,
  required String currentUid,
  required String currentUserName,
  required void Function(MediaItem) onUpdate,
}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _CommentSheetContent(
      item: item,
      currentUid: currentUid,
      currentUserName: currentUserName,
      onUpdate: onUpdate,
    ),
  );
}

// ---------------------------------------------------------------------------
// Sheet content
// ---------------------------------------------------------------------------

class _CommentSheetContent extends StatefulWidget {
  final MediaItem item;
  final String currentUid;
  final String currentUserName;
  final void Function(MediaItem) onUpdate;

  const _CommentSheetContent({
    required this.item,
    required this.currentUid,
    required this.currentUserName,
    required this.onUpdate,
  });

  @override
  State<_CommentSheetContent> createState() => _CommentSheetContentState();
}

class _CommentSheetContentState extends State<_CommentSheetContent> {
  final _controller = TextEditingController();
  late List<CommentData> _comments;
  bool _sending = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _comments = List.of(widget.item.comments)
      ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
    // Simulate brief load so the UI shows the indicator, then reveal.
    Future.microtask(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  // -----------------------------------------------------------------------
  // Relative time (same logic as MediaCard)
  // -----------------------------------------------------------------------

  static String _relativeTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    final weeks = (diff.inDays / 7).floor();
    if (weeks < 52) return '${weeks}w';
    return '${(diff.inDays / 365).floor()}y';
  }

  // -----------------------------------------------------------------------
  // Send comment
  // -----------------------------------------------------------------------

  Future<void> _sendComment() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    setState(() => _sending = true);

    final now = DateTime.now();
    final commentMap = {
      'userId': widget.currentUid,
      'userName': widget.currentUserName,
      'text': text,
      'createdAt': Timestamp.fromDate(now),
    };

    try {
      await FirebaseFirestore.instance
          .collection('media')
          .doc(widget.item.id)
          .update({
        'comments': FieldValue.arrayUnion([commentMap]),
        'commentsCount': FieldValue.increment(1),
      });

      final newComment = CommentData(
        userId: widget.currentUid,
        userName: widget.currentUserName,
        text: text,
        createdAt: now,
      );

      setState(() {
        _comments.add(newComment);
        _sending = false;
      });
      _controller.clear();

      // Optimistic update for the parent feed.
      final updatedItem = MediaItem(
        id: widget.item.id,
        url: widget.item.url,
        thumbnailUrl: widget.item.thumbnailUrl,
        type: widget.item.type,
        uploadedBy: widget.item.uploadedBy,
        uploaderName: widget.item.uploaderName,
        caption: widget.item.caption,
        createdAt: widget.item.createdAt,
        likesCount: widget.item.likesCount,
        commentsCount: widget.item.commentsCount + 1,
        likes: widget.item.likes,
        comments: [...widget.item.comments, newComment],
        filePath: widget.item.filePath,
        storageFolder: widget.item.storageFolder,
      );
      widget.onUpdate(updatedItem);
    } catch (e) {
      setState(() => _sending = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to post comment: $e')),
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Build
  // -----------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.3,
      maxChildSize: 0.9,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              _buildHandle(),
              _buildHeaderRow(),
              const Divider(height: 1),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _comments.isEmpty
                        ? const Center(
                            child: Text(
                              'No comments yet',
                              style: TextStyle(color: Colors.grey),
                            ),
                          )
                        : ListView.builder(
                            controller: scrollController,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 8),
                            itemCount: _comments.length,
                            itemBuilder: (_, i) =>
                                _buildCommentTile(_comments[i]),
                          ),
              ),
              const Divider(height: 1),
              _buildInputRow(),
            ],
          ),
        );
      },
    );
  }

  Widget _buildHandle() {
    return Center(
      child: Container(
        margin: const EdgeInsets.only(top: 10, bottom: 4),
        width: 40,
        height: 4,
        decoration: BoxDecoration(
          color: Colors.grey.shade300,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }

  Widget _buildHeaderRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      child: Row(
        children: [
          const Text(
            'Comments',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
          ),
          const Spacer(),
          IconButton(
            icon: const Icon(Icons.close, size: 20),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }

  Widget _buildCommentTile(CommentData c) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: RichText(
              text: TextSpan(
                style: const TextStyle(color: Colors.black87, fontSize: 13),
                children: [
                  TextSpan(
                    text: '${c.userName} ',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  TextSpan(text: c.text),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            _relativeTime(c.createdAt),
            style: TextStyle(color: Colors.grey.shade500, fontSize: 11),
          ),
        ],
      ),
    );
  }

  Widget _buildInputRow() {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _sendComment(),
                decoration: InputDecoration(
                  hintText: 'Add a comment…',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            _sending
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : IconButton(
                    icon:
                        const Icon(Icons.send, color: MojoColors.primaryOrange),
                    onPressed: _sendComment,
                  ),
          ],
        ),
      ),
    );
  }
}
