import 'package:equatable/equatable.dart';

class ReactionEntity extends Equatable {
  const ReactionEntity({
    required this.userId,
    required this.emoji,
    required this.createdAt,
  });

  final String userId;
  final String emoji;
  final DateTime? createdAt;

  @override
  List<Object?> get props => <Object?>[userId, emoji, createdAt];
}
