import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shimmer/shimmer.dart';

import '../../../core/theme/mojo_colors.dart';
import '../providers/feed_paginator_provider.dart';
import '../services/media_service.dart';
import '../services/reaction_service.dart';
import 'comment_sheet.dart';
import 'media_card.dart';

/// Instagram-style vertical feed with infinite scroll, shimmer loading,
/// pull-to-refresh, and inline error/retry handling.
class MediaFeedList extends ConsumerStatefulWidget {
  const MediaFeedList({super.key});

  @override
  ConsumerState<MediaFeedList> createState() => _MediaFeedListState();
}

class _MediaFeedListState extends ConsumerState<MediaFeedList> {
  final ScrollController _scrollController = ScrollController();
  final _reactionService = ReactionService();
  final _mediaService = MediaService();

  String get _currentUid => FirebaseAuth.instance.currentUser?.uid ?? '';
  String get _currentUserName =>
      FirebaseAuth.instance.currentUser?.displayName ?? 'Mojo Mom';

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(feedPaginatorProvider.notifier).loadNextPage();
    }
  }

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  Future<void> _onLike(MediaItem item) async {
    final uid = _currentUid;
    if (uid.isEmpty) return;

    // Optimistic update
    final wasLiked = item.isLikedBy(uid);
    final optimistic = MediaItem(
      id: item.id,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      type: item.type,
      uploadedBy: item.uploadedBy,
      uploaderName: item.uploaderName,
      caption: item.caption,
      createdAt: item.createdAt,
      likesCount: wasLiked ? item.likesCount - 1 : item.likesCount + 1,
      commentsCount: item.commentsCount,
      likes: wasLiked
          ? (List<String>.from(item.likes)..remove(uid))
          : [...item.likes, uid],
      comments: item.comments,
      filePath: item.filePath,
      storageFolder: item.storageFolder,
    );
    ref.read(feedPaginatorProvider.notifier).updateItem(optimistic);

    try {
      final (newCount, isLiked) =
          await _reactionService.toggleLike(item.id, uid);
      // Reconcile with server state
      final reconciled = MediaItem(
        id: item.id,
        url: item.url,
        thumbnailUrl: item.thumbnailUrl,
        type: item.type,
        uploadedBy: item.uploadedBy,
        uploaderName: item.uploaderName,
        caption: item.caption,
        createdAt: item.createdAt,
        likesCount: newCount,
        commentsCount: item.commentsCount,
        likes: isLiked
            ? (item.likes.contains(uid) ? item.likes : [...item.likes, uid])
            : (List<String>.from(item.likes)..remove(uid)),
        comments: item.comments,
        filePath: item.filePath,
        storageFolder: item.storageFolder,
      );
      ref.read(feedPaginatorProvider.notifier).updateItem(reconciled);
    } catch (e) {
      // Revert on failure
      ref.read(feedPaginatorProvider.notifier).updateItem(item);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update like: $e')),
        );
      }
    }
  }

  void _onComment(MediaItem item) {
    showCommentSheet(
      context,
      item: item,
      currentUid: _currentUid,
      currentUserName: _currentUserName,
      onUpdate: (updated) {
        ref.read(feedPaginatorProvider.notifier).updateItem(updated);
      },
    );
  }

  Future<void> _onDelete(MediaItem item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Media'),
        content: const Text(
            'Are you sure you want to delete this post? This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await _mediaService.deleteFeedMedia(item.id, item.filePath);
      ref.read(feedPaginatorProvider.notifier).removeItem(item.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Post deleted')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete: $e')),
        );
      }
    }
  }

  void _onShare(MediaItem item) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Share link copied!')),
    );
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(feedPaginatorProvider);

    // Empty state (not loading, no items)
    if (state.items.isEmpty && !state.isLoading && state.error == null) {
      return RefreshIndicator(
        color: MojoColors.primaryOrange,
        onRefresh: () => ref.read(feedPaginatorProvider.notifier).refresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [
            SizedBox(height: 120),
            Center(
              child: Column(
                children: [
                  Icon(Icons.photo_library_outlined,
                      size: 64, color: Colors.grey),
                  SizedBox(height: 12),
                  Text(
                    'No posts yet',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Be the first to share a moment!',
                    style: TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // Initial loading (no items yet)
    if (state.items.isEmpty && state.isLoading) {
      return _buildShimmerList();
    }

    return RefreshIndicator(
      color: MojoColors.primaryOrange,
      onRefresh: () => ref.read(feedPaginatorProvider.notifier).refresh(),
      child: ListView.builder(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(vertical: 4),
        itemCount: state.items.length + 1, // +1 for footer
        itemBuilder: (context, index) {
          if (index < state.items.length) {
            final item = state.items[index];
            return MediaCard(
              item: item,
              currentUid: _currentUid,
              onLike: () => _onLike(item),
              onComment: () => _onComment(item),
              onDelete: () => _onDelete(item),
              onShare: () => _onShare(item),
            );
          }

          // Footer: shimmer / no more / error
          return _buildFooter(state);
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Footer (loading / end / error)
  // ---------------------------------------------------------------------------

  Widget _buildFooter(FeedState state) {
    if (state.isLoading) {
      return _buildShimmerCard();
    }

    if (state.error != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: Column(
            children: [
              const Text(
                'Something went wrong',
                style: TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () =>
                    ref.read(feedPaginatorProvider.notifier).loadNextPage(),
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (!state.hasMore && state.items.isNotEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: Text(
            'No more posts',
            style: TextStyle(color: Colors.grey, fontSize: 13),
          ),
        ),
      );
    }

    return const SizedBox.shrink();
  }

  // ---------------------------------------------------------------------------
  // Shimmer helpers
  // ---------------------------------------------------------------------------

  Widget _buildShimmerList() {
    return ListView.builder(
      physics: const NeverScrollableScrollPhysics(),
      itemCount: 3,
      itemBuilder: (_, __) => _buildShimmerCard(),
    );
  }

  Widget _buildShimmerCard() {
    return Shimmer.fromColors(
      baseColor: Colors.grey.shade300,
      highlightColor: Colors.grey.shade100,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 0, vertical: 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header shimmer
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Container(
                    width: 100,
                    height: 14,
                    decoration: BoxDecoration(
                      color: Colors.grey,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    width: 30,
                    height: 12,
                    decoration: BoxDecoration(
                      color: Colors.grey,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ],
              ),
            ),
            // Image shimmer
            AspectRatio(
              aspectRatio: 1,
              child: Container(color: Colors.grey),
            ),
            // Action row shimmer
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: const BoxDecoration(
                      color: Colors.grey,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    width: 24,
                    height: 24,
                    decoration: const BoxDecoration(
                      color: Colors.grey,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Container(
                    width: 24,
                    height: 24,
                    decoration: const BoxDecoration(
                      color: Colors.grey,
                      shape: BoxShape.circle,
                    ),
                  ),
                ],
              ),
            ),
            // Caption shimmer
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Container(
                width: double.infinity,
                height: 12,
                decoration: BoxDecoration(
                  color: Colors.grey,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}
