import 'package:equatable/equatable.dart';

class Story extends Equatable {
  const Story({
    required this.id,
    required this.userId,
    required this.url,
    required this.mediaType,
    required this.createdAt,
    this.authorName,
    this.authorPhotoUrl,
    this.expiresAt,
  });

  final String id;
  final String userId;
  final String url;
  final String mediaType;
  final DateTime createdAt;
  final String? authorName;
  final String? authorPhotoUrl;
  final DateTime? expiresAt;

  bool isActiveAt(DateTime now) {
    final cutoff = now.subtract(const Duration(hours: 24));
    if (createdAt.isBefore(cutoff)) {
      return false;
    }
    if (expiresAt == null) {
      return true;
    }
    return expiresAt!.isAfter(now);
  }

  @override
  List<Object?> get props => <Object?>[
        id,
        userId,
        url,
        mediaType,
        createdAt,
        authorName,
        authorPhotoUrl,
        expiresAt,
      ];
}
