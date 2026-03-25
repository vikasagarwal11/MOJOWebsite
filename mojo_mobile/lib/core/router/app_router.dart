import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../features/layout/main_layout.dart';
import '../../features/home/screens/home_screen.dart';
import '../../features/events/screens/events_screen.dart';
import '../../features/chat/screens/chat_list_screen.dart';
import '../../features/media/screens/media_screen.dart';
import '../../features/posts/screens/posts_screen.dart';
import '../../features/auth/screens/login_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) {
          return MainLayout(child: child);
        },
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => const HomeScreen(),
          ),
          GoRoute(
            path: '/events',
            builder: (context, state) => const EventsScreen(),
          ),
          GoRoute(
            path: '/chat',
            builder: (context, state) => const ChatListScreen(),
          ),
          GoRoute(
            path: '/media',
            builder: (context, state) => const MediaScreen(),
          ),
          GoRoute(
            path: '/posts',
            builder: (context, state) => const PostsScreen(),
          ),
        ],
      ),
    ],
  );
});
