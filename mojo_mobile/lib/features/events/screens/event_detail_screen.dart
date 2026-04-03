import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lottie/lottie.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_event.dart';
import '../widgets/event_whos_going_section.dart';
import '../widgets/manage_rsvp_bottom_sheet.dart';
import '../widgets/rsvp_bottom_sheet.dart';

class EventDetailScreen extends ConsumerStatefulWidget {
  const EventDetailScreen({super.key, required this.eventId});

  final String eventId;

  @override
  ConsumerState<EventDetailScreen> createState() => _EventDetailScreenState();
}

QueryDocumentSnapshot<Map<String, dynamic>>? _pickPrimaryOrFirst(
  List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
) {
  for (final d in docs) {
    if (d.data()['attendeeType'] == 'primary') return d;
  }
  return docs.isEmpty ? null : docs.first;
}

class _EventDetailScreenState extends ConsumerState<EventDetailScreen> {
  bool _showConfetti = false;

  Future<void> _openRsvp() async {
    final ev = ref.read(eventByIdProvider(widget.eventId)).valueOrNull;
    if (ev == null) return;
    HapticFeedback.lightImpact();
    final success = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => RsvpBottomSheet(event: ev),
    );
    if (success == true && mounted) {
      setState(() => _showConfetti = true);
      await Future.delayed(const Duration(seconds: 4));
      if (mounted) setState(() => _showConfetti = false);
    }
  }

  Future<void> _openManageRsvp(MojoEvent ev, QueryDocumentSnapshot<Map<String, dynamic>> doc) async {
    await showManageRsvpSheet(
      context: context,
      ref: ref,
      event: ev,
      attendeeDoc: doc,
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final async = ref.watch(eventByIdProvider(widget.eventId));
    final myAttendeeDocs =
        ref.watch(userAttendeesForEventProvider(widget.eventId)).valueOrNull ?? [];
    final myAttendeeDoc = _pickPrimaryOrFirst(myAttendeeDocs);

    return Stack(
      children: [
        Scaffold(
          appBar: AppBar(
            title: const Text('Event'),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () {
                if (context.canPop()) {
                  context.pop();
                } else {
                  context.go('/events');
                }
              },
            ),
          ),
          body: async.when(
            data: (ev) {
              if (ev == null) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'This event is no longer available or you may not have access.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: scheme.onSurfaceVariant),
                    ),
                  ),
                );
              }
              final isPast = ev.startAt.isBefore(DateTime.now());
              final whenLine = DateFormat('EEEE, MMM d, yyyy · h:mm a').format(ev.startAt);
              final imageUrl = ev.imageUrl;

              return SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (imageUrl != null && imageUrl.isNotEmpty)
                      AspectRatio(
                        aspectRatio: 16 / 9,
                        child: CachedNetworkImage(
                          imageUrl: imageUrl,
                          fit: BoxFit.cover,
                          placeholder: (_, __) => Container(color: scheme.surfaceContainerHighest),
                          errorWidget: (_, __, ___) => Container(
                            color: scheme.surfaceContainerHighest,
                            alignment: Alignment.center,
                            child: Icon(Icons.event, color: scheme.primary, size: 48),
                          ),
                        ),
                      )
                    else
                      Container(
                        height: 160,
                        color: scheme.surfaceContainerHighest,
                        alignment: Alignment.center,
                        child: Icon(Icons.event, color: scheme.primary, size: 56),
                      ),
                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (isPast)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Chip(
                                label: const Text('Past event'),
                                visualDensity: VisualDensity.compact,
                                backgroundColor: scheme.surfaceContainerHighest,
                              ),
                            ),
                          Text(
                            ev.title,
                            style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(Icons.schedule, size: 20, color: scheme.onSurfaceVariant),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(whenLine, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 15)),
                              ),
                            ],
                          ),
                          if (ev.subtitleLine.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(Icons.place_outlined, size: 20, color: scheme.onSurfaceVariant),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    ev.subtitleLine,
                                    style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 15),
                                  ),
                                ),
                              ],
                            ),
                          ],
                          if (ev.description != null && ev.description!.trim().isNotEmpty) ...[
                            const SizedBox(height: 20),
                            Text(
                              ev.description!.trim(),
                              style: TextStyle(color: scheme.onSurface, height: 1.4),
                            ),
                          ],
                          EventWhosGoingSection(
                            eventId: widget.eventId,
                            attendingCount: ev.attendingCount,
                          ),
                          if (ev.visibility != null) ...[
                            const SizedBox(height: 16),
                            Chip(
                              label: Text(ev.visibility!.replaceAll('_', ' ')),
                              visualDensity: VisualDensity.compact,
                              labelStyle: TextStyle(fontSize: 12, color: scheme.primary),
                            ),
                          ],
                          if (!isPast) ...[
                            const SizedBox(height: 28),
                            if (myAttendeeDoc != null) ...[
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Your RSVP: ${myAttendeeDoc.data()['rsvpStatus'] ?? '—'}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 16,
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    SizedBox(
                                      width: double.infinity,
                                      child: FilledButton(
                                        onPressed: () => _openManageRsvp(ev, myAttendeeDoc),
                                        style: FilledButton.styleFrom(
                                          padding: const EdgeInsets.symmetric(vertical: 16),
                                          backgroundColor: MojoColors.primaryOrange,
                                          foregroundColor: Colors.white,
                                        ),
                                        child: const Text(
                                          'Manage my RSVP',
                                          style: TextStyle(fontWeight: FontWeight.bold),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      'Change to Not going, switch back to Going, or update waitlist status — same as the website.',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: scheme.onSurfaceVariant,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ] else
                              SizedBox(
                                width: double.infinity,
                                child: FilledButton(
                                  onPressed: _openRsvp,
                                  style: FilledButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(vertical: 16),
                                    backgroundColor: MojoColors.primaryOrange,
                                    foregroundColor: Colors.white,
                                  ),
                                  child: Text(
                                    ev.requiresStripeCheckout ? 'RSVP & pay' : 'RSVP',
                                    style: const TextStyle(fontWeight: FontWeight.bold),
                                  ),
                                ),
                              ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Could not load event: $e', textAlign: TextAlign.center),
              ),
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
