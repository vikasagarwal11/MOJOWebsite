import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../firebase_options.dart';
import '../services/auth_service.dart';
import '../../features/chat/services/chat_service.dart';
import '../../features/events/services/rsvp_update_service.dart';
import 'package:mojo_mobile/data/models/mojo_event.dart';
import 'package:mojo_mobile/data/models/mojo_post.dart';
import 'package:mojo_mobile/data/models/mojo_user_profile.dart';
import 'package:mojo_mobile/data/repositories/events_repository.dart';
import 'package:mojo_mobile/data/repositories/posts_repository.dart';
import '../branding/platform_branding.dart';

final firebaseAuthProvider =
    Provider<FirebaseAuth>((ref) => FirebaseAuth.instance);

final firestoreProvider =
    Provider<FirebaseFirestore>((ref) => FirebaseFirestore.instance);

/// Same region as web ([VITE_FIREBASE_FUNCTIONS_REGION] / `us-east1`).
final firebaseFunctionsProvider = Provider<FirebaseFunctions>(
  (ref) => FirebaseFunctions.instanceFor(region: 'us-east1'),
);

/// Shared [ChatService] using the same Functions region as web (`us-east1`).
final chatServiceProvider = Provider<ChatService>(
  (ref) => ChatService(functions: ref.watch(firebaseFunctionsProvider)),
);

final authServiceProvider = Provider<AuthService>(
  (ref) => AuthService(
    ref.watch(firebaseAuthProvider),
    ref.watch(firestoreProvider),
    ref.watch(firebaseFunctionsProvider),
  ),
);

final eventsRepositoryProvider = Provider<EventsRepository>(
  (ref) => EventsRepository(ref.watch(firestoreProvider)),
);

final postsRepositoryProvider = Provider<PostsRepository>(
  (ref) => PostsRepository(ref.watch(firestoreProvider)),
);

final rsvpUpdateServiceProvider = Provider<RsvpUpdateService>(
  (ref) => RsvpUpdateService(ref.watch(firestoreProvider)),
);

/// Signed-in user's attendee documents for [eventId] (RSVP status / manage flow).
final userAttendeesForEventProvider = StreamProvider.family<
    List<QueryDocumentSnapshot<Map<String, dynamic>>>, String>((ref, eventId) {
  if (!firebaseOptionsConfigured || eventId.isEmpty) {
    return Stream.value(const []);
  }
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) {
    return Stream.value(const []);
  }
  return ref
      .watch(firestoreProvider)
      .collection('events')
      .doc(eventId)
      .collection('attendees')
      .where('userId', isEqualTo: user.uid)
      .snapshots()
      .map((s) => s.docs);
});

final authStateProvider = StreamProvider<User?>((ref) {
  if (!firebaseOptionsConfigured) {
    return Stream<User?>.value(null);
  }
  return ref.watch(firebaseAuthProvider).authStateChanges();
});

final userProfileProvider =
    StreamProvider.family<MojoUserProfile?, String>((ref, uid) {
  if (!firebaseOptionsConfigured) {
    return Stream<MojoUserProfile?>.value(null);
  }
  return ref
      .watch(firestoreProvider)
      .collection('users')
      .doc(uid)
      .snapshots()
      .map((d) => d.exists ? MojoUserProfile.fromDoc(d) : null);
});

/// Whether the signed-in user should use the broader posts query (matches web: approved or legacy no-status).
final useMemberPostFeedProvider = Provider<bool>((ref) {
  final auth = ref.watch(authStateProvider);
  return auth.maybeWhen(
    data: (user) {
      if (user == null) return false;
      final asyncProfile = ref.watch(userProfileProvider(user.uid));
      return asyncProfile.when(
        data: (p) => p?.isApproved ?? true,
        loading: () => false,
        error: (_, __) => false,
      );
    },
    orElse: () => false,
  );
});

final platformBrandingProvider = StreamProvider<PlatformBranding>((ref) {
  if (!firebaseOptionsConfigured) {
    return Stream<PlatformBranding>.value(PlatformBranding.fallback);
  }
  return ref
      .watch(firestoreProvider)
      .doc('platform_branding/default')
      .snapshots()
      .map(PlatformBranding.fromSnapshot);
});

final upcomingEventsProvider = StreamProvider<List<MojoEvent>>((ref) {
  if (!firebaseOptionsConfigured) {
    return Stream<List<MojoEvent>>.value(const []);
  }
  return ref.watch(eventsRepositoryProvider).watchUpcoming();
});

final pastEventsProvider = StreamProvider<List<MojoEvent>>((ref) {
  if (!firebaseOptionsConfigured) {
    return Stream<List<MojoEvent>>.value(const []);
  }
  return ref.watch(eventsRepositoryProvider).watchPast();
});

/// Single event doc for detail screen / deep link target ` /events/:eventId `.
final eventByIdProvider =
    StreamProvider.family<MojoEvent?, String>((ref, eventId) {
  if (!firebaseOptionsConfigured || eventId.isEmpty) {
    return Stream<MojoEvent?>.value(null);
  }
  return ref
      .watch(firestoreProvider)
      .collection('events')
      .doc(eventId)
      .snapshots()
      .map((s) {
    if (!s.exists) return null;
    return MojoEvent.fromDoc(s);
  });
});

/// One of the signed-in user's `events/{eventId}/attendees/{attendeeId}` docs plus loaded event (web parity).
class MyRsvpRow {
  const MyRsvpRow({required this.attendeeDoc, required this.event});
  final QueryDocumentSnapshot<Map<String, dynamic>> attendeeDoc;
  final MojoEvent? event;
}

