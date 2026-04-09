import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../core/providers/core_providers.dart';
import '../../../core/network/firebase_error_messages.dart';
import '../../../core/theme/mojo_colors.dart';
import '../services/chat_service.dart';
import '../widgets/direct_message_user_sheet.dart';
import '../../../data/models/chat_room.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

// =============================================================================
// ChatListScreen â€” next-gen community chat list
// =============================================================================

class ChatListScreen extends ConsumerStatefulWidget {
  const ChatListScreen({super.key});

  @override
  ConsumerState<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends ConsumerState<ChatListScreen>
    with SingleTickerProviderStateMixin {
  ChatService get _chatService => ref.read(chatServiceProvider);
  final TextEditingController _searchController = TextEditingController();
  bool _isSearching = false;
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authStateProvider).valueOrNull;

    if (user == null) return _buildUnauthenticated(context);

    final asyncProfile = ref.watch(userProfileProvider(user.uid));

    return asyncProfile.when(
      loading: () => _buildShell(
        body: const Center(child: AppLoadingIndicator()),
      ),
      error: (e, _) => _buildShell(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Could not load profile: $e',
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
      data: (profile) {
        if (profile == null || !profile.isApproved) {
          return _buildPendingApproval(context, profile == null);
        }
        final isAdmin = profile.role == 'admin';
        return _buildMainScreen(context, user.uid, isAdmin);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Main chat list screen
  // ---------------------------------------------------------------------------

  Widget _buildMainScreen(BuildContext context, String uid, bool isAdmin) {
    return Scaffold(
      backgroundColor: MojoColors.background,
      appBar: _buildAppBar(context, isAdmin),
      floatingActionButton: _buildFAB(context),
      body: StreamBuilder<List<ChatRoom>>(
        stream: _chatService.getChatRooms(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: AppLoadingIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  userFacingFirestoreMessage(snapshot.error),
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }

          final allRooms = snapshot.data ?? [];

          if (allRooms.isEmpty) return _buildEmptyState(context);

          // Apply search filter
          final q = _searchQuery.toLowerCase();
          final rooms = _searchQuery.isEmpty
              ? allRooms
              : allRooms
                  .where((r) {
                    if ((r.name ?? '').toLowerCase().contains(q)) {
                      return true;
                    }
                    if (!r.isDirect) return false;
                    final others =
                        r.memberIds.where((id) => id != uid);
                    if (others.isEmpty) return false;
                    return others.first.toLowerCase().contains(q);
                  })
                  .toList();

          // Separate pinned vs regular
          final pinned =
              rooms.where((r) => r.isPinnedFor(uid)).toList();
          final regular =
              rooms.where((r) => !r.isPinnedFor(uid)).toList();

          return ListView(
            padding: const EdgeInsets.only(bottom: 100),
            children: [
              if (pinned.isNotEmpty) ...[
                Padding(
                  padding:
                      const EdgeInsets.fromLTRB(20, 12, 20, 4),
                  child: Text(
                    'PINNED',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.2,
                      color: MojoColors.textSecondary
                          .withValues(alpha: 0.6),
                    ),
                  ),
                ),
                ...pinned.asMap().entries.map((entry) {
                  return _ChatRoomTile(
                    key: ValueKey(entry.value.id),
                    room: entry.value,
                    uid: uid,
                    chatService: _chatService,
                    animationIndex: entry.key,
                  );
                }),
                const Divider(indent: 80, endIndent: 20, height: 1),
              ],
              ...regular.asMap().entries.map((entry) {
                return _ChatRoomTile(
                  key: ValueKey(entry.value.id),
                  room: entry.value,
                  uid: uid,
                  chatService: _chatService,
                  animationIndex:
                      entry.key + pinned.length,
                );
              }),
            ],
          );
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // AppBar
  // ---------------------------------------------------------------------------

  PreferredSizeWidget _buildAppBar(BuildContext context, bool isAdmin) {
    return AppBar(
      backgroundColor: MojoColors.surface,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
      title: AnimatedSwitcher(
        duration: const Duration(milliseconds: 250),
        transitionBuilder: (child, anim) =>
            FadeTransition(opacity: anim, child: child),
        child: _isSearching
            ? _buildSearchField()
            : ShaderMask(
                key: const ValueKey('title'),
                shaderCallback: (bounds) =>
                    MojoColors.mainGradient.createShader(bounds),
                child: const Text(
                  'MOJO Chat',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 24,
                    letterSpacing: 0.5,
                    color: Colors.white,
                  ),
                ),
              ),
      ),
      actions: [
        if (!_isSearching) ...[
          IconButton(
            icon: const Icon(Icons.search_rounded),
            color: MojoColors.textPrimary,
            onPressed: () {
              HapticFeedback.lightImpact();
              setState(() => _isSearching = true);
            },
          ),
          if (isAdmin)
            IconButton(
              icon: const Icon(Icons.campaign_rounded,
                  color: MojoColors.primaryOrange),
              onPressed: () =>
                  _showChatBroadcastDialog(context, _chatService),
              tooltip: 'Admin broadcast',
            ),
        ] else
          IconButton(
            icon: const Icon(Icons.close_rounded),
            color: MojoColors.textPrimary,
            onPressed: () {
              setState(() {
                _isSearching = false;
                _searchQuery = '';
                _searchController.clear();
              });
            },
          ),
      ],
    );
  }

  Widget _buildSearchField() {
    return TextField(
      key: const ValueKey('search'),
      controller: _searchController,
      autofocus: true,
      style: const TextStyle(fontSize: 16),
      decoration: InputDecoration(
        hintText: 'Search chats...',
        hintStyle: TextStyle(color: MojoColors.textSecondary.withValues(alpha: 0.5)),
        border: InputBorder.none,
        suffixIcon: _searchQuery.isNotEmpty
            ? IconButton(
                icon: const Icon(Icons.clear_rounded, size: 20),
                onPressed: () {
                  _searchController.clear();
                  setState(() => _searchQuery = '');
                },
              )
            : null,
      ),
      onChanged: (v) => setState(() => _searchQuery = v),
    );
  }

  // ---------------------------------------------------------------------------
  // FAB â€” New chat
  // ---------------------------------------------------------------------------

  Widget _buildFAB(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: MojoColors.mainGradient,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: MojoColors.primaryOrange.withValues(alpha: 0.4),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: FloatingActionButton(
        elevation: 0,
        backgroundColor: Colors.transparent,
        onPressed: () {
          HapticFeedback.mediumImpact();
          _showNewChatMenu(context);
        },
        child: const Icon(Icons.edit_rounded, color: Colors.white),
      ),
    ).animate().scale(
          delay: 300.ms,
          duration: 400.ms,
          curve: Curves.elasticOut,
        );
  }

  // ---------------------------------------------------------------------------
  // New chat: direct (1:1) vs group / community / channel
  // ---------------------------------------------------------------------------

  void _showNewChatMenu(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: EdgeInsets.fromLTRB(
          8,
          12,
          8,
          24 + MediaQuery.of(ctx).padding.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: Icon(Icons.person_rounded, color: MojoColors.primaryPurple),
              title: const Text('Direct message'),
              subtitle: const Text('1:1 chat with a member'),
              onTap: () {
                Navigator.pop(ctx);
                showDirectMessageUserSheet(context);
              },
            ),
            ListTile(
              leading: Icon(Icons.groups_rounded, color: MojoColors.primaryOrange),
              title: const Text('Group / community / channel'),
              subtitle: const Text('Create a named room for several people'),
              onTap: () {
                Navigator.pop(ctx);
                _showCreateRoomSheet(context);
              },
            ),
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Create room bottom sheet
  // ---------------------------------------------------------------------------

  void _showCreateRoomSheet(BuildContext context) {
    final nameController = TextEditingController();
    final descController = TextEditingController();
    RoomType selectedType = RoomType.group;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          return Container(
            padding: EdgeInsets.fromLTRB(
                24, 20, 24, MediaQuery.of(ctx).viewInsets.bottom + 24),
            decoration: const BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                const Text(
                  'Create New Chat',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: MojoColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: nameController,
                  decoration: InputDecoration(
                    labelText: 'Room name',
                    hintText: 'e.g. Weekend Plans',
                    filled: true,
                    fillColor: MojoColors.background,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    prefixIcon: const Icon(Icons.chat_bubble_outline_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descController,
                  decoration: InputDecoration(
                    labelText: 'Description (optional)',
                    filled: true,
                    fillColor: MojoColors.background,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    prefixIcon: const Icon(Icons.info_outline_rounded),
                  ),
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final type in [
                      RoomType.group,
                      RoomType.community,
                      RoomType.channel,
                    ])
                      ChoiceChip(
                        label: Text(_roomTypeLabel(type)),
                        selected: selectedType == type,
                        selectedColor:
                            MojoColors.primaryOrange.withValues(alpha: 0.15),
                        labelStyle: TextStyle(
                          color: selectedType == type
                              ? MojoColors.primaryOrange
                              : MojoColors.textSecondary,
                          fontWeight: selectedType == type
                              ? FontWeight.w700
                              : FontWeight.normal,
                        ),
                        onSelected: (sel) {
                          if (sel) {
                            setSheetState(() => selectedType = type);
                          }
                        },
                      ),
                  ],
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: MojoColors.mainGradient,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      onPressed: () async {
                        final name = nameController.text.trim();
                        if (name.isEmpty) return;
                        HapticFeedback.mediumImpact();
                        try {
                          await _chatService.createRoom(
                            name: name,
                            description: descController.text.trim(),
                            type: selectedType,
                            memberIds: const [],
                          );
                          if (ctx.mounted) Navigator.pop(ctx);
                        } catch (e) {
                          if (ctx.mounted) {
                            ScaffoldMessenger.of(ctx).showSnackBar(
                              SnackBar(content: Text('Error: $e')),
                            );
                          }
                        }
                      },
                      child: const Text(
                        'Create Room',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    MojoColors.primaryOrange.withValues(alpha: 0.15),
                    MojoColors.primaryPink.withValues(alpha: 0.15),
                  ],
                ),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.forum_rounded,
                size: 56,
                color: MojoColors.primaryOrange,
              ),
            )
                .animate()
                .fadeIn(duration: 600.ms)
                .scale(delay: 100.ms, duration: 500.ms, curve: Curves.elasticOut),
            const SizedBox(height: 28),
            const Text(
              'Start a Conversation',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: MojoColors.textPrimary,
              ),
            ).animate().fadeIn(delay: 200.ms, duration: 400.ms),
            const SizedBox(height: 10),
            Text(
              'Your chats will appear here.\nTap the pen icon to create a new room.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                color: MojoColors.textSecondary.withValues(alpha: 0.8),
                height: 1.5,
              ),
            ).animate().fadeIn(delay: 350.ms, duration: 400.ms),
            const SizedBox(height: 32),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: MojoColors.mainGradient,
                borderRadius: BorderRadius.circular(14),
              ),
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.transparent,
                  shadowColor: Colors.transparent,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                onPressed: () => _showNewChatMenu(context),
                child: const Text(
                  'New Chat',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
              ),
            ).animate().fadeIn(delay: 500.ms, duration: 400.ms).slideY(begin: 0.2),
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Unauthenticated state
  // ---------------------------------------------------------------------------

