import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../models/attendee_row_data.dart';
import '../models/guest_contact_info.dart';
import '../models/rsvp_enums.dart';

// ---------------------------------------------------------------------------
// RsvpFormStatus enum (Task 2.1)
// ---------------------------------------------------------------------------

/// Tracks the lifecycle of the RSVP form submission.
enum RsvpFormStatus { idle, submitting, submitted, error }

// ---------------------------------------------------------------------------
// RsvpFormState (Task 2.1)
// ---------------------------------------------------------------------------

/// Immutable state for the multi-attendee RSVP form.
class RsvpFormState {
  const RsvpFormState({
    this.rows = const [],
    this.status = RsvpFormStatus.idle,
    this.errorMessage,
    this.isGuestFlow = false,
    this.guestSessionToken,
    this.guestContact,
  });

  final List<AttendeeRowData> rows;
  final RsvpFormStatus status;
  final String? errorMessage;
  final bool isGuestFlow;
  final String? guestSessionToken;
  final GuestContactInfo? guestContact;

  RsvpFormState copyWith({
    List<AttendeeRowData>? rows,
    RsvpFormStatus? status,
    String? Function()? errorMessage,
    bool? isGuestFlow,
    String? Function()? guestSessionToken,
    GuestContactInfo? Function()? guestContact,
  }) {
    return RsvpFormState(
      rows: rows ?? this.rows,
      status: status ?? this.status,
      errorMessage: errorMessage != null ? errorMessage() : this.errorMessage,
      isGuestFlow: isGuestFlow ?? this.isGuestFlow,
      guestSessionToken: guestSessionToken != null
          ? guestSessionToken()
          : this.guestSessionToken,
      guestContact: guestContact != null ? guestContact() : this.guestContact,
    );
  }

  @override
  String toString() => 'RsvpFormState(rows: ${rows.length}, status: $status, '
      'isGuestFlow: $isGuestFlow)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is RsvpFormState &&
          runtimeType == other.runtimeType &&
          _listEquals(rows, other.rows) &&
          status == other.status &&
          errorMessage == other.errorMessage &&
          isGuestFlow == other.isGuestFlow &&
          guestSessionToken == other.guestSessionToken &&
          guestContact == other.guestContact;

  @override
  int get hashCode => Object.hash(
        Object.hashAll(rows),
        status,
        errorMessage,
        isGuestFlow,
        guestSessionToken,
        guestContact,
      );
}

