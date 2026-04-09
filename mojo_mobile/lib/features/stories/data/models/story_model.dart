import 'package:cloud_firestore/cloud_firestore.dart';

import '../../domain/entities/story.dart';

class StoryModel extends Story {
  const StoryModel({
    required super.id,
    required super.userId,
    required super.url,
    required super.mediaType,
    required super.createdAt,
    super.authorName,
    super.authorPhotoUrl,
    super.expiresAt,
  });

  factory StoryModel.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final Map<String, dynamic> data = doc.data() ?? <String, dynamic>{};

    return StoryModel(
      id: doc.id,
      userId: (data['userId'] as String?)?.trim() ?? '',
      url: (data['url'] as String?)?.trim() ?? '',
      mediaType: (data['mediaType'] as String?)?.trim().toLowerCase() ?? 'image',
      createdAt: _readDate(data['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
      authorName: (data['authorName'] as String?)?.trim(),
      authorPhotoUrl: (data['authorPhotoUrl'] as String?)?.trim(),
      expiresAt: _readDate(data['expiresAt']),
    );
  }

  static DateTime? _readDate(dynamic value) {
    if (value is Timestamp) {
      return value.toDate();
    }
    if (value is DateTime) {
      return value;
    }
    if (value is String && value.trim().isNotEmpty) {
      return DateTime.tryParse(value);
    }
    return null;
  }
}
