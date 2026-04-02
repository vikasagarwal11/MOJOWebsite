import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../firebase_options.dart';

/// Instagram-style stories from Firestore `stories` (24h window, `createdAt` as Timestamp).
class StoriesBar extends StatelessWidget {
  const StoriesBar({super.key});

  static bool _isNotExpired(Map<String, dynamic> data, DateTime now) {
    final exp = data['expiresAt'];
    if (exp == null) return true;
    if (exp is Timestamp) return exp.toDate().isAfter(now);
    if (exp is String) {
      try {
        return DateTime.parse(exp).isAfter(now);
      } catch (_) {
        return true;
      }
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    if (!firebaseOptionsConfigured || Firebase.apps.isEmpty) {
      return _StoriesRow(
        children: const [
          _AddStoryButton(),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Community stories load after Firebase is initialized.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ),
        ],
      );
    }

    // Single-field orderBy uses the default index; filter last 24h client-side (avoids composite index).
    final cutoff = DateTime.now().subtract(const Duration(hours: 24));

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('stories')
          .orderBy('createdAt', descending: true)
          .limit(100)
          .snapshots(),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          appLogger.w('Stories stream error: ${snapshot.error}');
          final signedIn = FirebaseAuth.instance.currentUser != null;
          final msg = !signedIn
              ? 'Sign in to see community stories.'
              : 'Stories could not load. Deploy updated Firestore rules (stories collection) or check your connection.';
          return _StoriesRow(
            children: [
              const _AddStoryButton(),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  msg,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
              ),
            ],
          );
        }

        if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
          return _StoriesRow(
            children: [
              const _AddStoryButton(),
              const SizedBox(width: 12),
              const Expanded(
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),
            ],
          );
        }

        final now = DateTime.now();
        final docs = snapshot.data?.docs ?? [];
        final activeDocs = docs.where((d) {
          final data = d.data();
          final created = data['createdAt'];
          DateTime? createdAt;
          if (created is Timestamp) {
            createdAt = created.toDate();
          } else if (created is String) {
            try {
              createdAt = DateTime.parse(created);
            } catch (_) {}
          }
          if (createdAt != null && createdAt.isBefore(cutoff)) return false;
          return _isNotExpired(data, now);
        }).toList();

        final Map<String, List<QueryDocumentSnapshot<Map<String, dynamic>>>> grouped = {};
        for (final doc in activeDocs) {
          final data = doc.data();
          final uid = data['userId'] as String? ?? 'unknown';
          grouped.putIfAbsent(uid, () => []).add(doc);
        }

        final userIds = grouped.keys.toList();

        if (userIds.isEmpty) {
          return _StoriesRow(
            children: const [
              _AddStoryButton(),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'No stories in the last 24 hours. Add yours from Media.',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ),
            ],
          );
        }

        return SizedBox(
          height: 100,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: userIds.length + 1,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              if (index == 0) return const _AddStoryButton();

              final uid = userIds[index - 1];
              final userStories = grouped[uid]!;
              final first = userStories.first.data();
              final String? profilePic = first['authorPhotoUrl'] as String?;

              return _StoryCircle(
                profilePic: profilePic ?? 'https://i.pravatar.cc/150?u=$uid',
                displayName: (first['authorName'] as String?)?.trim().isNotEmpty == true
                    ? first['authorName'] as String
                    : 'Member',
                storyCount: userStories.length,
              );
            },
          ),
        );
      },
    );
  }
}

class _StoriesRow extends StatelessWidget {
  const _StoriesRow({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 100,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: children,
        ),
      ),
    );
  }
}

class _StoryCircle extends StatelessWidget {
  const _StoryCircle({
    required this.profilePic,
    required this.displayName,
    required this.storyCount,
  });

  final String profilePic;
  final String displayName;
  final int storyCount;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$displayName · $storyCount stori${storyCount == 1 ? 'y' : 'es'} (viewer coming soon)')),
        );
      },
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(3),
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: MojoColors.mainGradient,
            ),
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
              child: CircleAvatar(
                radius: 30,
                backgroundImage: NetworkImage(profilePic),
              ),
            ),
          ),
          const SizedBox(height: 4),
          SizedBox(
            width: 72,
            child: Text(
              displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddStoryButton extends StatelessWidget {
  const _AddStoryButton();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Stack(
          children: [
            const CircleAvatar(
              radius: 33,
              backgroundColor: Colors.grey,
              child: Icon(Icons.person, color: Colors.white, size: 40),
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                child: const CircleAvatar(
                  radius: 10,
                  backgroundColor: MojoColors.primaryOrange,
                  child: Icon(Icons.add, color: Colors.white, size: 14),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        const Text('Your Story', style: TextStyle(fontSize: 11)),
      ],
    );
  }
}
