import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shimmer/shimmer.dart';

import '../../../core/theme/mojo_colors.dart';
import '../providers/feed_paginator_provider.dart';
import '../screens/media_viewer_screen.dart';

/// 3-column grid view of media thumbnails backed by [feedPaginatorProvider].
///
/// Supports infinite scroll pagination (200 px threshold), pull-to-refresh,
/// and shimmer placeholders while loading.
class MediaGridView extends ConsumerStatefulWidget {
  const MediaGridView({super.key});

  @override
  ConsumerState<MediaGridView> createState() => _MediaGridViewState();
}

class _MediaGridViewState extends ConsumerState<MediaGridView> {
  final ScrollController _scrollController = ScrollController();

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

  void _openViewer(List<MediaItem> items, int index) {
    final urls = items.map((e) => e.url).toList();
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => MediaViewerScreen(
          imageUrls: urls,
          initialIndex: index,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(feedPaginatorProvider);

    // Initial shimmer grid
    if (state.items.isEmpty && state.isLoading) {
      return _buildShimmerGrid();
    }

    // Empty state
    if (state.items.isEmpty && !state.isLoading) {
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
                    'No media yet',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    // Calculate total cells: items + optional loading row
    final itemCount = state.items.length +
        (state.isLoading ? 3 : 0); // pad to fill a row of shimmer

    return RefreshIndicator(
      color: MojoColors.primaryOrange,
      onRefresh: () => ref.read(feedPaginatorProvider.notifier).refresh(),
      child: GridView.builder(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(2),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3,
          mainAxisSpacing: 2,
          crossAxisSpacing: 2,
        ),
        itemCount: itemCount,
        itemBuilder: (context, index) {
          // Shimmer cells at the end while loading more
          if (index >= state.items.length) {
            return _buildShimmerCell();
          }

          final item = state.items[index];
          return GestureDetector(
            onTap: () => _openViewer(state.items, index),
            child: Stack(
              fit: StackFit.expand,
              children: [
                CachedNetworkImage(
                  imageUrl: item.thumbnailUrl,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => Shimmer.fromColors(
                    baseColor: Colors.grey.shade300,
                    highlightColor: Colors.grey.shade100,
                    child: Container(color: Colors.grey.shade300),
                  ),
                  errorWidget: (_, __, ___) => Container(
                    color: Colors.grey.shade200,
                    child: const Icon(Icons.broken_image, size: 24),
                  ),
                ),
                // Video indicator
                if (item.type == 'video')
                  const Positioned(
                    top: 4,
                    right: 4,
                    child: Icon(
                      Icons.videocam,
                      color: Colors.white,
                      size: 18,
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Shimmer helpers
  // ---------------------------------------------------------------------------

  Widget _buildShimmerGrid() {
    return GridView.builder(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.all(2),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 2,
        crossAxisSpacing: 2,
      ),
      itemCount: 12,
      itemBuilder: (_, __) => _buildShimmerCell(),
    );
  }

  Widget _buildShimmerCell() {
    return Shimmer.fromColors(
      baseColor: Colors.grey.shade300,
      highlightColor: Colors.grey.shade100,
      child: Container(color: Colors.grey.shade300),
    );
  }
}
