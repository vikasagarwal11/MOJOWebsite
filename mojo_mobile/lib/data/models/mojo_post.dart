import 'package:cloud_firestore/cloud_firestore.dart';

class MojoPost {
  MojoPost({
    required this.id,
    required this.title,
    required this.content,
    required this.createdAt,
    this.authorName,
    this.authorPhotoUrl,
    this.imageUrl,
    this.isPublic,
    this.moderationStatus,
  });

  final String id;
  final String title;
  final String content;
  final DateTime createdAt;
  final String? authorName;
  final String? authorPhotoUrl;
  final String? imageUrl;
  final bool? isPublic;
  final String? moderationStatus;

  static DateTime _ts(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    return DateTime.fromMillisecondsSinceEpoch(0);
  }

  factory MojoPost.fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data();
    final body = (d['content'] as String?) ?? (d['body'] as String?) ?? '';
    final title = (d['title'] as String?)?.trim().isNotEmpty == true ? d['title'] as String : '';
    return MojoPost(
      id: doc.id,
      title: title,
      content: body,
      createdAt: _ts(d['createdAt']),
      authorName: d['authorName'] as String? ?? 'Member',
      authorPhotoUrl: d['authorPhotoURL'] as String? ?? d['authorPhotoUrl'] as String?,
      imageUrl: d['imageUrl'] as String? ?? (d['images'] is List && (d['images'] as List).isNotEmpty
          ? (d['images'] as List).first as String?
          : null),
      isPublic: d['isPublic'] as bool?,
      moderationStatus: d['moderationStatus'] as String?,
    );
  }

  /// Hides rejected / failed moderation from the community feed.
  bool get isFeedVisible {
    final ms = moderationStatus;
    return ms == null || ms == 'approved';
  }
}
