import 'package:cloud_firestore/cloud_firestore.dart';

import '../../domain/entities/reaction_entity.dart';

class ReactionModel extends ReactionEntity {
  const ReactionModel({
    required super.userId,
    required super.emoji,
    required super.createdAt,
  });

  factory ReactionModel.fromSnapshot(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return ReactionModel(
      userId: (data['userId'] as String?) ?? '',
      emoji: (data['emoji'] as String?) ?? '',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toFirestoreMap() => {
        'userId': userId,
        'emoji': emoji,
        'createdAt': FieldValue.serverTimestamp(),
      };
}