String? eventIdFromAttendeeDoc(QueryDocumentSnapshot<Map<String, dynamic>> d) {
  final data = d.data();
  final raw = (data['eventId'] as String?)?.trim();
  if (raw != null && raw.isNotEmpty) return raw;
  return d.reference.parent.parent?.id;
}

bool _attendeeIsGoing(Map<String, dynamic> data) {
  final s = data['rsvpStatus'] ?? data['status'];
  return s == 'going';
}

/// **I'm Going** tab â€” only `going` rows; one card per event (primary doc preferred).
final myRsvpsProvider = StreamProvider<List<MyRsvpRow>>((ref) {
  if (!firebaseOptionsConfigured) {
    return Stream<List<MyRsvpRow>>.value(const []);
  }
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) {
    return Stream<List<MyRsvpRow>>.value(const []);
  }
  final fs = ref.watch(firestoreProvider);
  // No server-side orderBy: avoids composite index (userId + createdAt + __name__) that often
  // collides with CLI 409 / missing index on dev. Sort in memory instead.
  return fs
      .collectionGroup('attendees')
      .where('userId', isEqualTo: user.uid)
      .limit(120)
      .snapshots()
      .asyncMap((snap) async {
    int createdAtMs(QueryDocumentSnapshot<Map<String, dynamic>> d) {
      final c = d.data()['createdAt'];
      if (c is Timestamp) return c.millisecondsSinceEpoch;
      return 0;
    }

    final goingDocs =
        snap.docs.where((d) => _attendeeIsGoing(d.data())).toList();
    final sorted =
        List<QueryDocumentSnapshot<Map<String, dynamic>>>.from(goingDocs)
          ..sort((a, b) => createdAtMs(b).compareTo(createdAtMs(a)));

    final byEvent =
        <String, List<QueryDocumentSnapshot<Map<String, dynamic>>>>{};
    for (final d in sorted) {
      final eventId = eventIdFromAttendeeDoc(d);
      if (eventId == null || eventId.isEmpty) continue;
      byEvent.putIfAbsent(eventId, () => []).add(d);
    }

    final eventCache = <String, MojoEvent?>{};
    final out = <MyRsvpRow>[];
    for (final entry in byEvent.entries) {
      final eventId = entry.key;
      final list = entry.value;
      QueryDocumentSnapshot<Map<String, dynamic>>? pick;
      for (final d in list) {
        if (d.data()['attendeeType'] == 'primary') {
          pick = d;
          break;
        }
      }
      pick ??= list.isNotEmpty ? list.first : null;
      if (pick == null) continue;

      if (!eventCache.containsKey(eventId)) {
        final evSnap = await fs.collection('events').doc(eventId).get();
        eventCache[eventId] = evSnap.exists ? MojoEvent.fromDoc(evSnap) : null;
      }
      out.add(MyRsvpRow(attendeeDoc: pick, event: eventCache[eventId]));
    }

    out.sort((a, b) {
      final da = a.event?.startAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      final db = b.event?.startAt ?? DateTime.fromMillisecondsSinceEpoch(0);
      return da.compareTo(db);
    });

    return out;
  });
});

final postsFeedProvider = StreamProvider<List<MojoPost>>((ref) {
  if (!firebaseOptionsConfigured) {
    return Stream<List<MojoPost>>.value(const []);
  }
  final member = ref.watch(useMemberPostFeedProvider);
  return ref.watch(postsRepositoryProvider).watchFeed(useMemberFeed: member);
});

/// In-app notification feed (same query as web `NotificationCenter`).
final notificationsStreamProvider = StreamProvider.autoDispose<
    List<QueryDocumentSnapshot<Map<String, dynamic>>>>((ref) {
  if (!firebaseOptionsConfigured) {
    return Stream<List<QueryDocumentSnapshot<Map<String, dynamic>>>>.value(
        const []);
  }
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) {
    return Stream<List<QueryDocumentSnapshot<Map<String, dynamic>>>>.value(
        const []);
  }
  return ref
      .watch(firestoreProvider)
      .collection('notifications')
      .where('userId', isEqualTo: user.uid)
      .orderBy('createdAt', descending: true)
      .limit(50)
      .snapshots()
      .map((s) => s.docs);
});

final unreadNotificationCountProvider = Provider<AsyncValue<int>>((ref) {
  final async = ref.watch(notificationsStreamProvider);
  return async.when(
    data: (docs) {
      var n = 0;
      for (final d in docs) {
        if (d.data()['read'] != true) n++;
      }
      return AsyncValue.data(n);
    },
    loading: () => const AsyncValue.loading(),
    error: (e, st) => AsyncValue.error(e, st),
  );
});

/// All attendee rows for an event (web `listAllAttendees` / Who's going). Rules allow reads for public + members events.
final eventAttendeesOrderedProvider = StreamProvider.autoDispose
    .family<List<QueryDocumentSnapshot<Map<String, dynamic>>>, String>(
        (ref, eventId) {
  if (!firebaseOptionsConfigured || eventId.isEmpty) {
    return Stream<List<QueryDocumentSnapshot<Map<String, dynamic>>>>.value(
        const []);
  }
  final user = ref.watch(authStateProvider).valueOrNull;
  if (user == null) {
    return Stream<List<QueryDocumentSnapshot<Map<String, dynamic>>>>.value(
        const []);
  }
  return ref
      .watch(firestoreProvider)
      .collection('events')
      .doc(eventId)
      .collection('attendees')
      .orderBy('createdAt')
      .snapshots()
      .map((s) => s.docs);
});

