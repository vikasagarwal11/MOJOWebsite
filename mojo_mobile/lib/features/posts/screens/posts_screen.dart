import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:intl/intl.dart';

import '../../../core/providers/core_providers.dart';
import '../../../data/models/mojo_post.dart';

class PostsScreen extends ConsumerWidget {
  const PostsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final async = ref.watch(postsFeedProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Community Feed', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(icon: const Icon(Icons.search), onPressed: () {}),
        ],
      ),
      body: async.when(
        data: (List<MojoPost> posts) {
          if (posts.isEmpty) {
            return Center(
              child: Text(
                'No posts yet.',
                style: TextStyle(color: scheme.onSurfaceVariant),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: posts.length,
            separatorBuilder: (_, __) => const SizedBox(height: 20),
            itemBuilder: (context, index) => _PostCard(post: posts[index]),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load posts: $e')),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {},
        backgroundColor: scheme.primary,
        child: const Icon(Icons.edit, color: Colors.white),
      ),
    );
  }
}

class _PostCard extends StatelessWidget {
  const _PostCard({required this.post});

  final MojoPost post;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final timeAgo = DateFormat.yMMMd().add_jm().format(post.createdAt);
    final body = post.content.trim().isNotEmpty ? post.content : ' ';

    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                CircleAvatar(
                  backgroundImage: post.authorPhotoUrl != null && post.authorPhotoUrl!.isNotEmpty
                      ? CachedNetworkImageProvider(post.authorPhotoUrl!)
                      : null,
                  child: post.authorPhotoUrl == null || post.authorPhotoUrl!.isEmpty
                      ? Icon(Icons.person, color: scheme.primary)
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(post.authorName ?? 'Member', style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text(
                        timeAgo,
                        style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                IconButton(icon: const Icon(Icons.more_horiz), onPressed: () {}),
              ],
            ),
          ),
          if (post.imageUrl != null && post.imageUrl!.isNotEmpty)
            ClipRRect(
              child: CachedNetworkImage(
                imageUrl: post.imageUrl!,
                fit: BoxFit.cover,
                width: double.infinity,
                height: 250,
                placeholder: (_, __) => SizedBox(
                  height: 250,
                  child: Center(child: CircularProgressIndicator(color: scheme.primary)),
                ),
                errorWidget: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (post.title.trim().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(post.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  ),
                Text(
                  body,
                  style: const TextStyle(fontSize: 14, height: 1.5),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    _ReactionItem(icon: FontAwesomeIcons.heart, label: '—', color: Colors.red),
                    const SizedBox(width: 20),
                    _ReactionItem(icon: FontAwesomeIcons.comment, label: '—', color: Colors.blue),
                    const Spacer(),
                    Icon(Icons.bookmark_border, color: scheme.onSurfaceVariant),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReactionItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _ReactionItem({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 6),
        Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
      ],
    );
  }
}
