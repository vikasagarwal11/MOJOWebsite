import 'package:cloud_firestore/cloud_firestore.dart';

class MojoUserProfile {
  const MojoUserProfile({
    required this.uid,
    this.displayName,
    this.firstName,
    this.lastName,
    this.email,
    this.phoneNumber,
    this.photoUrl,
    this.role,
    this.status,
    this.eventHistory,
  });

  final String uid;
  final String? displayName;
  final String? firstName;
  final String? lastName;
  /// Profile email (web stores this on `users`; may differ from Auth email for phone users).
  final String? email;
  /// E.164 or national format when present (phone-auth users).
  final String? phoneNumber;
  final String? photoUrl;
  final String? role;
  final String? status;
  /// Events attended (same field as web `users` document when present).
  final int? eventHistory;

  bool get isApproved => status == null || status == 'approved';

  /// Whether [rawQuery] matches this profile for DM / member search (substring, case-insensitive).
  /// Supports phone digits (e.g. "888" matches +1…888…) and partial uid for support.
  bool matchesMemberSearch(String rawQuery) {
    final q = rawQuery.trim().toLowerCase();
    if (q.isEmpty) return true;
    bool fieldContains(String? s) =>
        s != null && s.toLowerCase().contains(q);
    if (uid.toLowerCase().contains(q)) return true;
    if (fieldContains(resolvedPublicName)) return true;
    if (fieldContains(displayName)) return true;
    if (fieldContains(email)) return true;
    if (fieldContains(firstName)) return true;
    if (fieldContains(lastName)) return true;
    if (fieldContains(phoneNumber)) return true;
    final digitsQ = q.replaceAll(RegExp(r'\D'), '');
    if (digitsQ.length >= 2 && phoneNumber != null && phoneNumber!.isNotEmpty) {
      final digitsPhone = phoneNumber!.replaceAll(RegExp(r'\D'), '');
      if (digitsPhone.contains(digitsQ)) return true;
    }
    return false;
  }

  /// Same priority as web [Profile.tsx] save: first+last, else stored [displayName].
  String? get resolvedPublicName {
    final parts = <String>[
      if (firstName != null && firstName!.trim().isNotEmpty) firstName!.trim(),
      if (lastName != null && lastName!.trim().isNotEmpty) lastName!.trim(),
    ];
    if (parts.isNotEmpty) return parts.join(' ');
    final d = displayName?.trim();
    if (d != null && d.isNotEmpty) return d;
    return null;
  }

  /// From [searchMembers] Cloud Function payload (`members[]`).
  factory MojoUserProfile.fromMemberSearchJson(
    Map<String, dynamic> m,
  ) {
    return MojoUserProfile(
      uid: m['uid'] as String,
      displayName: m['displayName'] as String?,
      firstName: m['firstName'] as String?,
      lastName: m['lastName'] as String?,
      email: m['email'] as String?,
      phoneNumber: m['phoneNumber'] as String?,
      photoUrl: m['photoURL'] as String?,
      role: null,
      status: m['status'] as String?,
      eventHistory: null,
    );
  }

  factory MojoUserProfile.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    final eh = d['eventHistory'];
    return MojoUserProfile(
      uid: doc.id,
      displayName: d['displayName'] as String?,
      firstName: d['firstName'] as String?,
      lastName: d['lastName'] as String?,
      email: d['email'] as String?,
      phoneNumber: (d['phoneNumber'] ?? d['phone']) as String?,
      photoUrl: d['photoURL'] as String? ?? d['photoUrl'] as String?,
      role: d['role'] as String?,
      status: d['status'] as String?,
      eventHistory: eh is int ? eh : (eh is num ? eh.toInt() : null),
    );
  }
}
