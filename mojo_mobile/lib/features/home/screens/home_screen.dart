import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lottie/lottie.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_event.dart';
import '../../../data/models/mojo_post.dart';
import '../widgets/qr_invite_dialog.dart';
import '../widgets/stories_bar.dart';
import '../widgets/progress_card.dart';
import '../../events/widgets/rsvp_bottom_sheet.dart';

/// Keeps [ref.listen] out of a conditional — Riverpod requires a stable listener lifecycle.
class _ProfilePendingApprovalListener extends ConsumerWidget {
  const _ProfilePendingApprovalListener({required this.uid});

  final String uid;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(userProfileProvider(uid), (prev, next) {
      final s = next.valueOrNull?.status;
      if (s == 'pending' || s == 'needs_clarification') {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted) context.go('/pending-approval');
        });
      }
    });
    return const SizedBox.shrink();
  }
}

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _showConfetti = false;

  Future<void> _handleHomeRsvp(MojoEvent event) async {
    HapticFeedback.lightImpact();
    final success = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => RsvpBottomSheet(event: event),
    );
    if (success == true && mounted) {
      setState(() => _showConfetti = true);
      await Future.delayed(const Duration(seconds: 4));
      if (mounted) setState(() => _showConfetti = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final user = ref.watch(authStateProvider).valueOrNull;

    return Stack(
      children: [
        if (user != null) _ProfilePendingApprovalListener(uid: user.uid),
        Scaffold(
          appBar: AppBar(
        title: const Text('MOJO', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 2)),
        actions: [
          Consumer(
            builder: (context, ref, _) {
              final unread = ref.watch(unreadNotificationCountProvider);
              final n = unread.valueOrNull ?? 0;
              return IconButton(
                tooltip: 'Notifications',
                onPressed: () => context.push('/notifications'),
                icon: Badge(
                  isLabelVisible: n > 0,
                  label: Text(n > 99 ? '99+' : '$n'),
                  child: const Icon(Icons.notifications_outlined),
                ),
              );
            },
          ),
          Consumer(
            builder: (context, ref, _) {
              final user = ref.watch(authStateProvider).valueOrNull;
              if (user == null) return const SizedBox.shrink();
              return IconButton(
                icon: const Icon(Icons.qr_code_2_outlined),
                tooltip: 'Invite a friend',
                onPressed: () {
                  final profile = ref.read(userProfileProvider(user.uid)).valueOrNull;
                  final name = profile?.resolvedPublicName?.trim().isNotEmpty == true
                      ? profile!.resolvedPublicName!.trim()
                      : (user.displayName ?? 'MOJO');
                  showDialog<void>(
                    context: context,
                    builder: (ctx) => QrInviteDialog(userId: user.uid, userName: name),
                  );
                },
              );
            },
          ),
          Consumer(
            builder: (context, ref, _) {
              final user = ref.watch(authStateProvider).valueOrNull;
              final uid = user?.uid;
              final photoUrl = uid != null
                  ? ref.watch(userProfileProvider(uid)).valueOrNull?.photoUrl ?? user?.photoURL
                  : null;
              return Padding(
                padding: const EdgeInsets.only(right: 16),
                child: GestureDetector(
                  onTap: () => context.go('/profile'),
                  child: CircleAvatar(
                    radius: 18,
                    backgroundImage: photoUrl != null && photoUrl.isNotEmpty ? NetworkImage(photoUrl) : null,
                    child: photoUrl == null || photoUrl.isEmpty ? const Icon(Icons.person, size: 20) : null,
                  ),
                ),
              );
            },
          ),
          ],
        ),
        body: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 10),
              const StoriesBar().animate().fadeIn(duration: 600.ms).slideX(begin: 0.1, end: 0),
              const SizedBox(height: 20),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _WelcomeSection(scheme: scheme),
                    const SizedBox(height: 24),
                    const ProgressCard().animate().fadeIn(delay: 200.ms),
                    const SizedBox(height: 24),
                    _SectionHeader(title: 'Upcoming Events', onSeeAll: () => context.go('/events')),
                    const SizedBox(height: 12),
                    _UpcomingEventsStrip(onOpenRsvp: _handleHomeRsvp),
                    const SizedBox(height: 24),
                    _SectionHeader(title: 'Community Feed', onSeeAll: () => context.go('/posts')),
                    const SizedBox(height: 12),
                    const _HomePostsPreview(),
                    const SizedBox(height: 30),
                  ],
                ),
              ),
            ],
          ),
        ),
        ),
        if (_showConfetti)
          IgnorePointer(
            child: Center(
              child: Lottie.network(
                'https://assets9.lottiefiles.com/packages/lf20_u4yrau.json',
                repeat: false,
              ),
            ),
          ),
      ],
    );
  }
}

