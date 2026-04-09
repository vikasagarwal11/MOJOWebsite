import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:uuid/uuid.dart';

import 'rsvp_enums.dart';

const _uuid = Uuid();

/// Local model representing a single attendee row in the RSVP form.
///
/// Each row tracks both local state (before Firestore write) and persisted
/// state (after submission). The [localId] is a UUID generated client-side;
/// [firestoreId] becomes non-null once the document is written.
class AttendeeRowData {
  const AttendeeRowData({
    required this.localId,
    this.firestoreId,
    required this.name,
    required this.relationship,
    required this.ageGroup,
    required this.paymentStatus,
    required this.isPrimary,
  });

  final String localId;
  final String? firestoreId;
  final String name;
  final Relationship relationship;
  final AgeGroup ageGroup;
  final String paymentStatus;
  final bool isPrimary;

  /// Creates a blank row with sensible defaults for a new attendee.
  factory AttendeeRowData.blank() => AttendeeRowData(
        localId: _uuid.v4(),
        name: '',
        relationship: Relationship.guest,
        ageGroup: AgeGroup.adult,
        paymentStatus: 'unpaid',
        isPrimary: false,
      );

  /// Immutable copy with optional field overrides.
  AttendeeRowData copyWith({
    String? localId,
    String? Function()? firestoreId,
    String? name,
    Relationship? relationship,
    AgeGroup? ageGroup,
    String? paymentStatus,
    bool? isPrimary,
  }) {
    return AttendeeRowData(
      localId: localId ?? this.localId,
      firestoreId: firestoreId != null ? firestoreId() : this.firestoreId,
      name: name ?? this.name,
      relationship: relationship ?? this.relationship,
      ageGroup: ageGroup ?? this.ageGroup,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      isPrimary: isPrimary ?? this.isPrimary,
    );
  }

  /// Maps a Firestore attendee document back into an [AttendeeRowData].
  ///
  /// Expects the standard attendee subcollection schema
  /// (`events/{eventId}/attendees/{attendeeId}`).
  factory AttendeeRowData.fromFirestoreDoc(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final d = doc.data();
    return AttendeeRowData(
      localId: _uuid.v4(),
      firestoreId: doc.id,
      name: (d['name'] as String?) ?? '',
      relationship: RelationshipFirestore.fromFirestore(
        d['relationship'] as String?,
      ),
      ageGroup: AgeGroupFirestore.fromFirestore(d['ageGroup'] as String?),
      paymentStatus: ((d['paymentStatus'] as String?) ?? 'unpaid').trim(),
      isPrimary: (d['attendeeType'] as String?) == 'primary',
    );
  }

  /// Derives `attendeeType` from [relationship]:
  /// - `self` → `primary`
  /// - `spouse` / `child` → `family_member`
  /// - `guest` → `guest`
  String get _attendeeType => switch (relationship) {
        Relationship.self => 'primary',
        Relationship.spouse => 'family_member',
        Relationship.child => 'family_member',
        Relationship.guest => 'guest',
      };

  /// Serialises this row into the Firestore attendee document map.
  ///
  /// [eventId] and [userId] are required context that the form doesn't own.
  /// Timestamps use [FieldValue.serverTimestamp] so the server clock is
  /// authoritative.
  Map<String, dynamic> toFirestoreMap({
    required String eventId,
    required String userId,
  }) {
    return {
      'eventId': eventId,
      'userId': userId,
      'attendeeType': _attendeeType,
      'relationship': relationship.firestoreValue,
      'name': name,
      'ageGroup': ageGroup.firestoreValue,
      'rsvpStatus': 'going',
      'paymentStatus': paymentStatus,
      'createdAt': FieldValue.serverTimestamp(),
      'updatedAt': FieldValue.serverTimestamp(),
    };
  }

  @override
  String toString() => 'AttendeeRowData(localId: $localId, name: $name, '
      'relationship: $relationship, ageGroup: $ageGroup, '
      'paymentStatus: $paymentStatus, isPrimary: $isPrimary)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AttendeeRowData &&
          runtimeType == other.runtimeType &&
          localId == other.localId &&
          firestoreId == other.firestoreId &&
          name == other.name &&
          relationship == other.relationship &&
          ageGroup == other.ageGroup &&
          paymentStatus == other.paymentStatus &&
          isPrimary == other.isPrimary;

  @override
  int get hashCode => Object.hash(
        localId,
        firestoreId,
        name,
        relationship,
        ageGroup,
        paymentStatus,
        isPrimary,
      );
}
