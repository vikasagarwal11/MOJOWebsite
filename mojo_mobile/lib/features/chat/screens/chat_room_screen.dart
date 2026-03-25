import 'package:flutter/material.dart';
import 'package:flutter_chat_ui/flutter_chat_ui.dart';
import 'package:flutter_chat_types/flutter_chat_types.dart' as types;
import 'package:uuid/uuid.dart';
import '../../../core/theme/mojo_colors.dart';

class ChatRoomScreen extends StatefulWidget {
  final String roomId;
  final String roomName;

  const ChatRoomScreen({super.key, required this.roomId, required this.roomName});

  @override
  State<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

class _ChatRoomScreenState extends State<ChatRoomScreen> {
  final List<types.Message> _messages = [];
  final _user = const types.User(id: '82091008-a484-4a89-ae75-a22bf8d6f3ac');

  @override
  void initState() {
    super.initState();
    _loadMessages();
  }

  void _loadMessages() {
    // Mock initial messages
    final message = types.TextMessage(
      author: const types.User(id: 'friend', firstName: 'Sarah'),
      createdAt: DateTime.now().subtract(const Duration(minutes: 5)).millisecondsSinceEpoch,
      id: const Uuid().v4(),
      text: 'Hey! Are you coming to the park workout tomorrow morning?',
    );

    setState(() {
      _messages.add(message);
    });
  }

  void _handleSendPressed(types.PartialText message) {
    final textMessage = types.TextMessage(
      author: _user,
      createdAt: DateTime.now().millisecondsSinceEpoch,
      id: const Uuid().v4(),
      text: message.text,
    );

    setState(() {
      _messages.insert(0, textMessage);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundImage: NetworkImage('https://i.pravatar.cc/150?u=${widget.roomId}'),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(widget.roomName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const Text('Online', style: TextStyle(fontSize: 12, color: Colors.green)),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.videocam_outlined), onPressed: () {}),
          IconButton(icon: const Icon(Icons.call_outlined), onPressed: () {}),
        ],
      ),
      body: Chat(
        messages: _messages,
        onSendPressed: _handleSendPressed,
        user: _user,
        theme: DefaultChatTheme(
          primaryColor: MojoColors.primaryOrange,
          secondaryColor: Colors.grey.shade200,
          inputBackgroundColor: Colors.white,
          inputTextColor: MojoColors.textPrimary,
          receivedMessageBodyTextStyle: const TextStyle(color: MojoColors.textPrimary, fontSize: 14),
          sentMessageBodyTextStyle: const TextStyle(color: Colors.white, fontSize: 14),
          backgroundColor: MojoColors.background,
        ),
      ),
    );
  }
}
