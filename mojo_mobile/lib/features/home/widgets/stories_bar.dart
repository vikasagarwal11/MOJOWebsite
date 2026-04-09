import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/network/firebase_error_messages.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../firebase_options.dart';
import '../../stories/data/datasources/stories_remote_data_source.dart';
import '../../stories/data/repositories/stories_repository_impl.dart';
import '../../stories/domain/entities/story.dart';
import '../../stories/domain/usecases/watch_recent_stories.dart';
import '../../stories/presentation/bloc/stories_bloc.dart';
import '../../stories/presentation/bloc/stories_event.dart';
import '../../stories/presentation/bloc/stories_state.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

class StoriesBar extends StatelessWidget {
  const StoriesBar({super.key});

  @override
  Widget build(BuildContext context) {
    if (!firebaseOptionsConfigured || Firebase.apps.isEmpty) {
      return _StoriesRow(
        children: const <Widget>[
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

    final bool signedIn = FirebaseAuth.instance.currentUser != null;
    if (!signedIn) {
      return _StoriesRow(
        children: const <Widget>[
          _AddStoryButton(),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'Sign in to see community stories.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ),
        ],
      );
    }

    return BlocProvider<StoriesBloc>(
      create: (_) {
        final StoriesRepositoryImpl repository = StoriesRepositoryImpl(
          remoteDataSource: StoriesRemoteDataSource(FirebaseFirestore.instance),
        );
        return StoriesBloc(
          watchRecentStories: WatchRecentStories(repository),
        )..add(const StoriesStarted());
      },
      child: const _StoriesContent(),
    );
  }
}

class _StoriesContent extends StatelessWidget {
  const _StoriesContent();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<StoriesBloc, StoriesState>(
      builder: (BuildContext context, StoriesState state) {
        if (state is StoriesFailure) {
          appLogger.w('Stories stream error: ${state.message}');
          final bool signedIn = FirebaseAuth.instance.currentUser != null;
          final String msg = !signedIn
              ? 'Sign in to see community stories.'
              : userFacingFirestoreMessage(state.message);
          return _StoriesRow(
            children: <Widget>[
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

        if (state is StoriesInitial || state is StoriesLoading) {
          return _StoriesRow(
            children: const <Widget>[
              _AddStoryButton(),
              SizedBox(width: 12),
              Expanded(
                child: Center(child: AppLoadingIndicator(strokeWidth: 2)),
              ),
            ],
          );
        }

        final List<Story> stories =
            state is StoriesLoaded ? state.stories : const <Story>[];

        final Map<String, List<Story>> grouped = <String, List<Story>>{};
        for (final Story story in stories) {
          grouped.putIfAbsent(story.userId, () => <Story>[]).add(story);
        }

        final List<String> userIds = grouped.keys.toList(growable: false);

        if (userIds.isEmpty) {
          return _StoriesRow(
            children: const <Widget>[
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
            itemBuilder: (BuildContext context, int index) {
              if (index == 0) return const _AddStoryButton();

              final String uid = userIds[index - 1];
              final List<Story> userStories = grouped[uid]!;
              final Story first = userStories.first;

              return _StoryCircle(
                profilePic: (first.authorPhotoUrl ?? '').isNotEmpty
                    ? first.authorPhotoUrl!
                    : 'https://i.pravatar.cc/150?u=$uid',
                displayName: (first.authorName ?? '').trim().isNotEmpty
                    ? first.authorName!.trim()
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
          SnackBar(
            content: Text(
              '$displayName · $storyCount stori${storyCount == 1 ? 'y' : 'es'} (viewer coming soon)',
            ),
          ),
        );
      },
      child: Column(
        children: <Widget>[
          Container(
            padding: const EdgeInsets.all(3),
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: MojoColors.mainGradient,
            ),
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: const BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
              ),
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
      children: <Widget>[
        Stack(
          children: <Widget>[
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
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
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


