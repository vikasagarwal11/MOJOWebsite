import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/providers/core_providers.dart';
import '../../../data/models/mojo_post.dart';
import '../widgets/create_post_sheet.dart';

enum _PostSort { newest, liked }

class PostsScreen extends ConsumerStatefulWidget {
  const PostsScreen({super.key});

  @override
  ConsumerState<PostsScreen> createState() => _PostsScreenState();
}

class _PostsScreenState extends ConsumerState<PostsScreen> {
  final _search = TextEditingController();
  String _query = '';
  _PostSort _sort = _PostSort.newest;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<MojoPost> _filterAndSort(List<MojoPost> raw) {
    final q = _query.trim().toLowerCase();
    var list = q.isEmpty
        ? List<MojoPost>.from(raw)
        : raw.where((p) {
            return p.title.toLowerCase().contains(q) ||
                p.content.toLowerCase().contains(q) ||
                (p.authorName ?? '').toLowerCase().contains(q);
          }).toList();

    if (_sort == _PostSort.liked) {
      list.sort((a, b) {
        final c = b.likeSortKey.compareTo(a.likeSortKey);
        return c != 0 ? c : b.createdAt.compareTo(a.createdAt);
      });
    } else {
      list.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    }
    return list;
  }

  Future<void> _openCreate() async {
    final user = ref.read(authStateProvider).valueOrNull;
    if (user == null) {
      if (mounted) context.push('/login');
      return;
    }
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => const CreatePostSheet(),
    );
    if (ok == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Post submitted for review (same as web).')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final async = ref.watch(postsFeedProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Community Feed', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Column(
              children: [
                TextField(
                  controller: _search,
                  decoration: InputDecoration(
                    hintText: 'Search posts…',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(28)),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    suffixIcon: _query.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _search.clear();
                              setState(() => _query = '');
                            },
                          )
                        : null,
                  ),
                  onChanged: (v) => setState(() => _query = v),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    ChoiceChip(
                      label: const Text('Newest'),
                      selected: _sort == _PostSort.newest,
                      onSelected: (_) => setState(() => _sort = _PostSort.newest),
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: const Text('Most liked'),
                      selected: _sort == _PostSort.liked,
                      onSelected: (_) => setState(() => _sort = _PostSort.liked),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: async.when(
              data: (List<MojoPost> posts) {
                final visible = _filterAndSort(posts);
                if (visible.isEmpty) {
                  return Center(
                    child: Text(
                      posts.isEmpty ? 'No posts yet.' : 'No posts match your search.',
                      style: TextStyle(color: scheme.onSurfaceVariant),
                    ),
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 88),
                  itemCount: visible.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 20),
                  itemBuilder: (context, index) => _PostCard(post: visible[index]),
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Could not load posts: $e')),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openCreate,
        backgroundColor: scheme.primary,
        child: const Icon(Icons.edit, color: Colors.white),
      ),
    );
  }
}

class _PostCard extends ConsumerStatefulWidget {
  const _PostCard({required this.post});

  final MojoPost post;

  @override
  ConsumerState<_PostCard> createState() => _PostCardState();
}

class _PostCardState extends ConsumerState<_PostCard> {
  Future<void> _toggleLike(String? uid) async {
    if (uid == null) {
      if (mounted) context.push('/login');
      return;
    }
    final profile = ref.read(userProfileProvider(uid)).valueOrNull;
    if (profile != null && !profile.isApproved) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Approved members can like posts.')),
      );
      return;
    }

    final likeRef = FirebaseFirestore.instance
        .collection('posts')
        .doc(widget.post.id)
        .collection('likes')
        .doc(uid);

    final snap = await likeRef.get();
    try {
      if (snap.exists) {
        await likeRef.delete();
      } else {
        await likeRef.set({
          'userId': uid,
          'createdAt': FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Like failed: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final timeAgo = DateFormat.yMMMd().add_jm().format(widget.post.createdAt);
    final body = widget.post.content.trim().isNotEmpty ? widget.post.content : ' ';
    final uid = ref.watch(authStateProvider).valueOrNull?.uid;
    final countLabel = '${widget.post.likesCount ?? widget.post.totalReactions ?? 0}';
    final commentsLabel = '${widget.post.commentsCount ?? 0}';

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
                  backgroundImage: widget.post.authorPhotoUrl != null && widget.post.authorPhotoUrl!.isNotEmpty
                      ? CachedNetworkImageProvider(widget.post.authorPhotoUrl!)
                      : null,
                  child: widget.post.authorPhotoUrl == null || widget.post.authorPhotoUrl!.isEmpty
                      ? Icon(Icons.person, color: scheme.primary)
                      : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.post.authorName ?? 'Member', style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text(
                        timeAgo,
                        style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (widget.post.imageUrl != null && widget.post.imageUrl!.isNotEmpty)
            ClipRRect(
              child: CachedNetworkImage(
                imageUrl: widget.post.imageUrl!,
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
                if (widget.post.title.trim().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(widget.post.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  ),
                Text(
                  body,
                  style: const TextStyle(fontSize: 14, height: 1.5),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    if (uid != null)
                      StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
                        stream: FirebaseFirestore.instance
                            .collection('posts')
                            .doc(widget.post.id)
                            .collection('likes')
                            .doc(uid)
                            .snapshots(),
                        builder: (context, snap) {
                          final liked = snap.data?.exists ?? false;
                          return InkWell(
                            onTap: () => _toggleLike(uid),
                            borderRadius: BorderRadius.circular(8),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                              child: Row(
                                children: [
                                  Icon(
                                    FontAwesomeIcons.heart,
                                    size: 18,
                                    color: liked ? Colors.red : Colors.red.shade200,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(countLabel, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                                ],
                              ),
                            ),
                          );
                        },
                      )
                    else
                      InkWell(
                        onTap: () => context.push('/login'),
                        child: Row(
                          children: [
                            Icon(FontAwesomeIcons.heart, size: 18, color: Colors.red.shade200),
                            const SizedBox(width: 6),
                            Text(countLabel, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                          ],
                        ),
                      ),
                    const SizedBox(width: 20),
                    Row(
                      children: [
                        Icon(FontAwesomeIcons.comment, size: 18, color: Colors.blue.shade300),
                        const SizedBox(width: 6),
                        Text(commentsLabel, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      ],
                    ),
                    const Spacer(),
                    Icon(Icons.bookmark_border, color: scheme.onSurfaceVariant),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Comments open on web; mobile thread coming soon.',
                  style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