class _WelcomeSection extends ConsumerWidget {
  const _WelcomeSection({required this.scheme});

  final ColorScheme scheme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider).valueOrNull;
    final uid = user?.uid;
    final profileName =
        uid != null ? ref.watch(userProfileProvider(uid)).valueOrNull?.resolvedPublicName : null;
    final firstName = (profileName ?? user?.displayName ?? user?.email?.split('@').first ?? 'Mojo Mom').split(' ').first;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: MojoColors.mainGradient,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: MojoColors.primaryOrange.withOpacity(0.3),
            blurRadius: 15,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Ready for today, $firstName?', style: const TextStyle(color: Colors.white70, fontSize: 16)),
                const Text('Let\'s crush it! 💪', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle),
            child: ClipOval(
              child: SvgPicture.asset(
                'assets/images/mfm_logo.svg',
                width: 44,
                height: 44,
                fit: BoxFit.cover,
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 600.ms).slideY(begin: 0.2, end: 0);
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final VoidCallback onSeeAll;

  const _SectionHeader({required this.title, required this.onSeeAll});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        TextButton(onPressed: onSeeAll, child: const Text('See All')),
      ],
    );
  }
}

class _UpcomingEventsStrip extends ConsumerWidget {
  const _UpcomingEventsStrip({required this.onOpenRsvp});

  final Future<void> Function(MojoEvent) onOpenRsvp;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(upcomingEventsProvider);

    return async.when(
      data: (List<MojoEvent> events) {
        final slice = events.take(6).toList();
        if (slice.isEmpty) return const SizedBox();
        return SizedBox(
          height: 272,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: slice.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (context, index) {
              final ev = slice[index];
              return _HomeEventCard(
                event: ev,
                onOpenDetail: () => context.push('/event/${ev.id}'),
                onRSVP: () => onOpenRsvp(ev),
              );
            },
          ),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(child: Text('Events: $err')),
    );
  }
}

class _HomeEventCard extends StatelessWidget {
  const _HomeEventCard({required this.event, this.onOpenDetail, this.onRSVP});

  final MojoEvent event;
  final VoidCallback? onOpenDetail;
  final VoidCallback? onRSVP;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 280,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10)],
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onOpenDetail,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                    child: SizedBox(
                      height: 76,
                      width: double.infinity,
                      child: event.imageUrl != null
                          ? CachedNetworkImage(imageUrl: event.imageUrl!, fit: BoxFit.cover)
                          : Container(color: Colors.grey.shade100),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          event.title,
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, height: 1.2),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            const Icon(Icons.access_time, size: 11, color: Colors.grey),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                DateFormat('MMM d, h:mm a').format(event.startAt),
                                style: const TextStyle(fontSize: 11, color: Colors.grey),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (onRSVP != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 4, 10, 8),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: onRSVP,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    backgroundColor: scheme.primary,
                    foregroundColor: scheme.onPrimary,
                  ),
                  child: const Text('RSVP', style: TextStyle(fontSize: 12)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _HomePostsPreview extends ConsumerWidget {
  const _HomePostsPreview();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(postsFeedProvider);

    return async.when(
      data: (List<MojoPost> posts) {
        final slice = posts.take(3).toList();
        return ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: slice.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, index) {
            final p = slice[index];
            return ListTile(
              onTap: () => context.go('/posts'),
              leading: CircleAvatar(
                backgroundImage: p.authorPhotoUrl != null ? NetworkImage(p.authorPhotoUrl!) : null,
              ),
              title: Text(p.title, style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text(p.authorName ?? 'Member'),
              trailing: const Icon(Icons.chevron_right),
              tileColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            );
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Text('Posts: $e'),
    );
  }
}
