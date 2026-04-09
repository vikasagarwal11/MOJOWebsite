import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

/// Groups `events/{id}/attendees` the same way as web [WhosGoingTab]: primary name + family count.
class _GoingGroup {
  _GoingGroup({
    required this.userKey,
    required this.displayName,
    required this.goingCount,
  });

  final String userKey;
  final String displayName;
  final int goingCount;
}

List<_GoingGroup> _groupGoing(List<QueryDocumentSnapshot<Map<String, dynamic>>> docs) {
  final goingDocs = docs.where((d) => d.data()['rsvpStatus'] == 'going').toList();
  final byUser = <String, List<QueryDocumentSnapshot<Map<String, dynamic>>>>{};

  for (final d in goingDocs) {
    final data = d.data();
    final uid = (data['userId'] as String?)?.trim();
    final key = (uid != null && uid.isNotEmpty) ? uid : d.id;
    byUser.putIfAbsent(key, () => []).add(d);
  }

  final out = <_GoingGroup>[];
  for (final entry in byUser.entries) {
    final list = entry.value;
    QueryDocumentSnapshot<Map<String, dynamic>>? primary;
    for (final d in list) {
      if (d.data()['attendeeType'] == 'primary') {
        primary = d;
        break;
      }
    }
    primary ??= (list.isNotEmpty ? list.first : null);
    if (primary == null) continue;
    final name = (primary.data()['name'] as String?)?.trim();
    final display = (name != null && name.isNotEmpty) ? name : 'Member';
    out.add(_GoingGroup(
      userKey: entry.key,
      displayName: display,
      goingCount: list.length,
    ));
  }

  out.sort((a, b) => a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase()));
  return out;
}

class EventWhosGoingSection extends ConsumerWidget {
  const EventWhosGoingSection({super.key, required this.eventId, required this.attendingCount});

  final String eventId;
  final int attendingCount;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final async = ref.watch(eventAttendeesOrderedProvider(eventId));

    return async.when(
      data: (docs) {
        final groups = _groupGoing(docs);
        if (groups.isEmpty && attendingCount <= 0) {
          return const SizedBox.shrink();
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 20),
            Row(
              children: [
                Icon(Icons.people_outline, size: 22, color: scheme.primary),
                const SizedBox(width: 8),
                Text(
                  "Who's going",
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const Spacer(),
                Text(
                  '$attendingCount going',
                  style: TextStyle(color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (groups.isEmpty)
              Text(
                'Names will appear here as members RSVP (same as the website).',
                style: TextStyle(color: scheme.onSurfaceVariant, height: 1.35),
              )
            else
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: groups
                    .map(
                      (g) => Chip(
                        avatar: CircleAvatar(
                          backgroundColor: scheme.primaryContainer,
                          child: Text(
                            g.displayName.isNotEmpty ? g.displayName[0].toUpperCase() : '?',
                            style: TextStyle(
                              fontSize: 14,
                              color: scheme.onPrimaryContainer,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        label: Text(
                          g.goingCount > 1 ? '${g.displayName} +${g.goingCount - 1}' : g.displayName,
                        ),
                      ),
                    )
                    .toList(),
              ),
          ],
        );
      },
      loading: () => Padding(
        padding: const EdgeInsets.only(top: 20),
        child: Row(
          children: [
            SizedBox(width: 20, height: 20, child: AppLoadingIndicator(strokeWidth: 2, color: scheme.primary)),
            const SizedBox(width: 12),
            Text('Loading guest listâ€¦', style: TextStyle(color: scheme.onSurfaceVariant)),
          ],
        ),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.only(top: 16),
        child: Text(
          'Could not load who is going. You can still RSVP from below.',
          style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
        ),
      ),
    );
  }
}

