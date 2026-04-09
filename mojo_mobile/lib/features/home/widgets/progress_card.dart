import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';
import '../../../data/models/mojo_user_profile.dart';
import '../../../core/theme/mojo_colors.dart';

/// Weekly goal UI; events attended comes from Firestore `users.eventHistory` when set by the website.
class ProgressCard extends ConsumerWidget {
  const ProgressCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider).valueOrNull;
    final profileAsync =
        user != null ? ref.watch(userProfileProvider(user.uid)) : const AsyncValue<MojoUserProfile?>.data(null);
    final eventsAttended = profileAsync.valueOrNull?.eventHistory;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Weekly Goal', style: TextStyle(color: MojoColors.textSecondary, fontSize: 14)),
                  const Text('3/5 Workouts', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  if (eventsAttended != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        '$eventsAttended events attended (from your profile)',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                      ),
                    ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: MojoColors.primaryPurple.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text('🔥 Streak', style: TextStyle(color: MojoColors.primaryPurple, fontWeight: FontWeight.bold, fontSize: 12)),
              ),
            ],
          ),
          const SizedBox(height: 20),
          const _ProgressBar(percentage: 0.6),
        ],
      ),
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.percentage});

  final double percentage;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Container(
          height: 12,
          width: double.infinity,
          decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(10)),
        ),
        FractionallySizedBox(
          widthFactor: percentage,
          child: Container(
            height: 12,
            decoration: BoxDecoration(
              gradient: MojoColors.purpleGradient,
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      ],
    );
  }
}
