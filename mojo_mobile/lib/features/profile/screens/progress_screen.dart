import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../home/widgets/share_card_generator.dart';

class ProgressScreen extends StatelessWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Mojo Journey', style: TextStyle(fontWeight: FontWeight.bold)),
        elevation: 0,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _MojoLevelCard(),
            const SizedBox(height: 24),
            ShareCardGenerator(),
            const SizedBox(height: 30),
            const Text('Achievements', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 15),
            const _BadgesGrid(),
            const SizedBox(height: 30),
            const Text('Activity History', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 15),
            const _ActivityList(),
          ],
        ),
      ),
    );
  }
}

class _MojoLevelCard extends StatelessWidget {
  const _MojoLevelCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: MojoColors.purpleGradient,
        borderRadius: BorderRadius.circular(30),
        boxShadow: [
          BoxShadow(
            color: MojoColors.primaryPurple.withOpacity(0.3),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        children: [
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Level 5', style: TextStyle(color: Colors.white70, fontSize: 16)),
              Text('Elite Member', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 15),
          const Text('2,450 XP', style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold)),
          const SizedBox(height: 15),
          LinearProgressIndicator(
            value: 0.7,
            backgroundColor: Colors.white24,
            valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
            minHeight: 8,
            borderRadius: BorderRadius.circular(10),
          ),
          const SizedBox(height: 10),
          const Text('550 XP to Level 6', style: TextStyle(color: Colors.white70, fontSize: 12)),
        ],
      ),
    ).animate().fadeIn().scale(delay: 200.ms);
  }
}

class _BadgesGrid extends StatelessWidget {
  const _BadgesGrid();

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 4,
      mainAxisSpacing: 15,
      crossAxisSpacing: 15,
      children: [
        _BadgeIcon(icon: Icons.flash_on, label: '7 Day Streak', color: Colors.orange),
        _BadgeIcon(icon: Icons.groups, label: 'Social Star', color: Colors.blue),
        _BadgeIcon(icon: Icons.emoji_events, label: 'First RSVP', color: Colors.amber.shade700),
        _BadgeIcon(icon: Icons.timer, label: 'Early Bird', color: Colors.purple),
        _BadgeIcon(icon: Icons.favorite, label: 'Mojo Supporter', color: Colors.red),
        _BadgeIcon(icon: Icons.camera_alt, label: 'Photographer', color: Colors.teal),
        _BadgeIcon(icon: Icons.celebration, label: '1 Month Plus', color: Colors.pink, isLocked: true),
        _BadgeIcon(icon: Icons.workspace_premium, label: 'Mojo Legend', color: Colors.indigo, isLocked: true),
      ],
    );
  }
}

class _BadgeIcon extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final bool isLocked;

  const _BadgeIcon({
    required this.icon,
    required this.label,
    required this.color,
    this.isLocked = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isLocked ? Colors.grey.shade200 : color.withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(
            icon,
            color: isLocked ? Colors.grey : color,
            size: 24,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.bold,
            color: isLocked ? Colors.grey : MojoColors.textPrimary,
          ),
        ),
      ],
    ).animate(target: isLocked ? 0 : 1).shake(delay: 500.ms);
  }
}

class _ActivityList extends StatelessWidget {
  const _ActivityList();

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: 5,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) => ListTile(
        leading: CircleAvatar(
          backgroundColor: MojoColors.primaryOrange.withOpacity(0.1),
          child: const Icon(Icons.check, color: MojoColors.primaryOrange, size: 20),
        ),
        title: Text(index == 0 ? 'Attended HIIT Session' : 'Posted in Community'),
        subtitle: const Text('2 hours ago'),
        trailing: const Text('+50 XP', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.green)),
        tileColor: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
      ),
    );
  }
}