bool _listEquals<T>(List<T> a, List<T> b) {
  if (identical(a, b)) return true;
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// RsvpFormNotifier (Tasks 2.2 & 2.3)
// ---------------------------------------------------------------------------

class RsvpFormNotifier extends StateNotifier<RsvpFormState> {
  RsvpFormNotifier() : super(const RsvpFormState());

  // ---- Core methods (Task 2.2) ----

  /// Appends a blank attendee row with defaults:
  /// empty name, relationship guest, age group adult.
  void addRow() {
    state = state.copyWith(
      rows: [...state.rows, AttendeeRowData.blank()],
    );
  }

  /// Replaces the row matching [localId] with [updated].
  void updateRow(String localId, AttendeeRowData updated) {
    state = state.copyWith(
      rows: [
        for (final row in state.rows)
          if (row.localId == localId) updated else row,
      ],
    );
  }

  /// Removes the row matching [localId].
  /// No-op if only one row remains (at least one attendee must exist).
  void removeRow(String localId) {
    if (state.rows.length <= 1) return;
    state = state.copyWith(
      rows: state.rows.where((r) => r.localId != localId).toList(),
    );
  }

  /// Populates form rows from existing Firestore attendee documents.
  /// Primary attendee is sorted first.
  void initFromExistingAttendees(
    List<QueryDocumentSnapshot<Map<String, dynamic>>> docs,
  ) {
    if (docs.isEmpty) return;

    final rows = docs.map(AttendeeRowData.fromFirestoreDoc).toList();

    // Sort so primary attendee appears first.
    rows.sort((a, b) {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return 0;
    });

    state = state.copyWith(rows: rows);
  }

  // ---- Submission & deletion (Task 2.3) ----

  /// Batch-writes all attendee rows to Firestore.
  ///
  /// The first row that has no existing primary attendee is promoted to
  /// `attendeeType: primary` with `relationship: self`. Subsequent rows
  /// derive their `attendeeType` from their relationship field.
  Future<void> submitRsvp({
    required String eventId,
    required String userId,
    required String paymentStatus,
  }) async {
    if (state.rows.isEmpty) return;

    final previousState = state;
    state = state.copyWith(status: RsvpFormStatus.submitting);

    try {
      final db = FirebaseFirestore.instance;
      final batch = db.batch();
      final attendeesRef =
          db.collection('events').doc(eventId).collection('attendees');

      // Determine if a primary already exists among submitted rows.
      final hasPrimary = state.rows.any((r) => r.isPrimary);

      final updatedRows = <AttendeeRowData>[];
      var primaryAssigned = hasPrimary;

      for (final row in state.rows) {
        // Skip rows that already have a Firestore ID (already submitted).
        if (row.firestoreId != null) {
          updatedRows.add(row);
          continue;
        }

        AttendeeRowData effectiveRow;
        if (!primaryAssigned) {
          // First new row without an existing primary becomes primary/self.
          effectiveRow = row.copyWith(
            isPrimary: true,
            relationship: Relationship.self,
          );
          primaryAssigned = true;
        } else {
          effectiveRow = row;
        }

        final docRef = attendeesRef.doc();
        batch.set(
            docRef,
            effectiveRow.toFirestoreMap(
              eventId: eventId,
              userId: userId,
            ));

        updatedRows.add(effectiveRow.copyWith(
          firestoreId: () => docRef.id,
          paymentStatus: paymentStatus,
        ));
      }

      await batch.commit();

      // Update attending count on the event document.
      final newCount = updatedRows.where((r) => r.firestoreId != null).length;
      final submittedCount =
          previousState.rows.where((r) => r.firestoreId != null).length;
      final delta = newCount - submittedCount;
      if (delta > 0) {
        await db.collection('events').doc(eventId).update({
          'attendingCount': FieldValue.increment(delta),
          'updatedAt': FieldValue.serverTimestamp(),
        });
      }

      state = state.copyWith(
        rows: updatedRows,
        status: RsvpFormStatus.submitted,
        errorMessage: () => null,
      );
    } catch (e) {
      // Revert to previous state on failure.
      state = previousState.copyWith(
        status: RsvpFormStatus.error,
        errorMessage: () => e.toString(),
      );
    }
  }

  /// Deletes a submitted attendee from Firestore.
  ///
  /// Blocks deletion of the primary attendee when dependents (other rows
  /// with the same userId that are family_member or guest) still exist.
  Future<void> deleteSubmittedAttendee({
    required String firestoreId,
    required String eventId,
  }) async {
    final rowToDelete = state.rows.firstWhere(
      (r) => r.firestoreId == firestoreId,
      orElse: () => throw StateError('Row not found for id: $firestoreId'),
    );

    // Block primary deletion when dependents exist.
    if (rowToDelete.isPrimary) {
      final hasDependents = state.rows.any((r) =>
          r.firestoreId != firestoreId &&
          (r.relationship == Relationship.spouse ||
              r.relationship == Relationship.child ||
              r.relationship == Relationship.guest));
      if (hasDependents) {
        state = state.copyWith(
          status: RsvpFormStatus.error,
          errorMessage: () =>
              'Cannot delete the primary attendee while other attendees exist. '
              'Remove dependents first.',
        );
        return;
      }
    }

    try {
      final db = FirebaseFirestore.instance;
      await db
          .collection('events')
          .doc(eventId)
          .collection('attendees')
          .doc(firestoreId)
          .delete();

      // Decrement attending count.
      await db.collection('events').doc(eventId).update({
        'attendingCount': FieldValue.increment(-1),
        'updatedAt': FieldValue.serverTimestamp(),
      });

      state = state.copyWith(
        rows: state.rows.where((r) => r.firestoreId != firestoreId).toList(),
        status: RsvpFormStatus.idle,
        errorMessage: () => null,
      );
    } catch (e) {
      state = state.copyWith(
        status: RsvpFormStatus.error,
        errorMessage: () => 'Failed to delete attendee: $e',
      );
    }
  }

  // ---- Guest flow helpers ----

  void setGuestFlow({required bool isGuest}) {
    state = state.copyWith(isGuestFlow: isGuest);
  }

  void setGuestSessionToken(String token) {
    state = state.copyWith(guestSessionToken: () => token);
  }

  void setGuestContact(GuestContactInfo contact) {
    state = state.copyWith(guestContact: () => contact);
  }

  /// Resets the form to its initial empty state.
  void reset() {
    state = const RsvpFormState();
  }
}

// ---------------------------------------------------------------------------
// Riverpod Providers (Task 2.4)
// ---------------------------------------------------------------------------

/// Central state notifier for the RSVP form.
final rsvpFormProvider =
    StateNotifierProvider<RsvpFormNotifier, RsvpFormState>((ref) {
  return RsvpFormNotifier();
});

/// Derived capacity state from the event document.
///
/// Returns a record of (attendingCount, maxAttendees, canAddMore, canWaitlist).
/// When maxAttendees is null or 0, capacity is unlimited.
final capacityStateProvider = Provider.family<
    ({
      int attendingCount,
      int? maxAttendees,
      bool canAddMore,
      bool canWaitlist
    }),
    String>((ref, eventId) {
  final eventAsync = ref.watch(eventByIdProvider(eventId));
  final event = eventAsync.valueOrNull;

  if (event == null) {
    // Event not loaded yet — default to unlimited capacity.
    return (
      attendingCount: 0,
      maxAttendees: null,
      canAddMore: true,
      canWaitlist: false,
    );
  }

  final max = event.maxAttendees;
  final attending = event.attendingCount;

  // When maxAttendees is 0, capacity is unlimited.
  if (max <= 0) {
    return (
      attendingCount: attending,
      maxAttendees: null,
      canAddMore: true,
      canWaitlist: false,
    );
  }

  final canAddMore = attending < max;
  final canWaitlist = !canAddMore && event.waitlistEnabled;

  return (
    attendingCount: attending,
    maxAttendees: max,
    canAddMore: canAddMore,
    canWaitlist: canWaitlist,
  );
});
