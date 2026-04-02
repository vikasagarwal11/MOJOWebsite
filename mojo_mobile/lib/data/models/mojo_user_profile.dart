import 'package:cloud_firestore/cloud_firestore.dart';

class MojoUserProfile {
  const MojoUserProfile({
    required this.uid,
    this.displayName,
    this.photoUrl,
    this.role,
    this.status,
    this.eventHistory,
  });

  final String uid;
  final String? displayName;
  final String? photoUrl;
  final String? role;
  final String? status;
  /// Events attended (same field as web `users` document when present).
  final int? eventHistory;

  bool get isApproved => status == null || status == 'approved';

  factory MojoUserProfile.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    final eh = d['eventHistory'];
    return MojoUserProfile(
      uid: doc.id,
      displayName: d['displayName'] as String?,
      photoUrl: d['photoURL'] as String? ?? d['photoUrl'] as String?,
      role: d['role'] as String?,
      status: d['status'] as String?,
      eventHistory: eh is int ? eh : (eh is num ? eh.toInt() : null),
    );
  }
}
