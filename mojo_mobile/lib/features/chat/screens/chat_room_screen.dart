import 'package:flutter/material.dart';
import 'package:flutter_chat_ui/flutter_chat_ui.dart';
import 'package:flutter_chat_types/flutter_chat_types.dart' as types;
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/mojo_colors.dart';
import '../services/chat_service.dart';

class ChatRoomScreen extends StatefulWidget {
  final String roomId;
  final String roomName;

  const ChatRoomScreen({super.key, required this.roomId, required this.roomName});

  @override
  State<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

class _ChatRoomScreenState extends State<ChatRoomScreen> {
  final _chatService = ChatService();
  final _user = types.User(
    id: FirebaseAuth.instance.currentUser?.uid ?? 'guest',
    firstName: FirebaseAuth.instance.currentUser?.displayName ?? 'Mojo Mom',
  );

  void _handleSendPressed(types.PartialText message) {
    _chatService.sendMessage(
      roomId: widget.roomId,
      text: message.text,
    );
  }

  void _showAICatchUp() async {
    final summary = await _chatService.getAICatchUp(widget.roomId);
    if (!mounted) return;
    
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.auto_awesome, color: MojoColors.primaryPurple),
                const SizedBox(width: 8),
                Text('AI Catch-Up', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: MojoColors.primaryPurple)),
              ],
            ),
            const SizedBox(height: 16),
            Text(summary, style: const TextStyle(fontSize: 15, height: 1.5)),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: MojoColors.primaryPurple,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                ),
                child: const Text('Got it!'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = FirebaseAuth.instance.currentUser;
    if (session == null) {
      return Scaffold(
        appBar: AppBar(title: Text(widget.roomName)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('Sign in to read and send messages.', textAlign: TextAlign.center),
                const SizedBox(height: 16),
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

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.roomName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const Text('Real-time Community', style: TextStyle(fontSize: 12, color: Colors.green)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.auto_awesome, color: MojoColors.primaryPurple),
            onPressed: _showAICatchUp,
            tooltip: 'AI Catch-Up',
          ),
        ],
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: _chatService.getMessages(widget.roomId),
        builder: (context, snapshot) {
          if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());

          final messages = snapshot.data!.docs.map((doc) {
            final data = doc.data() as Map<String, dynamic>;
            final type = (data['type'] as String?) ?? 'text';
            final rawText = data['text'] as String?;
            final text = type == 'voice'
                ? '🎤 Voice message'
                : (rawText?.isNotEmpty == true ? rawText! : (type == 'image' ? '📷 Image' : ' '));
            return types.TextMessage(
              author: types.User(
                id: '${data['senderId'] ?? 'unknown'}',
                firstName: '${data['senderName'] ?? 'Member'}',
              ),
              createdAt: (data['timestamp'] as Timestamp?)?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch,
              id: doc.id,
              text: text.trim().isEmpty ? ' ' : text,
            );
          }).toList();

          return Chat(
            messages: messages,
            onSendPressed: _handleSendPressed,
            user: _user,
            theme: DefaultChatTheme(
              primaryColor: MojoColors.primaryOrange,
              secondaryColor: Colors.grey.shade200,
              backgroundColor: MojoColors.background,
              inputBackgroundColor: Colors.white,
              inputTextColor: MojoColors.textPrimary,
            ),
          );
        },
      ),
    );
  }
}
