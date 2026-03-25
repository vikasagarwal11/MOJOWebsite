import 'package:flutter/material.dart';
import 'chat_room_screen.dart';
import '../../../core/theme/mojo_colors.dart';

class ChatListScreen extends StatelessWidget {
  const ChatListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Mojo Community', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(icon: const Icon(Icons.search), onPressed: () {}),
        ],
      ),
      body: ListView.separated(
        itemCount: 10,
        padding: const EdgeInsets.symmetric(vertical: 16),
        separatorBuilder: (_, __) => const Divider(indent: 80, height: 1),
        itemBuilder: (context, index) {
          return ListTile(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => ChatRoomScreen(
                    roomId: 'room_$index',
                    roomName: index == 0 ? 'Mojo Moms Group' : 'Mom Friend ${index + 1}',
                  ),
                ),
              );
            },
            leading: Stack(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundImage: NetworkImage('https://i.pravatar.cc/150?u=$index'),
                ),
                if (index % 3 == 0)
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 14,
                      height: 14,
                      decoration: BoxDecoration(
                        color: Colors.green,
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                    ),
                  ),
              ],
            ),
            title: Text(
              index == 0 ? 'Mojo Moms Group' : 'Mom Friend ${index + 1}',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            subtitle: Text(
              index == 0 ? 'Sarah: See you all tomorrow at the park!' : 'Hey! Are you coming to the event?',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: index == 0 ? MojoColors.textPrimary : MojoColors.textSecondary),
            ),
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const Text('12:45 PM', style: TextStyle(fontSize: 11, color: MojoColors.textSecondary)),
                const SizedBox(height: 4),
                if (index < 2)
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: const BoxDecoration(color: MojoColors.primaryOrange, shape: BoxShape.circle),
                    child: const Text('2', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
              ],
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {},
        backgroundColor: MojoColors.primaryOrange,
        child: const Icon(Icons.message, color: Colors.white),
      ),
    );
  }
}
