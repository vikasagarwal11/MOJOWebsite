import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/logging/app_logger.dart';

/// Web parity with [attendeeService.ts] `getAttendingDelta` + `updateAttendee` transaction.
class RsvpUpdateService {
  RsvpUpdateService(this._db);

  final FirebaseFirestore _db;

  static int attendingDelta(String? previousStatus, String nextStatus) {
    final wasGoing = previousStatus == 'going';
    final isGoing = nextStatus == 'going';
    if (isGoing && !wasGoing) return 1;
    if (!isGoing && wasGoing) return -1;
    return 0;
  }

  /// Updates one attendee row and event [attendingCount] when status crosses going ↔ not.
  Future<void> setAttendeeStatus({
    required String eventId,
    required String attendeeId,
    required String newStatus,
  }) async {
    final attendeeRef = _db
        .collection('events')
        .doc(eventId)
        .collection('attendees')
        .doc(attendeeId);
    final eventRef = _db.collection('events').doc(eventId);

    await _db.runTransaction((transaction) async {
      final aSnap = await transaction.get(attendeeRef);
      if (!aSnap.exists) {
        throw StateError('Attendee not found');
      }
      final data = aSnap.data()!;
      final prev = data['rsvpStatus'] as String?;
      final delta = attendingDelta(prev, newStatus);

      var currentCount = 0;
      if (delta != 0) {
        final eSnap = await transaction.get(eventRef);
        if (eSnap.exists) {
          currentCount = _readAttendingCount(eSnap.data());
        }
      }

      transaction.update(attendeeRef, {
        'rsvpStatus': newStatus,
        'updatedAt': FieldValue.serverTimestamp(),
      });

      if (delta != 0) {
        final newCount = (currentCount + delta).clamp(0, 1 << 30);
        transaction.update(eventRef, {
          'attendingCount': newCount,
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }
    });
  }

  int _readAttendingCount(Map<String, dynamic>? e) {
    final v = e?['attendingCount'];
    if (v is int) return v;
    if (v is num) return v.toInt();
    return 0;
  }

  /// Sets RSVP for this attendee; if [primary] goes to `not-going`, cascades guests/family on same event (web [EventCardNew] rule).
  Future<void> updateMyAttendeeStatus({
    required String eventId,
    required String attendeeId,
    required String userId,
    required String newStatus,
  }) async {
    final attendeeRef = _db
        .collection('events')
        .doc(eventId)
        .collection('attendees')
        .doc(attendeeId);
    final snap = await attendeeRef.get();
    if (!snap.exists) {
      throw StateError('Attendee not found');
    }
    final data = snap.data()!;
    final attendeeType = data['attendeeType'] as String? ?? 'primary';

    await setAttendeeStatus(
      eventId: eventId,
      attendeeId: attendeeId,
      newStatus: newStatus,
    );

    if (newStatus == 'not-going' && attendeeType == 'primary') {
      await _cascadeDependentsNotGoing(eventId: eventId, userId: userId);
    }
  }

  Future<void> _cascadeDependentsNotGoing({
    required String eventId,
    required String userId,
  }) async {
    try {
      final q = await _db
          .collection('events')
          .doc(eventId)
          .collection('attendees')
          .where('userId', isEqualTo: userId)
          .get();

      for (final doc in q.docs) {
        final d = doc.data();
        final type = d['attendeeType'] as String?;
        final st = d['rsvpStatus'] as String?;
        if ((type == 'guest' || type == 'family_member') && st == 'going') {
          try {
            await setAttendeeStatus(
              eventId: eventId,
              attendeeId: doc.id,
              newStatus: 'not-going',
            );
          } catch (e, st) {
            appLogger.w(
              'Cascade not-going skipped for ${doc.id}',
              error: e,
              stackTrace: st,
            );
          }
        }
      }
    } catch (e, st) {
      appLogger.w('Cascade dependents not-going failed', error: e, stackTrace: st);
    }
  }
}
