import 'dart:async';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/logging/app_logger.dart';
import '../../core/providers/core_providers.dart';
import '../../core/providers/pending_shared_media_provider.dart';
import '../../core/widgets/connectivity_banner.dart';
import '../../core/widgets/floating_glass_nav_bar.dart';

class MainLayout extends ConsumerStatefulWidget {
  final Widget child;

  const MainLayout({super.key, required this.child});

  @override
  ConsumerState<MainLayout> createState() => _MainLayoutState();
}

class _MainLayoutState extends ConsumerState<MainLayout> {
  late StreamSubscription _intentDataStreamSubscription;

  @override
  void initState() {
    super.initState();
    // 1. Listen for shared media while app is already running
    _intentDataStreamSubscription = ReceiveSharingIntent.instance
        .getMediaStream()
        .listen((List<SharedMediaFile> value) {
      if (value.isNotEmpty) {
        _handleSharedMedia(value);
      }
    }, onError: (err) {
      appLogger.w('getMediaStream error: $err');
    });

    // 2. Listen for shared media when app is completely closed
    ReceiveSharingIntent.instance
        .getInitialMedia()
        .then((List<SharedMediaFile> value) {
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

    final paths = <String>[];
    for (final f in files) {
      final p = f.path.trim();
      if (p.isEmpty) continue;
      if (f.type == SharedMediaType.url || f.type == SharedMediaType.text) {
        if (p.startsWith('http://') || p.startsWith('https://')) paths.add(p);
      } else {
        paths.add(p);
      }
    }
    if (paths.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Shared content could not be opened in MOJO.')),
      );
      return;
    }

    ref.read(pendingSharedMediaPathsProvider.notifier).state = paths;
    context.go('/media');

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(paths.length > 1
            ? 'Received ${paths.length} items â€” opening the first in the editor.'
            : 'Opening your shared mediaâ€¦'),
        backgroundColor: Colors.green,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final location = GoRouterState.of(context).uri.toString();

    int calculateSelectedIndex(String loc) {
      if (loc == '/') return 0;
      if (loc == '/events' || loc.startsWith('/events/')) return 1;
      if (loc == '/media') return 2;
      if (loc == '/notifications' ||
          loc.startsWith('/chat') ||
          loc == '/posts') {
        return 3;
      }
      if (loc == '/profile') {
        return 4;
      }
      return 0;
    }

    return Scaffold(
      extendBody: true,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ConnectivityBanner(),
          Expanded(child: widget.child),
        ],
      ),
      bottomNavigationBar: FloatingGlassNavBar(
        currentIndex: calculateSelectedIndex(location),
        items: const <FloatingNavItem>[
          FloatingNavItem(
            label: 'Home',
            cupertinoIcon: CupertinoIcons.house,
            materialIcon: Icons.home_rounded,
            assetIconPath: 'assets/icons/Home.png',
          ),
          FloatingNavItem(
            label: 'Events',
            cupertinoIcon: CupertinoIcons.calendar,
            materialIcon: Icons.event_rounded,
            assetIconPath: 'assets/icons/Event.png',
          ),
          FloatingNavItem(
            label: 'Add',
            cupertinoIcon: CupertinoIcons.add_circled_solid,
            materialIcon: Icons.add_circle_rounded,
            assetIconPath: 'assets/icons/Photos.png',
          ),
          FloatingNavItem(
            label: 'Notifications',
            cupertinoIcon: CupertinoIcons.bell,
            materialIcon: Icons.notifications_rounded,
            assetIconPath: 'assets/icons/Notification.png',
          ),
          FloatingNavItem(
            label: 'Profile',
            cupertinoIcon: CupertinoIcons.person,
            materialIcon: Icons.person_rounded,
            assetIconPath: 'assets/icons/Profile.png',
          ),
        ],
        onTap: (int index) {
          switch (index) {
            case 0:
              context.go('/');
              break;
            case 1:
              context.go('/events');
              break;
            case 2:
              context.go('/media');
              break;
            case 3:
              context.go('/notifications');
              break;
            case 4:
              context.go('/profile');
              break;
          }
        },
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
                const CircleAvatar(
                    radius: 30,
                    backgroundColor: Colors.white,
                    child: Icon(Icons.person, size: 40)),
                const SizedBox(height: 10),
                Text(
                  user?.email ?? 'Guest',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (user != null)
                  const Text('Signed in',
                      style: TextStyle(color: Colors.white70, fontSize: 12)),
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
          else ...[
            ListTile(
              leading: Icon(Icons.person_outline, color: scheme.primary),
              title: const Text('My profile'),
              subtitle: const Text('Name, email, about'),
              onTap: () {
                Navigator.pop(context);
                context.go('/profile');
              },
            ),
            ListTile(
              leading: const Icon(Icons.logout, color: Colors.red),
              title:
                  const Text('Sign out', style: TextStyle(color: Colors.red)),
              onTap: () async {
                Navigator.pop(context);
                await ref.read(authServiceProvider).signOut();
              },
            ),
          ],
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
            onTap: () async {
              Navigator.pop(context);
              final raw = dotenv.env['MOJO_INSTAGRAM_URL']?.trim();
              final uri = Uri.tryParse(raw ?? '');
              if (uri != null && uri.hasScheme) {
                final ok =
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                if (!ok && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                        content: Text('Could not open Instagram link.')),
                  );
                }
              } else if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                        'Set MOJO_INSTAGRAM_URL in .env (e.g. https://instagram.com/yourhandle).'),
                  ),
                );
              }
            },
          ),
          ListTile(
            leading: const Icon(FontAwesomeIcons.facebook),
            title: const Text('Follow on Facebook'),
            onTap: () async {
              Navigator.pop(context);
              final raw = dotenv.env['MOJO_FACEBOOK_URL']?.trim();
              final uri = Uri.tryParse(raw ?? '');
              if (uri != null && uri.hasScheme) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              } else if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                        'Set MOJO_FACEBOOK_URL in .env for this shortcut.'),
                  ),
                );
              }
            },
          ),
        ],
      ),
    );
  }
}

