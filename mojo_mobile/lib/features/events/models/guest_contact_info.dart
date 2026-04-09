/// Contact information for a guest (non-authenticated) RSVP.
///
/// Used in the guest RSVP flow where the user provides their details
/// before OTP verification. [phoneNumber] must be in E.164 format
/// (e.g. `+14155551234`).
class GuestContactInfo {
  const GuestContactInfo({
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.phoneNumber,
  });

  final String firstName;
  final String lastName;
  final String email;

  /// Phone number in E.164 format (e.g. `+14155551234`).
  final String phoneNumber;

  /// Full display name built from first and last name.
  String get fullName => '$firstName $lastName'.trim();

  /// Immutable copy with optional field overrides.
  GuestContactInfo copyWith({
    String? firstName,
    String? lastName,
    String? email,
    String? phoneNumber,
  }) {
    return GuestContactInfo(
      firstName: firstName ?? this.firstName,
      lastName: lastName ?? this.lastName,
      email: email ?? this.email,
      phoneNumber: phoneNumber ?? this.phoneNumber,
    );
  }

  @override
  String toString() => 'GuestContactInfo(firstName: $firstName, '
      'lastName: $lastName, email: $email, phoneNumber: $phoneNumber)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GuestContactInfo &&
          runtimeType == other.runtimeType &&
          firstName == other.firstName &&
          lastName == other.lastName &&
          email == other.email &&
          phoneNumber == other.phoneNumber;

  @override
  int get hashCode => Object.hash(firstName, lastName, email, phoneNumber);
}
