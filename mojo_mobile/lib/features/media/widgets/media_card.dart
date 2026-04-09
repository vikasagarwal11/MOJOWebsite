import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../../../core/theme/mojo_colors.dart';
import '../providers/feed_paginator_provider.dart';
import 'heart_animation_overlay.dart';

/// Instagram-style media card for the feed view.
///
/// Accepts a [MediaItem], the current user's UID, and callbacks for
/// like, comment, delete, and share actions.
class MediaCard extends StatefulWidget {
  final MediaItem item;
  final String currentUid;
  final VoidCallback onLike;
  final VoidCallback onComment;
  final VoidCallback onDelete;
  final VoidCallback onShare;

  const MediaCard({
    super.key,
    required this.item,
    required this.currentUid,
    required this.onLike,
    required this.onComment,
    required this.onDelete,
    required this.onShare,
  });

  @override
  State<MediaCard> createState() => _MediaCardState();
}

class _MediaCardState extends State<MediaCard> {
  bool _captionExpanded = false;
  final ValueNotifier<bool> _heartTrigger = ValueNotifier(false);

  @override
  void dispose() {
    _heartTrigger.dispose();
    super.dispose();
  }

  // -----------------------------------------------------------------------
  // Relative time helper
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
  // Double-tap handler
  // -----------------------------------------------------------------------

  void _onDoubleTap() {
    if (!widget.item.isLikedBy(widget.currentUid)) {
      widget.onLike();
    }
    _heartTrigger.value = true;
  }

  // -----------------------------------------------------------------------
  // Build
  // -----------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final isOwner = item.isOwnedBy(widget.currentUid);
    final isLiked = item.isLikedBy(widget.currentUid);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(item, isOwner),
          _buildMediaArea(item),
          _buildActionRow(item, isLiked),
          if (item.caption.isNotEmpty) _buildCaption(item),
          if (item.commentsCount > 0) _buildCommentPreview(item),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  // -----------------------------------------------------------------------
  // 1. Header row
  // -----------------------------------------------------------------------

  Widget _buildHeader(MediaItem item, bool isOwner) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Text(
            item.uploaderName,
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 14,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            _relativeTime(item.createdAt),
            style: TextStyle(
              color: Colors.grey.shade500,
              fontSize: 12,
            ),
          ),
          const Spacer(),
          if (isOwner)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, size: 20),
              padding: EdgeInsets.zero,
              onSelected: (value) {
                if (value == 'delete') widget.onDelete();
              },
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'delete',
                  child: Text('Delete'),
                ),
              ],
            ),
        ],
      ),
    );
  }

  // -----------------------------------------------------------------------
  // 2. Media area (image or video thumbnail) + heart overlay
  // -----------------------------------------------------------------------

  Widget _buildMediaArea(MediaItem item) {
    return GestureDetector(
      onDoubleTap: _onDoubleTap,
      child: Stack(
        alignment: Alignment.center,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: item.type == 'video'
                ? _buildVideoThumbnail(item)
                : CachedNetworkImage(
                    imageUrl: item.url,
                    width: double.infinity,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Shimmer.fromColors(
                      baseColor: Colors.grey.shade300,
                      highlightColor: Colors.grey.shade100,
                      child: Container(color: Colors.grey.shade300),
                    ),
                    errorWidget: (_, __, ___) => Container(
                      color: Colors.grey.shade200,
                      child: const Icon(Icons.broken_image, size: 48),
                    ),
                  ),
          ),
          HeartAnimationOverlay(trigger: _heartTrigger),
        ],
      ),
    );
  }

  Widget _buildVideoThumbnail(MediaItem item) {
    return Stack(
      alignment: Alignment.center,
      children: [
        CachedNetworkImage(
          imageUrl: item.thumbnailUrl,
          width: double.infinity,
          fit: BoxFit.cover,
          placeholder: (_, __) => Shimmer.fromColors(
            baseColor: Colors.grey.shade300,
            highlightColor: Colors.grey.shade100,
            child: Container(color: Colors.grey.shade300),
          ),
          errorWidget: (_, __, ___) => Container(
            color: Colors.grey.shade200,
            child: const Icon(Icons.videocam_off, size: 48),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.5),
            shape: BoxShape.circle,
          ),
          padding: const EdgeInsets.all(12),
          child: const Icon(Icons.play_arrow, color: Colors.white, size: 36),
        ),
      ],
    );
  }

  // -----------------------------------------------------------------------
  // 3. Action row
  // -----------------------------------------------------------------------

  Widget _buildActionRow(MediaItem item, bool isLiked) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        children: [
          IconButton(
            icon: Icon(
              isLiked ? Icons.favorite : Icons.favorite_border,
              color: isLiked ? MojoColors.primaryOrange : null,
            ),
            onPressed: widget.onLike,
          ),
          IconButton(
            icon: const Icon(Icons.chat_bubble_outline),
            onPressed: widget.onComment,
          ),
          IconButton(
            icon: const Icon(Icons.share_outlined),
            onPressed: widget.onShare,
          ),
          const SizedBox(width: 4),
          Text(
            '${item.likesCount} ${item.likesCount == 1 ? 'like' : 'likes'}',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
          ),
        ],
      ),
    );
  }

  // -----------------------------------------------------------------------
  // 4. Caption
  // -----------------------------------------------------------------------

  Widget _buildCaption(MediaItem item) {
    final caption = item.caption;
    final shouldTruncate = caption.length > 125 && !_captionExpanded;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: GestureDetector(
        onTap: shouldTruncate
            ? () => setState(() => _captionExpanded = true)
            : null,
        child: RichText(
          text: TextSpan(
            style: const TextStyle(color: Colors.black87, fontSize: 13),
            children: [
              TextSpan(
                text: '${item.uploaderName} ',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              TextSpan(
                text: shouldTruncate
                    ? '${caption.substring(0, 125)}...more'
                    : caption,
              ),
            ],
          ),
        ),
      ),
    );
  }

  // -----------------------------------------------------------------------
  // 5. Comment preview
  // -----------------------------------------------------------------------

  Widget _buildCommentPreview(MediaItem item) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: widget.onComment,
            child: Text(
              'View all ${item.commentsCount} comments',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
            ),
          ),
          if (item.comments.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              '${item.comments.last.userName}  ${item.comments.last.text}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13),
            ),
          ],
        ],
      ),
    );
  }
}
