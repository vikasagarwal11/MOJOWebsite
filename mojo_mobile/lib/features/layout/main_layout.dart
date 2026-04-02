import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

import '../../core/logging/app_logger.dart';
import '../../core/providers/core_providers.dart';
import '../../core/widgets/connectivity_banner.dart';

class MainLayout extends StatefulWidget {
  final Widget child;

  const MainLayout({super.key, required this.child});

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends State<MainLayout> {
  late StreamSubscription _intentDataStreamSubscription;

  @override
  void initState() {
    super.initState();
    // 1. Listen for shared media while app is already running
    _intentDataStreamSubscription = ReceiveSharingIntent.instance.getMediaStream().listen((List<SharedMediaFile> value) {
      if (value.isNotEmpty) {
        _handleSharedMedia(value);
      }
    }, onError: (err) {
      appLogger.w('getMediaStream error: $err');
    });

    // 2. Listen for shared media when app is completely closed
    ReceiveSharingIntent.instance.getInitialMedia().then((List<SharedMediaFile> value) {
      if (value.isNotEmpty) {
        // Clear the initial intent so it doesn't trigger repeatedly
        ReceiveSharingIntent.instance.reset();
        _handleSharedMedia(value);
      }
    });
  }

  @override
  void dispose() {
    _intentDataStreamSubscription.cancel();
    super.dispose();
  }

  void _handleSharedMedia(List<SharedMediaFile> files) {
    if (files.isEmpty) return;
    
    // Auto-navigate user to the Media/Gallery Screen so they can instantly start their edit
    context.go('/media');
    
    // In a fully developed production state, we would pass `files.first.path` as an argument to the MediaScreen.
    // Right now, simply getting them into the editor removes the major friction of opening the app manually.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Received Media from outside MOJO! ✨ Tap Add to edit it.'),
        backgroundColor: Colors.green,
        duration: Duration(seconds: 4),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final location = GoRouterState.of(context).uri.toString();

    int calculateSelectedIndex(String loc) {
      if (loc == '/') return 0;
      if (loc == '/events' || loc.startsWith('/event/')) return 1;
      if (loc == '/chat') return 2;
      if (loc == '/media') return 3;
      if (loc == '/posts') return 4;
      return 0;
    }

    return Scaffold(
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ConnectivityBanner(),
          Expanded(child: widget.child),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.05),
              blurRadius: 10,
              offset: const Offset(0, -5),
            ),
          ],
        ),
        child: NavigationBar(
          elevation: 0,
          backgroundColor: scheme.surface,
          indicatorColor: scheme.primary.withValues(alpha: 0.12),
          selectedIndex: calculateSelectedIndex(location),
          onDestinationSelected: (index) {
            switch (index) {
              case 0:
                context.go('/');
                break;
              case 1:
                context.go('/events');
                break;
              case 2:
                context.go('/chat');
                break;
              case 3:
                context.go('/media');
                break;
              case 4:
                context.go('/posts');
                break;
            }
          },
          destinations: [
            NavigationDestination(
              icon: const Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home, color: scheme.primary),
              label: 'Home',
            ),
            NavigationDestination(
              icon: const Icon(Icons.calendar_month_outlined),
              selectedIcon: Icon(Icons.calendar_month, color: scheme.primary),
              label: 'Events',
            ),
            NavigationDestination(
              icon: const Icon(Icons.groups_2_outlined),
              selectedIcon: Icon(Icons.groups_2, color: scheme.primary),
              label: 'Community',
            ),
            NavigationDestination(
              icon: const Icon(Icons.photo_library_outlined),
              selectedIcon: Icon(Icons.photo_library, color: scheme.primary),
              label: 'Media',
            ),
            NavigationDestination(
              icon: const Icon(Icons.feed_outlined),
              selectedIcon: Icon(Icons.feed, color: scheme.primary),
              label: 'Posts',
            ),
          ],
        ),
      ),
      drawer: MojoDrawer(scheme: scheme),
    );
  }
}

class MojoDrawer extends ConsumerWidget {
  const MojoDrawer({super.key, required this.scheme});

  final ColorScheme scheme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authStateProvider).valueOrNull;

    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          DrawerHeader(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [scheme.primary, scheme.secondary],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const CircleAvatar(radius: 30, backgroundColor: Colors.white, child: Icon(Icons.person, size: 40)),
                const SizedBox(height: 10),
                Text(
                  user?.email ?? 'Guest',
                  style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (user != null)
                  const Text('Signed in', style: TextStyle(color: Colors.white70, fontSize: 12)),
              ],
            ),
          ),
          if (user == null)
            ListTile(
              leading: Icon(Icons.login, color: scheme.primary),
              title: const Text('Sign in'),
              onTap: () {
                Navigator.pop(context);
                context.push('/login');
              },
            )
          else
            ListTile(
              leading: const Icon(Icons.logout, color: Colors.red),
              title: const Text('Sign out', style: TextStyle(color: Colors.red)),
              onTap: () async {
                Navigator.pop(context);
                await ref.read(authServiceProvider).signOut();
              },
            ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: const Text('About Us'),
            onTap: () => Navigator.pop(context),
          ),
          ListTile(
            leading: const Icon(Icons.star_outline),
            title: const Text('Founder'),
            onTap: () => Navigator.pop(context),
          ),
          ListTile(
            leading: const Icon(Icons.auto_stories_outlined),
            title: const Text('MFM Stories'),
            onTap: () => Navigator.pop(context),
          ),
          ListTile(
            leading: const Icon(Icons.library_books_outlined),
            title: const Text('Resources'),
            onTap: () => Navigator.pop(context),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(FontAwesomeIcons.instagram),
            title: const Text('Follow on Instagram'),
            onTap: () {},
          ),
          ListTile(
            leading: const Icon(FontAwesomeIcons.facebook),
            title: const Text('Follow on Facebook'),
            onTap: () {},
          ),
        ],
      ),
    );
  }
}
