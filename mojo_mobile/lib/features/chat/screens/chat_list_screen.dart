import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/providers/core_providers.dart';

/// Community tab: the website does not expose Firestore 1:1 DMs yet.
/// Real-time community interaction happens via **Posts** and **Events** (and comments on web).
class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final user = ref.watch(authStateProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Community', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Icon(Icons.groups_2_outlined, size: 64, color: scheme.primary.withValues(alpha: 0.7)),
          const SizedBox(height: 16),
          Text(
            'No separate chat inbox yet',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          Text(
            'This app does not show fake contacts. The MOJO website centers on Posts, Events, and '
            'comments on the web—not a standalone DM inbox in Firestore. Use the shortcuts below to connect.',
            style: TextStyle(color: scheme.onSurfaceVariant, height: 1.45),
          ),
          const SizedBox(height: 28),
          _CtaCard(
            icon: Icons.feed_outlined,
            title: 'Community posts',
            subtitle: 'See what members are sharing.',
            onTap: () => context.go('/posts'),
            scheme: scheme,
          ),
          const SizedBox(height: 12),
          _CtaCard(
            icon: Icons.event_outlined,
            title: 'Events',
            subtitle: 'RSVP and meet up at upcoming sessions.',
            onTap: () => context.go('/events'),
            scheme: scheme,
          ),
          const SizedBox(height: 24),
          if (user == null)
            OutlinedButton.icon(
              onPressed: () => context.push('/login'),
              icon: const Icon(Icons.login),
              label: const Text('Sign in for your member profile'),
            )
          else
            Text(
              'Signed in as ${user.email ?? user.uid}',
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13),
            ),
        ],
      ),
    );
  }
}

class _CtaCard extends StatelessWidget {
  const _CtaCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    required this.scheme,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, color: scheme.primary, size: 32),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(height: 4),
                    Text(subtitle, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}