  Widget _buildUnauthenticated(BuildContext context) {
    return _buildShell(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      MojoColors.primaryPurple.withValues(alpha: 0.15),
                      MojoColors.primaryPink.withValues(alpha: 0.15),
                    ],
                  ),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.chat_bubble_rounded,
                  size: 52,
                  color: MojoColors.primaryPurple,
                ),
              ).animate().fadeIn(duration: 500.ms).scale(
                    delay: 100.ms,
                    duration: 500.ms,
                    curve: Curves.elasticOut,
                  ),
              const SizedBox(height: 24),
              const Text(
                'Welcome to MOJO Chat',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: MojoColors.textPrimary,
                ),
              ).animate().fadeIn(delay: 200.ms, duration: 400.ms),
              const SizedBox(height: 10),
              Text(
                'Sign in to connect with your community.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15,
                  color: MojoColors.textSecondary.withValues(alpha: 0.8),
                ),
              ).animate().fadeIn(delay: 300.ms, duration: 400.ms),
              const SizedBox(height: 32),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: MojoColors.mainGradient,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    shadowColor: Colors.transparent,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 40, vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  onPressed: () => context.push('/login'),
                  child: const Text(
                    'Sign In',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                ),
              ).animate().fadeIn(delay: 450.ms, duration: 400.ms).slideY(begin: 0.2),
            ],
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Pending approval state
  // ---------------------------------------------------------------------------

  Widget _buildPendingApproval(BuildContext context, bool noProfile) {
    return _buildShell(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 90,
                height: 90,
                decoration: BoxDecoration(
                  color: MojoColors.primaryOrange.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.hourglass_top_rounded,
                  size: 44,
                  color: MojoColors.primaryOrange,
                ),
              )
                  .animate(onPlay: (c) => c.repeat(reverse: true))
                  .scaleXY(end: 1.06, duration: 1200.ms, curve: Curves.easeInOut),
              const SizedBox(height: 24),
              const Text(
                'Almost There!',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: MojoColors.textPrimary,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                noProfile
                    ? 'Your member profile is not ready yet. Chat opens once your account exists and is approved.'
                    : 'Your account is pending approval. Chat is available once you are approved.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15,
                  color: MojoColors.textSecondary.withValues(alpha: 0.8),
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Shell wrapper
  // ---------------------------------------------------------------------------

  Widget _buildShell({required Widget body}) {
    return Scaffold(
      backgroundColor: MojoColors.background,
      appBar: AppBar(
        backgroundColor: MojoColors.surface,
        elevation: 0,
        title: ShaderMask(
          shaderCallback: (bounds) =>
              MojoColors.mainGradient.createShader(bounds),
          child: const Text(
            'MOJO Chat',
            style: TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 24,
              letterSpacing: 0.5,
              color: Colors.white,
            ),
          ),
        ),
      ),
      body: body,
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  String _roomTypeLabel(RoomType type) {
    switch (type) {
      case RoomType.group:
        return 'Group';
      case RoomType.community:
        return 'Community';
      case RoomType.channel:
        return 'Channel';
      case RoomType.broadcast:
        return 'Broadcast';
      case RoomType.direct:
        return 'Direct';
    }
  }
}

// =============================================================================
// _ChatRoomTile â€” individual room row with swipe actions & long-press menu
// =============================================================================

String _resolvedChatTitle(WidgetRef ref, ChatRoom room, String uid) {
  if (!room.isDirect) return room.displayName(uid);
  final others = room.memberIds.where((id) => id != uid);
  if (others.isEmpty) return room.displayName(uid);
  final otherUid = others.first;
  return ref.watch(userProfileProvider(otherUid)).when(
        data: (p) => p?.resolvedPublicName ?? 'Member',
        loading: () => 'Member',
        error: (_, __) => 'Chat',
      );
}

class _ChatRoomTile extends ConsumerWidget {
  const _ChatRoomTile({
    super.key,
    required this.room,
    required this.uid,
    required this.chatService,
    required this.animationIndex,
  });

  final ChatRoom room;
  final String uid;
  final ChatService chatService;
  final int animationIndex;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isMuted = room.isMutedFor(uid);
    final isPinned = room.isPinnedFor(uid);
    final unread = room.unreadCountFor(uid);
    final typingIds = room.currentlyTypingUserIds
        .where((id) => id != uid)
        .toList();

    return Dismissible(
      key: ValueKey('dismiss_${room.id}'),
      confirmDismiss: (direction) async {
        HapticFeedback.mediumImpact();
        if (direction == DismissDirection.startToEnd) {
          // Pin / Unpin
          if (isPinned) {
            // unpinRoom not in service â€” just call pinRoom as toggle
            await chatService.pinRoom(room.id);
          } else {
            await chatService.pinRoom(room.id);
          }
        } else {
          // Mute / unmute
          if (isMuted) {
            await chatService.unmuteRoom(room.id);
          } else {
            await chatService.muteRoom(room.id);
          }
        }
        return false; // Don't remove the tile
      },
      background: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 24),
        color: Colors.blue.shade50,
        child: Icon(
          isPinned ? Icons.push_pin_outlined : Icons.push_pin_rounded,
          color: Colors.blue.shade600,
        ),
      ),
      secondaryBackground: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 24),
        color: MojoColors.primaryOrange.withValues(alpha: 0.1),
        child: Icon(
          isMuted ? Icons.volume_up_rounded : Icons.volume_off_rounded,
          color: MojoColors.primaryOrange,
        ),
      ),
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          final title = _resolvedChatTitle(ref, room, uid);
          context.push(
            '/chat/${room.id}?name=${Uri.encodeComponent(title)}',
          );
        },
        onLongPress: () {
          HapticFeedback.heavyImpact();
          _showLongPressSheet(context);
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              // Avatar
              _buildAvatar(),
              const SizedBox(width: 14),
              // Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Top row: name + time
                    Row(
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              Flexible(
                                child: Text(
                                  _resolvedChatTitle(ref, room, uid),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: unread > 0
                                        ? FontWeight.w800
                                        : FontWeight.w600,
                                    color: MojoColors.textPrimary,
                                  ),
                                ),
                              ),
                              if (isMuted) ...[
                                const SizedBox(width: 4),
                                Icon(
                                  Icons.volume_off_rounded,
                                  size: 14,
                                  color: MojoColors.textSecondary
                                      .withValues(alpha: 0.5),
                                ),
                              ],
                              if (isPinned) ...[
                                const SizedBox(width: 4),
                                Icon(
                                  Icons.push_pin_rounded,
                                  size: 14,
                                  color: MojoColors.textSecondary
                                      .withValues(alpha: 0.5),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          _formatTimestamp(room.lastMessageTime),
                          style: TextStyle(
                            fontSize: 12,
                            color: unread > 0
                                ? MojoColors.primaryOrange
                                : MojoColors.textSecondary
                                    .withValues(alpha: 0.6),
                            fontWeight:
                                unread > 0 ? FontWeight.w600 : FontWeight.normal,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    // Bottom row: message preview + unread badge
                    Row(
                      children: [
                        Expanded(
                          child: typingIds.isNotEmpty
                              ? _buildTypingIndicator(typingIds)
                              : _buildMessagePreview(),
                        ),
                        if (unread > 0) ...[
                          const SizedBox(width: 8),
                          _UnreadBadge(count: unread),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    )
        .animate()
        .fadeIn(
          delay: Duration(milliseconds: 40 * animationIndex.clamp(0, 15)),
          duration: 300.ms,
        )
        .slideX(begin: 0.04, end: 0, curve: Curves.easeOut);
  }

  // ---------------------------------------------------------------------------
  // Avatar
  // ---------------------------------------------------------------------------

  Widget _buildAvatar() {
    final hasImage = room.imageUrl != null && room.imageUrl!.isNotEmpty;
    final isDirect = room.type == RoomType.direct;
    final isOnline =
        isDirect && room.onlineMembers.any((id) => id != uid);

    Widget avatar;
    if (hasImage) {
      avatar = CircleAvatar(
        radius: 28,
        backgroundImage: CachedNetworkImageProvider(room.imageUrl!),
      );
    } else {
      avatar = Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          gradient: _gradientForType(room.type),
          shape: BoxShape.circle,
        ),
        child: Icon(
          _iconForType(room.type),
          color: Colors.white,
          size: 26,
        ),
      );
    }

    if (isDirect && isOnline) {
      return Stack(
        children: [
          avatar,
          Positioned(
            right: 1,
            bottom: 1,
            child: Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                color: const Color(0xFF22C55E),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
            ),
          ),
        ],
      );
    }
    return avatar;
  }

  LinearGradient _gradientForType(RoomType type) {
    switch (type) {
      case RoomType.direct:
        return const LinearGradient(
          colors: [MojoColors.primaryPurple, Color(0xFFA78BFA)],
        );
      case RoomType.broadcast:
        return const LinearGradient(
          colors: [MojoColors.primaryOrange, MojoColors.primaryPink],
        );
      case RoomType.channel:
        return const LinearGradient(
          colors: [Color(0xFF06B6D4), Color(0xFF3B82F6)],
        );
      case RoomType.community:
        return const LinearGradient(
          colors: [MojoColors.primaryPink, MojoColors.primaryPurple],
        );
      case RoomType.group:
        return const LinearGradient(
          colors: [MojoColors.primaryOrange, Color(0xFFFF7A5C)],
        );
    }
  }

  IconData _iconForType(RoomType type) {
    switch (type) {
      case RoomType.direct:
        return Icons.person_rounded;
      case RoomType.group:
        return Icons.group_rounded;
      case RoomType.community:
        return Icons.people_alt_rounded;
      case RoomType.broadcast:
        return Icons.campaign_rounded;
      case RoomType.channel:
        return Icons.podcasts_rounded;
    }
  }

  // ---------------------------------------------------------------------------
  // Message preview
  // ---------------------------------------------------------------------------

  Widget _buildMessagePreview() {
    if (room.lastMessage == null || room.lastMessage!.isEmpty) {
      return Text(
        'No messages yet',
        style: TextStyle(
          fontSize: 14,
          color: MojoColors.textSecondary.withValues(alpha: 0.5),
          fontStyle: FontStyle.italic,
        ),
      );
    }

    final typePrefix = _messageTypeEmoji(room.lastMessageType);
    final senderPrefix =
        room.isGroup && room.lastMessageSenderName != null
            ? '${room.lastMessageSenderName}: '
            : '';

    return Text(
      '$typePrefix$senderPrefix${room.lastMessage}',
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontSize: 14,
        color: MojoColors.textSecondary.withValues(alpha: 0.8),
      ),
    );
  }

  String _messageTypeEmoji(String? type) {
    switch (type) {
      case 'image':
        return '\u{1F4F7} ';
      case 'video':
        return '\u{1F3A5} ';
      case 'voice':
        return '\u{1F3A4} ';
      case 'document':
        return '\u{1F4CE} ';
      case 'gif':
        return '\u{1F3AF} ';
      default:
        return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Typing indicator
  // ---------------------------------------------------------------------------

  Widget _buildTypingIndicator(List<String> typingIds) {
    final label = typingIds.length == 1
        ? '${typingIds.first} is typing'
        : '${typingIds.length} people typing';

    return Row(
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 14,
            color: MojoColors.primaryOrange,
            fontStyle: FontStyle.italic,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(width: 2),
        const _TypingDots(),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Timestamp formatting
  // ---------------------------------------------------------------------------

  String _formatTimestamp(DateTime? time) {
    if (time == null) return '';
    final now = DateTime.now();
    final diff = now.difference(time);

    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24 && now.day == time.day) {
      return DateFormat('h:mm a').format(time);
    }
    if (diff.inHours < 48 && now.day - time.day == 1) return 'Yesterday';
    if (diff.inDays < 7) return DateFormat('EEE').format(time);
    return DateFormat('MM/dd').format(time);
  }

  // ---------------------------------------------------------------------------
  // Long-press bottom sheet
  // ---------------------------------------------------------------------------

  void _showLongPressSheet(BuildContext context) {
    final isPinned = room.isPinnedFor(uid);
    final isMuted = room.isMutedFor(uid);

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: Icon(
                  isPinned
                      ? Icons.push_pin_outlined
                      : Icons.push_pin_rounded,
                  color: Colors.blue.shade600,
                ),
                title: Text(isPinned ? 'Unpin' : 'Pin'),
                onTap: () {
                  Navigator.pop(ctx);
                  chatService.pinRoom(room.id);
                },
              ),
              ListTile(
                leading: Icon(
                  isMuted
                      ? Icons.volume_up_rounded
                      : Icons.volume_off_rounded,
                  color: MojoColors.primaryOrange,
                ),
                title: Text(isMuted ? 'Unmute' : 'Mute'),
                onTap: () {
                  Navigator.pop(ctx);
                  if (isMuted) {
                    chatService.unmuteRoom(room.id);
                  } else {
                    chatService.muteRoom(room.id);
                  }
                },
              ),
              ListTile(
                leading: const Icon(Icons.archive_outlined,
                    color: MojoColors.primaryPurple),
                title: const Text('Archive'),
                onTap: () {
                  Navigator.pop(ctx);
                  chatService.archiveRoom(room.id);
                },
              ),
              const Divider(height: 1),
              ListTile(
                leading:
                    Icon(Icons.delete_outline_rounded, color: Colors.red.shade400),
                title: Text('Delete chat',
                    style: TextStyle(color: Colors.red.shade400)),
                onTap: () {
                  Navigator.pop(ctx);
                  // Could add confirmation dialog + delete logic
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// _UnreadBadge
// =============================================================================

class _UnreadBadge extends StatelessWidget {
  const _UnreadBadge({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    final label = count > 99 ? '99+' : '$count';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        gradient: MojoColors.mainGradient,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

// =============================================================================
// _TypingDots â€” animated three-dot indicator
// =============================================================================

class _TypingDots extends StatelessWidget {
  const _TypingDots();

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (i) {
        return Container(
          width: 4,
          height: 4,
          margin: const EdgeInsets.symmetric(horizontal: 1),
          decoration: const BoxDecoration(
            color: MojoColors.primaryOrange,
            shape: BoxShape.circle,
          ),
        )
            .animate(onPlay: (c) => c.repeat(reverse: true))
            .fadeIn(duration: 400.ms, delay: Duration(milliseconds: i * 150))
            .scaleXY(end: 1.4, duration: 400.ms, delay: Duration(milliseconds: i * 150));
      }),
    );
  }
}

// =============================================================================
// Admin broadcast dialog (preserved from original)
// =============================================================================

void _showChatBroadcastDialog(BuildContext context, ChatService service) {
  final controller = TextEditingController();
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: MojoColors.primaryOrange.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.campaign_rounded,
                color: MojoColors.primaryOrange, size: 22),
          ),
          const SizedBox(width: 12),
          const Text(
            'Global Broadcast',
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
          ),
        ],
      ),
      content: TextField(
        controller: controller,
        maxLines: 3,
        decoration: InputDecoration(
          hintText: 'Message to all moms\u2026',
          filled: true,
          fillColor: MojoColors.background,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('Cancel',
              style: TextStyle(color: MojoColors.textSecondary)),
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: MojoColors.mainGradient,
            borderRadius: BorderRadius.circular(10),
          ),
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.transparent,
              shadowColor: Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            onPressed: () async {
              if (controller.text.isEmpty) return;
              await service.sendBroadcast(controller.text);
              if (context.mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Broadcast sent.'),
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              }
            },
            child: const Text('Send',
                style: TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w600)),
          ),
        ),
      ],
    ),
  );
}

