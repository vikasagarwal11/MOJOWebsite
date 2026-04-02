import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../services/chat_service.dart';
import 'chat_room_screen.dart';

class ChatListScreen extends ConsumerWidget {
  const ChatListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final user = ref.watch(authStateProvider).valueOrNull;
    if (user == null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Mojo Community', style: TextStyle(fontWeight: FontWeight.bold)),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.chat_bubble_outline, size: 64, color: scheme.primary.withValues(alpha: 0.5)),
                const SizedBox(height: 16),
                Text(
                  'Sign in to access community chat.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 16),
                ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => context.push('/login'),
                  child: const Text('Sign in'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final asyncProfile = ref.watch(userProfileProvider(user.uid));

    return asyncProfile.when(
      loading: () => Scaffold(
        appBar: AppBar(
          title: const Text('Mojo Community', style: TextStyle(fontWeight: FontWeight.bold)),
        ),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(
          title: const Text('Mojo Community', style: TextStyle(fontWeight: FontWeight.bold)),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Could not load profile: $e', textAlign: TextAlign.center),
          ),
        ),
      ),
      data: (profile) {
        if (profile == null || !profile.isApproved) {
          return Scaffold(
            appBar: AppBar(
              title: const Text('Mojo Community', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  profile == null
                      ? 'Your member profile is not ready yet. Chat opens once your account exists in Firestore and is approved.'
                      : 'Your account is pending approval. Chat is available once you are approved (same as web member areas).',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 16),
                ),
              ),
            ),
          );
        }

        return _ChatRoomsBody(scheme: scheme, uid: user.uid);
      },
    );
  }
}

class _ChatRoomsBody extends StatelessWidget {
  const _ChatRoomsBody({required this.scheme, required this.uid});

  final ColorScheme scheme;
  final String uid;

  @override
  Widget build(BuildContext context) {
    final chatService = ChatService();
    // Admin check needs profile — use a tiny Consumer for the button only.
    return Consumer(
      builder: (context, ref, _) {
        final profile = ref.watch(userProfileProvider(uid)).valueOrNull;
        final isAdmin = profile?.role == 'admin';

        return Scaffold(
      appBar: AppBar(
        title: const Text('Mojo Community', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          if (isAdmin)
            IconButton(
              icon: const Icon(Icons.campaign, color: MojoColors.primaryOrange),
              onPressed: () => _showChatBroadcastDialog(context, chatService),
              tooltip: 'Admin broadcast',
            ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: chatService.getChatRooms(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  'Could not load chat rooms: ${snapshot.error}\nDeploy Firestore rules with chatRooms access.',
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          final rooms = snapshot.data?.docs ?? [];

          if (rooms.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.forum_outlined, size: 80, color: Colors.grey.shade300),
                    const SizedBox(height: 24),
                    const Text(
                      'No chat rooms yet',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.grey),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Ask an admin to add documents under chatRooms in Firebase (or use the web tooling).',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey),
                    ),
                  ],
                ),
              ),
            );
          }

          return ListView.separated(
            itemCount: rooms.length,
            padding: const EdgeInsets.symmetric(vertical: 16),
            separatorBuilder: (_, __) => const Divider(indent: 80, height: 1),
            itemBuilder: (context, index) {
              final room = rooms[index].data() as Map<String, dynamic>;
              final roomId = rooms[index].id;
              final lastTime = (room['lastMessageTime'] as Timestamp?)?.toDate();

              return ListTile(
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => ChatRoomScreen(
                        roomId: roomId,
                        roomName: room['name'] ?? 'Chat Room',
                      ),
                    ),
                  );
                },
                leading: CircleAvatar(
                  radius: 28,
                  backgroundColor: room['type'] == 'broadcast'
                      ? Colors.orange.shade50
                      : MojoColors.primaryPurple.withValues(alpha: 0.1),
                  child: Icon(
                    room['type'] == 'broadcast' ? Icons.campaign : Icons.groups,
                    color: room['type'] == 'broadcast' ? Colors.orange : MojoColors.primaryPurple,
                  ),
                ),
                title: Text(
                  room['name'] ?? 'Community Room',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                subtitle: Text(
                  room['lastMessage'] ?? 'No messages yet',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                trailing: lastTime != null
                    ? Text(
                        DateFormat('h:mm a').format(lastTime),
                        style: const TextStyle(fontSize: 11, color: Colors.grey),
                      )
                    : null,
              );
            },
          );
        },
      ),
        );
      },
    );
  }
}

void _showChatBroadcastDialog(BuildContext context, ChatService service) {
  final controller = TextEditingController();
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Global broadcast'),
      content: TextField(
        controller: controller,
        maxLines: 3,
        decoration: const InputDecoration(
          hintText: 'Message to all moms…',
          border: OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        ElevatedButton(
          onPressed: () async {
            if (controller.text.isEmpty) return;
            await service.sendBroadcast(controller.text);
            if (context.mounted) {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Broadcast sent.')),
              );
            }
          },
          child: const Text('Send'),
        ),
      ],
    ),
  );
}
