import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../firebase_options.dart';
import '../services/auth_service.dart';
import '../../data/models/mojo_event.dart';
import '../../data/models/mojo_post.dart';
import '../../data/models/mojo_user_profile.dart';
import '../../data/repositories/events_repository.dart';
import '../../data/repositories/posts_repository.dart';
import '../branding/platform_branding.dart';

final firebaseAuthProvider = Provider<FirebaseAuth>((ref) => FirebaseAuth.instance);

final firestoreProvider = Provider<FirebaseFirestore>((ref) => FirebaseFirestore.instance);

/// Same region as web ([VITE_FIREBASE_FUNCTIONS_REGION] / `us-east1`).
final firebaseFunctionsProvider = Provider<FirebaseFunctions>(
  (ref) => FirebaseFunctions.instanceFor(region: 'us-east1'),
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

final authStateProvider = StreamProvider<User?>((ref) {
  if (!firebaseOptionsConfigured) {
    return Stream<User?>.value(null);
  }
  return ref.watch(firebaseAuthProvider).authStateChanges();
});

final userProfileProvider = StreamProvider.family<MojoUserProfile?, String>((ref, uid) {
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

/// Single event doc for detail screen / deep link target ` /event/:eventId `.
final eventByIdProvider = StreamProvider.family<MojoEvent?, String>((ref, eventId) {
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
  // collides with CLI 409 / missing index on dev. Sort newest-first in memory instead.
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

        final sorted = List<QueryDocumentSnapshot<Map<String, dynamic>>>.from(snap.docs)
          ..sort((a, b) => createdAtMs(b).compareTo(createdAtMs(a)));
        final docs = sorted.take(40).toList();

        final eventCache = <String, MojoEvent?>{};
        final out = <MyRsvpRow>[];
        for (final d in docs) {
          final data = d.data();
          final rawEventId = (data['eventId'] as String?)?.trim();
          final eventId = (rawEventId != null && rawEventId.isNotEmpty)
              ? rawEventId
              : d.reference.parent.parent?.id;
          if (eventId == null || eventId.isEmpty) continue;
          if (!eventCache.containsKey(eventId)) {
            final evSnap = await fs.collection('events').doc(eventId).get();
            eventCache[eventId] = evSnap.exists ? MojoEvent.fromDoc(evSnap) : null;
          }
          out.add(MyRsvpRow(attendeeDoc: d, event: eventCache[eventId]));
        }
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
