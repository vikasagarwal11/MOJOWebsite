import 'package:cloud_firestore/cloud_firestore.dart';

class MojoUserProfile {
  const MojoUserProfile({
    required this.uid,
    this.displayName,
    this.photoUrl,
    this.role,
    this.status,
  });

  final String uid;
  final String? displayName;
  final String? photoUrl;
  final String? role;
  final String? status;

  bool get isApproved => status == null || status == 'approved';

  factory MojoUserProfile.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return MojoUserProfile(
      uid: doc.id,
      displayName: d['displayName'] as String?,
      photoUrl: d['photoURL'] as String? ?? d['photoUrl'] as String?,
      role: d['role'] as String?,
      status: d['status'] as String?,
    );
  }
}
