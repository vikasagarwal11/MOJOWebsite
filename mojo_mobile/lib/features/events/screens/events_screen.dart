import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_event.dart';

class EventsScreen extends ConsumerWidget {
  const EventsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Mojo Events', style: TextStyle(fontWeight: FontWeight.bold)),
          bottom: TabBar(
            indicatorColor: scheme.primary,
            labelColor: scheme.primary,
            unselectedLabelColor: MojoColors.textSecondary,
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: const [
              Tab(text: 'Upcoming'),
              Tab(text: 'Past'),
              Tab(text: 'My RSVPs'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            const _UpcomingTab(),
            const _PastTab(),
            _RsvpTab(scheme: scheme),
          ],
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () {},
          backgroundColor: scheme.primary,
          icon: const Icon(Icons.add, color: Colors.white),
          label: const Text('Host Event', style: TextStyle(color: Colors.white)),
        ),
      ),
    );
  }
}

class _UpcomingTab extends ConsumerWidget {
  const _UpcomingTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(upcomingEventsProvider);
    final scheme = Theme.of(context).colorScheme;

    return async.when(
      data: (List<MojoEvent> events) {
        if (events.isEmpty) {
          return Center(
            child: Text(
              'No upcoming events yet.',
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: events.length,
          separatorBuilder: (_, __) => const SizedBox(height: 16),
          itemBuilder: (context, index) => _EventCard(event: events[index], isPast: false),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Could not load events: $e')),
    );
  }
}

class _PastTab extends ConsumerWidget {
  const _PastTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(pastEventsProvider);
    final scheme = Theme.of(context).colorScheme;

    return async.when(
      data: (List<MojoEvent> events) {
        if (events.isEmpty) {
          return Center(
            child: Text(
              'No past events to show.',
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: events.length,
          separatorBuilder: (_, __) => const SizedBox(height: 16),
          itemBuilder: (context, index) => _EventCard(event: events[index], isPast: true),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Could not load past events: $e')),
    );
  }
}

class _RsvpTab extends ConsumerWidget {
  const _RsvpTab({required this.scheme});

  final ColorScheme scheme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider).valueOrNull;
    if (user == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.event_available, size: 56, color: scheme.primary.withValues(alpha: 0.5)),
              const SizedBox(height: 16),
              Text(
                'Sign in to see events you RSVP’d to.',
                textAlign: TextAlign.center,
                style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 16),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => context.push('/login'),
                child: const Text('Sign in'),
              ),
            ],
          ),
        ),
      );
    }
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'RSVP list from Firestore (events/{id}/rsvps) will be wired in a follow-up.',
          textAlign: TextAlign.center,
          style: TextStyle(color: scheme.onSurfaceVariant),
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event, this.isPast = false});

  final MojoEvent event;
  final bool isPast;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final monthShort = DateFormat('MMM').format(event.startAt);
    final dayNum = '${event.startAt.day}';
    final whenLine = DateFormat('EEE, MMM d · jm').format(event.startAt);
    final imageUrl = event.imageUrl;

    return Card(
      elevation: 0,
      color: scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: Colors.grey.shade100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            child: SizedBox(
              height: 160,
              width: double.infinity,
              child: imageUrl != null && imageUrl.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: imageUrl,
                      fit: BoxFit.cover,
                      placeholder: (_, __) => Container(color: scheme.surfaceContainerHighest),
                      errorWidget: (_, __, ___) => Container(
                        color: scheme.surfaceContainerHighest,
                        alignment: Alignment.center,
                        child: Icon(Icons.event, color: scheme.primary, size: 48),
                      ),
                    )
                  : Container(
                      color: scheme.surfaceContainerHighest,
                      alignment: Alignment.center,
                      child: Icon(Icons.event, color: scheme.primary, size: 48),
                    ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (isPast)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Chip(
                      label: const Text('Past'),
                      visualDensity: VisualDensity.compact,
                      backgroundColor: scheme.surfaceContainerHighest,
                      labelStyle: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                    ),
                  ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        event.title,
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: scheme.secondary.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        children: [
                          Text(
                            monthShort.toUpperCase(),
                            style: TextStyle(
                              fontSize: 10,
                              color: scheme.secondary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            dayNum,
                            style: TextStyle(
                              fontSize: 14,
                              color: scheme.secondary,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.schedule, size: 16, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        whenLine,
                        style: TextStyle(color: scheme.onSurfaceVariant),
                      ),
                    ),
                  ],
                ),
                if (event.subtitleLine.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Icon(Icons.place_outlined, size: 16, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          event.subtitleLine,
                          style: TextStyle(color: scheme.onSurfaceVariant),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
                if (!isPast && event.visibility != null) ...[
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Chip(
                      label: Text(event.visibility!.replaceAll('_', ' ')),
                      visualDensity: VisualDensity.compact,
                      labelStyle: TextStyle(fontSize: 11, color: scheme.primary),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
