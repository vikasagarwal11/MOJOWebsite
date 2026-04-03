import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lottie/lottie.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_event.dart';
import '../services/stripe_payment_service.dart';
import '../widgets/manage_rsvp_bottom_sheet.dart';
import '../widgets/rsvp_bottom_sheet.dart';

class EventsScreen extends ConsumerStatefulWidget {
  const EventsScreen({super.key});

  @override
  ConsumerState<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends ConsumerState<EventsScreen> {
  bool _showConfetti = false;

  void _handleRSVP(MojoEvent event) async {
    // 1. Trigger Premium Haptic Feedback
    HapticFeedback.lightImpact();

    // 2. Invoke the Native Stripe + RSVP Bottom Sheet
    final success = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => RsvpBottomSheet(event: event),
    );

    // 3. Show Success Animation if Payment/RSVP cleared
    if (success == true && mounted) {
      setState(() => _showConfetti = true);
      await Future.delayed(const Duration(seconds: 4));
      if (mounted) setState(() => _showConfetti = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Stack(
      children: [
        DefaultTabController(
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
                  Tab(text: "I'm Going"),
                ],
              ),
            ),
            body: TabBarView(
              children: [
                _UpcomingTab(onRSVP: _handleRSVP),
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

class _UpcomingTab extends ConsumerWidget {
  final Function(MojoEvent) onRSVP;
  const _UpcomingTab({required this.onRSVP});

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
          itemBuilder: (context, index) => _EventCard(
            event: events[index], 
            isPast: false,
            onRSVP: () => onRSVP(events[index]),
          ),
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

    final async = ref.watch(myRsvpsProvider);
    return async.when(
      data: (rows) {
        if (rows.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                'No "Going" RSVPs yet. Open Upcoming to find events, or change your RSVP to Going on an event.',
                textAlign: TextAlign.center,
                style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 16),
              ),
            ),
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: rows.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, i) => _MyRsvpTile(row: rows[i], scheme: scheme),
        );
      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Could not load RSVPs: $e\nIf this mentions an index, deploy Firestore indexes from the repo.',
            textAlign: TextAlign.center,
            style: TextStyle(color: scheme.onSurfaceVariant),
          ),
        ),
      ),
    );
  }
}

class _MyRsvpTile extends ConsumerWidget {
  const _MyRsvpTile({required this.row, required this.scheme});

  final MyRsvpRow row;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = row.attendeeDoc.data();
    final name = d['name'] as String? ?? 'Guest';
    final rsvpStatus = d['rsvpStatus'] as String? ?? '—';
    final paymentStatus = d['paymentStatus'] as String? ?? '—';
    final ev = row.event;
    final title = ev?.title ?? 'Event (details unavailable)';
    final when = ev != null ? DateFormat('EEE, MMM d · h:mm a').format(ev.startAt) : '';
    final user = ref.watch(authStateProvider).valueOrNull;
    final eventForPay = (paymentStatus == 'unpaid' &&
            ev != null &&
            ev.requiresStripeCheckout &&
            ev.startAt.isAfter(DateTime.now()))
        ? ev
        : null;
    final rawEventId = (d['eventId'] as String?)?.trim();
    final eventIdForNav = (rawEventId != null && rawEventId.isNotEmpty)
        ? rawEventId
        : row.attendeeDoc.reference.parent.parent?.id;

    return Card(
      elevation: 0,
      color: scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Colors.grey.shade100),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            GestureDetector(
              onTap: eventIdForNav != null ? () => context.push('/event/$eventIdForNav') : null,
              behavior: HitTestBehavior.opaque,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  if (when.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(when, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
                  ],
                  const SizedBox(height: 8),
                  Text(name, style: const TextStyle(fontSize: 14)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      Chip(
                        label: Text('RSVP: $rsvpStatus'),
                        visualDensity: VisualDensity.compact,
                        labelStyle: const TextStyle(fontSize: 12),
                      ),
                      Chip(
                        label: Text('Payment: $paymentStatus'),
                        visualDensity: VisualDensity.compact,
                        labelStyle: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                if (ev != null)
                  TextButton(
                    onPressed: () async {
                      await showManageRsvpSheet(
                        context: context,
                        ref: ref,
                        event: ev,
                        attendeeDoc: row.attendeeDoc,
                      );
                    },
                    child: const Text('Manage RSVP'),
                  ),
                if (eventForPay != null && user != null)
                  TextButton(
                    onPressed: () async {
                      final stripe = ref.read(stripePaymentServiceProvider);
                      final ok = await stripe.processEventRSVPPayment(
                        context: context,
                        eventId: eventForPay.id,
                        userId: user.uid,
                        attendeeIds: [row.attendeeDoc.id],
                        merchantDisplayName: 'Moms Fitness MOJO',
                      );
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(ok ? 'Payment completed.' : 'Payment was not completed.')),
                      );
                    },
                    child: const Text('Pay now'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EventCard extends StatelessWidget {
  const _EventCard({required this.event, this.isPast = false, this.onRSVP});

  final MojoEvent event;
  final bool isPast;
  final VoidCallback? onRSVP;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final monthShort = DateFormat('MMM').format(event.startAt);
    final dayNum = '${event.startAt.day}';
    final whenLine = DateFormat('EEE, MMM d · jm').format(event.startAt);
    final imageUrl = event.imageUrl;

    return InkWell(
      onTap: () => context.push('/event/${event.id}'),
      borderRadius: BorderRadius.circular(20),
      child: Card(
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
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    if (!isPast && event.visibility != null)
                      Chip(
                        label: Text(event.visibility!.replaceAll('_', ' ')),
                        visualDensity: VisualDensity.compact,
                        labelStyle: TextStyle(fontSize: 11, color: scheme.primary),
                      ),
                    const Spacer(),
                    if (!isPast && onRSVP != null)
                      ElevatedButton(
                        onPressed: onRSVP,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: scheme.primary,
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('RSVP'),
                      ),
                  ],
                ),
              ],
            ),
            ),
        ],
      ),
      ),
    );
  }
}
