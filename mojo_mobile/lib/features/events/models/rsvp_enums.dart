/// Enums and Firestore serialization for RSVP attendee data.
///
/// Firestore stores these as plain strings — the extensions below handle
/// the conversion in both directions so the rest of the app works with
/// type-safe enums.
library;

// ---------------------------------------------------------------------------
// Relationship
// ---------------------------------------------------------------------------

enum Relationship { self, spouse, child, guest }

extension RelationshipFirestore on Relationship {
  /// The string written to / read from Firestore.
  String get firestoreValue => switch (this) {
        Relationship.self => 'self',
        Relationship.spouse => 'spouse',
        Relationship.child => 'child',
        Relationship.guest => 'guest',
      };

  /// Deserialise a Firestore string back to a [Relationship].
  ///
  /// Returns [Relationship.guest] for unrecognised values so the app
  /// never crashes on unexpected data.
  static Relationship fromFirestore(String? value) => switch (value) {
        'self' => Relationship.self,
        'spouse' => Relationship.spouse,
        'child' => Relationship.child,
        _ => Relationship.guest,
      };
}

// ---------------------------------------------------------------------------
// AgeGroup
// ---------------------------------------------------------------------------

enum AgeGroup { adult, age0to2, age3to5, age6to10, age11plus }

extension AgeGroupFirestore on AgeGroup {
  /// The string written to / read from Firestore.
  String get firestoreValue => switch (this) {
        AgeGroup.adult => 'adult',
        AgeGroup.age0to2 => '0-2',
        AgeGroup.age3to5 => '3-5',
        AgeGroup.age6to10 => '6-10',
        AgeGroup.age11plus => '11+',
      };

  /// Deserialise a Firestore string back to an [AgeGroup].
  ///
  /// Returns [AgeGroup.adult] for unrecognised values, matching the
  /// pricing fallback behaviour in [MojoEvent.priceForAgeGroupCents].
  static AgeGroup fromFirestore(String? value) => switch (value) {
        'adult' => AgeGroup.adult,
        '0-2' => AgeGroup.age0to2,
        '3-5' => AgeGroup.age3to5,
        '6-10' => AgeGroup.age6to10,
        '11+' => AgeGroup.age11plus,
        _ => AgeGroup.adult,
      };
}
