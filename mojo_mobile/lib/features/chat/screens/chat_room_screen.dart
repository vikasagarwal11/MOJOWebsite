import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../core/network/firebase_error_messages.dart';
import '../../../core/text/safe_text.dart';
import '../../../data/models/mojo_user_profile.dart';
import '../services/chat_service.dart';
import '../widgets/chat_widgets.dart';
import '../../../data/models/chat_message.dart';
import '../../../data/models/chat_room.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

// ---------------------------------------------------------------------------
// ChatRoomScreen
// ---------------------------------------------------------------------------

class ChatRoomScreen extends ConsumerStatefulWidget {
  final String roomId;
  final String roomName;

  const ChatRoomScreen({
    super.key,
    required this.roomId,
    required this.roomName,
  });

  @override
  ConsumerState<ChatRoomScreen> createState() => _ChatRoomScreenState();
}

class _ChatRoomScreenState extends ConsumerState<ChatRoomScreen>
    with TickerProviderStateMixin {
  // -- Services & Auth ------------------------------------------------------
  ChatService get _chatService => ref.read(chatServiceProvider);
  final _imagePicker = ImagePicker();
  String get _currentUserId =>
      FirebaseAuth.instance.currentUser?.uid ?? 'guest';

  // -- Controllers ----------------------------------------------------------
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  late final AnimationController _fabAnimController;

  // -- State ----------------------------------------------------------------
  ChatMessage? _replyingTo;
  bool _isSearching = false;
  String _searchQuery = '';
  bool _showScrollToBottom = false;
  bool _isLoadingOlder = false;
  bool _hasMoreOlder = true;
  int _unreadCountWhileScrolled = 0;
  Timer? _typingTimer;
  List<String> _smartReplies = [];
  bool _loadingSmartReplies = false;
  List<ChatMessage> _searchResults = [];
  ChatRoom? _room;

  // Pinned messages
  List<ChatMessage> _pinnedMessages = [];

  // Messages & stream
  List<ChatMessage> _messages = [];
  StreamSubscription<List<ChatMessage>>? _messagesSub;
  StreamSubscription<Map<String, DateTime>>? _typingSub;
  Map<String, DateTime> _typingUsers = {};

  // Track highlight for scroll-to-message
  String? _highlightedMessageId;
  Timer? _highlightTimer;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  @override
  void initState() {
    super.initState();

    _fabAnimController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 250),
    );

    _scrollController.addListener(_onScroll);
    _chatService.markAsRead(widget.roomId);
    _loadRoom();

    // Listen to messages stream
    _messagesSub = _chatService
        .getMessages(widget.roomId, limit: 50)
        .listen(_onMessagesUpdate);

    // Listen to typing
    _typingSub =
        _chatService.getTypingUsers(widget.roomId).listen((typingMap) {
      if (mounted) setState(() => _typingUsers = typingMap);
    });

    // Load smart replies
    _loadSmartReplies();
  }

  @override
  void dispose() {
    _chatService.setTyping(widget.roomId, false);
    _typingTimer?.cancel();
    _highlightTimer?.cancel();
    _messagesSub?.cancel();
    _typingSub?.cancel();
    _scrollController.dispose();
    _searchController.dispose();
    _fabAnimController.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------------------
  // Stream handlers
  // ---------------------------------------------------------------------------

  Future<void> _loadRoom() async {
    final room = await _chatService.getRoom(widget.roomId);
    if (!mounted) return;
    setState(() => _room = room);
    if (room != null) {
      unawaited(_loadSmartReplies());
    }
  }

  void _onMessagesUpdate(List<ChatMessage> msgs) {
    if (!mounted) return;

    // Messages come newest-first from Firestore
    final wasAtBottom = _isAtBottom;

    setState(() {
      _messages = msgs;
      _pinnedMessages = msgs.where((m) => m.isPinned).toList();
    });

    if (wasAtBottom) {
      _chatService.markAsRead(widget.roomId);
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
    } else {
      // Count new messages while user is scrolled up
      setState(() => _unreadCountWhileScrolled++);
    }
  }

  bool get _isAtBottom {
    if (!_scrollController.hasClients) return true;
    return _scrollController.offset <=
        _scrollController.position.minScrollExtent + 80;
  }

  String get _displayRoomName => sanitizeUtf16(
        _room?.name ?? widget.roomName,
        fallback: 'Chat',
      );

  // ---------------------------------------------------------------------------
  // Scroll handling
  // ---------------------------------------------------------------------------

  void _onScroll() {
    final showFab = !_isAtBottom;
    if (showFab != _showScrollToBottom) {
      setState(() => _showScrollToBottom = showFab);
      if (showFab) {
        _fabAnimController.forward();
      } else {
        _fabAnimController.reverse();
        _unreadCountWhileScrolled = 0;
      }
    }

    // Pull-to-load-more at top (list is reversed so top = max extent)
    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 200 &&
        !_isLoadingOlder &&
        _hasMoreOlder &&
        _messages.isNotEmpty) {
      _loadOlderMessages();
    }
  }

  void _scrollToBottom({bool animated = true}) {
    if (!_scrollController.hasClients) return;
    if (animated) {
      _scrollController.animateTo(
        _scrollController.position.minScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    } else {
      _scrollController.jumpTo(_scrollController.position.minScrollExtent);
    }
    setState(() {
      _unreadCountWhileScrolled = 0;
      _showScrollToBottom = false;
    });
  }

  void _scrollToMessage(String messageId) {
    final idx = _messages.indexWhere((m) => m.id == messageId);
    if (idx == -1) return;

    // Rough estimate of position - the list is reversed
    // We just scroll to bottom then let the user see the highlight
    setState(() => _highlightedMessageId = messageId);
    _highlightTimer?.cancel();
    _highlightTimer = Timer(const Duration(seconds: 2), () {
      if (mounted) setState(() => _highlightedMessageId = null);
    });
  }

  // ---------------------------------------------------------------------------
  // Load older messages (pagination)
  // ---------------------------------------------------------------------------

  Future<void> _loadOlderMessages() async {
    if (_messages.isEmpty) return;
    setState(() => _isLoadingOlder = true);

    // The oldest message is the last in _messages (they are newest-first)
    // We need the Firestore DocumentSnapshot for startAfter. Since
    // getOlderMessages expects a DocumentSnapshot and we only have models,
    // we do a query to find that doc.
    try {
      final older = await _chatService.searchMessages(widget.roomId, '');
      // searchMessages returns last 200 â€” we already have some. If count
      // is less than 200, there's no more.
      if (older.length < 200) {
        setState(() => _hasMoreOlder = false);
      }
    } catch (_) {}

    setState(() => _isLoadingOlder = false);
  }

  // ---------------------------------------------------------------------------
  // Typing indicator
  // ---------------------------------------------------------------------------

  void _onTypingChanged(String text) {
    final isTyping = text.isNotEmpty;
    if (isTyping) {
      _chatService.setTyping(widget.roomId, true);
      _typingTimer?.cancel();
      _typingTimer = Timer(const Duration(seconds: 3), () {
        _chatService.setTyping(widget.roomId, false);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Smart replies
  // ---------------------------------------------------------------------------

  Future<void> _loadSmartReplies() async {
    if (_loadingSmartReplies) return;
    if (!_canUseSmartReplies) {
      if (mounted && _smartReplies.isNotEmpty) {
        setState(() => _smartReplies = []);
      }
      return;
    }
    setState(() => _loadingSmartReplies = true);
    try {
      final replies = await _chatService.getSmartReplies(widget.roomId);
      if (mounted) setState(() => _smartReplies = replies);
    } catch (_) {}
    if (mounted) setState(() => _loadingSmartReplies = false);
  }

  // ---------------------------------------------------------------------------
  // Send actions
  // ---------------------------------------------------------------------------

  Future<void> _sendText(String text) async {
    if (text.trim().isEmpty) return;
    if (!_canCompose) return;
    HapticFeedback.lightImpact();
    try {
      await _chatService.sendMessage(
        roomId: widget.roomId,
        text: text.trim(),
        replyToId: _replyingTo?.id,
        replyToText: _replyingTo?.text,
        replyToSenderName: _replyingTo?.senderName,
      );

      setState(() => _replyingTo = null);
      _chatService.setTyping(widget.roomId, false);
      _typingTimer?.cancel();
      _loadSmartReplies();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(userFacingFirestoreMessage(e))),
      );
    }
  }

  Future<void> _sendSmartReply(String reply) async {
    HapticFeedback.selectionClick();
    await _sendText(reply);
  }

  Future<void> _pickAndSendImage() async {
    if (!_canCompose) return;
    final picked = await _imagePicker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 80,
      maxWidth: 1920,
    );
    if (picked == null) return;

    try {
      await _chatService.sendImageMessage(
        widget.roomId,
        File(picked.path),
        replyToId: _replyingTo?.id,
        replyToText: _replyingTo?.text,
        replyToSenderName: _replyingTo?.senderName,
      );
      setState(() => _replyingTo = null);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(userFacingFirestoreMessage(e))),
      );
    }
  }

  Future<void> _takeAndSendPhoto() async {
    if (!_canCompose) return;
    final picked = await _imagePicker.pickImage(
      source: ImageSource.camera,
      imageQuality: 80,
      maxWidth: 1920,
    );
    if (picked == null) return;

    try {
      await _chatService.sendImageMessage(widget.roomId, File(picked.path));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(userFacingFirestoreMessage(e))),
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Message interactions
  // ---------------------------------------------------------------------------

  void _onReply(ChatMessage msg) {
    HapticFeedback.selectionClick();
    setState(() => _replyingTo = msg);
  }

  void _onCancelReply() => setState(() => _replyingTo = null);

  void _onReact(ChatMessage msg, String emoji) {
    HapticFeedback.mediumImpact();
    final uid = _currentUserId;
    final existing = msg.reactions[emoji] ?? [];
    if (existing.contains(uid)) {
      _chatService.removeReaction(widget.roomId, msg.id, emoji);
    } else {
      _chatService.addReaction(widget.roomId, msg.id, emoji);
    }
  }

  void _onCopyMessage(ChatMessage msg) {
    Clipboard.setData(ClipboardData(text: msg.text ?? ''));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Message copied'),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 1),
      ),
    );
  }

  Future<void> _onDeleteMessage(ChatMessage msg, {bool forEveryone = false}) async {
    await _chatService.deleteMessage(widget.roomId, msg.id,
        forEveryone: forEveryone);
  }

  Future<void> _onEditMessage(ChatMessage msg) async {
    final controller = TextEditingController(text: msg.text);
    final newText = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit message'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: null,
          decoration: InputDecoration(
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (newText != null && newText.trim().isNotEmpty && newText != msg.text) {
      await _chatService.editMessage(widget.roomId, msg.id, newText.trim());
    }
  }

  Future<void> _onPinMessage(ChatMessage msg) async {
    if (msg.isPinned) {
      await _chatService.unpinMessage(widget.roomId, msg.id);
    } else {
      await _chatService.pinMessage(widget.roomId, msg.id);
    }
  }

  Future<void> _onStarMessage(ChatMessage msg) async {
    await _chatService.starMessage(widget.roomId, msg.id);
  }

  Future<void> _onForwardMessage(ChatMessage msg) async {
    // TODO: show room picker, then forward
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Text('Forward coming soon'),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Context menu
  // ---------------------------------------------------------------------------

  void _showContextMenu(ChatMessage msg) {
    HapticFeedback.mediumImpact();
    final isMe = msg.senderId == _currentUserId;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => _ContextMenuSheet(
        message: msg,
        isMe: isMe,
        onReply: () {
          Navigator.pop(ctx);
          _onReply(msg);
        },
        onCopy: () {
          Navigator.pop(ctx);
          _onCopyMessage(msg);
        },
        onEdit: isMe
            ? () {
                Navigator.pop(ctx);
                _onEditMessage(msg);
              }
            : null,
        onPin: () {
          Navigator.pop(ctx);
          _onPinMessage(msg);
        },
        onStar: () {
          Navigator.pop(ctx);
          _onStarMessage(msg);
        },
        onForward: () {
          Navigator.pop(ctx);
          _onForwardMessage(msg);
        },
        onDelete: isMe
            ? () {
                Navigator.pop(ctx);
                _showDeleteOptions(msg);
              }
            : null,
        onReact: (emoji) {
          Navigator.pop(ctx);
          _onReact(msg, emoji);
        },
      ),
    );
  }

  void _showDeleteOptions(ChatMessage msg) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete message'),
        content: const Text('How would you like to delete this message?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              _onDeleteMessage(msg);
            },
            child: const Text('Delete for me'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.red,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              _onDeleteMessage(msg, forEveryone: true);
            },
            child: const Text('Delete for everyone'),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // AI Catch-Up
  // ---------------------------------------------------------------------------

  Future<void> _showAICatchUp() async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => Center(
        child: Card(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: MojoColors.purpleGradient,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.auto_awesome, color: Colors.white,
                      size: 28),
                )
                    .animate(onPlay: (c) => c.repeat(reverse: true))
                    .scale(begin: const Offset(1, 1), end: const Offset(1.1, 1.1),
                        duration: 800.ms),
                const SizedBox(height: 20),
                const Text(
                  'AI is reading the room...',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: MojoColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Summarizing recent conversations',
                  style: TextStyle(
                    fontSize: 13,
                    color: MojoColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    final summary = await _chatService.getAICatchUp(widget.roomId);

    if (!mounted) return;
    Navigator.pop(context); // dismiss loading

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _AICatchUpSheet(summary: summary),
    );
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  void _toggleSearch() {
    setState(() {
      _isSearching = !_isSearching;
      if (!_isSearching) {
        _searchQuery = '';
        _searchController.clear();
        _searchResults = [];
      }
    });
  }

  Future<void> _performSearch(String query) async {
    setState(() => _searchQuery = query);
    if (query.trim().isEmpty) {
      setState(() => _searchResults = []);
      return;
    }
    final results = await _chatService.searchMessages(widget.roomId, query);
    if (mounted) setState(() => _searchResults = results);
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    ref.watch(userProfileProvider(_currentUserId));

    final displayMessages = _isSearching && _searchQuery.isNotEmpty
        ? _searchResults
        : _messages;

    return Scaffold(
      backgroundColor: MojoColors.background,
      body: Column(
        children: [
          // Custom AppBar
          _buildAppBar(),

          // Pinned messages banner
          if (_pinnedMessages.isNotEmpty) _buildPinnedBanner(),

          // Messages list
          Expanded(
            child: Stack(
              children: [
                // Subtle background pattern
                Positioned.fill(
                  child: Container(
                    decoration: BoxDecoration(
                      color: MojoColors.background,
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          MojoColors.primaryPurple.withOpacity(0.03),
                          MojoColors.background,
                          MojoColors.primaryOrange.withOpacity(0.02),
                        ],
                      ),
                    ),
                  ),
                ),

                // Message list
                displayMessages.isEmpty
                    ? _buildEmptyState()
                    : _buildMessageList(displayMessages),

                // Scroll-to-bottom FAB
                if (_showScrollToBottom)
                  Positioned(
                    right: 16,
                    bottom: 8,
                    child: _buildScrollToBottomFab(),
                  ),
              ],
            ),
          ),

          // Smart replies
          if (_smartReplies.isNotEmpty && _replyingTo == null && !_isSearching)
            _buildSmartReplies(),

          // Reply preview
          if (_replyingTo != null) _buildReplyPreview(),

          // Input area
          _canCompose
              ? MessageInput(
                  onSendText: _sendText,
                  onAttachMedia: _pickAndSendImage,
                  onCamera: _takeAndSendPhoto,
                  onVoiceStart: () {},
                  onVoiceEnd: () {},
                  onGif: () {},
                  replyingTo: _replyingTo,
                  onCancelReply: _onCancelReply,
                  onTypingChanged: _onTypingChanged,
                )
              : _buildReadOnlyNotice(),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // AppBar
  // ---------------------------------------------------------------------------

  Widget _buildAppBar() {
    return Container(
      decoration: BoxDecoration(
        color: MojoColors.surface,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 60,
          child: _isSearching ? _buildSearchBar() : _buildNormalAppBar(),
        ),
      ),
    );
  }

  Widget _buildNormalAppBar() {
    final typingNames = _typingUsers.keys.toList();

    String subtitle;
    if (typingNames.isNotEmpty) {
      if (typingNames.length == 1) {
        subtitle = '${typingNames.first} is typing...';
      } else {
        subtitle = '${typingNames.length} people typing...';
      }
    } else {
      subtitle = 'Tap for room info';
    }

    return Row(
      children: [
        const SizedBox(width: 4),
        IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: () => context.pop(),
          color: MojoColors.textPrimary,
        ),

        // Room avatar
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            gradient: MojoColors.mainGradient,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Center(
            child: Text(
              _displayRoomName.isNotEmpty
                  ? _displayRoomName[0].toUpperCase()
                  : '#',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),

        // Name + subtitle
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _displayRoomName,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: MojoColors.textPrimary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 1),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Text(
                  subtitle,
                  key: ValueKey(subtitle),
                  style: TextStyle(
                    fontSize: 12,
                    color: typingNames.isNotEmpty
                        ? MojoColors.primaryPurple
                        : MojoColors.textSecondary,
                    fontWeight: typingNames.isNotEmpty
                        ? FontWeight.w600
                        : FontWeight.normal,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),

        // Action buttons
        IconButton(
          icon: const Icon(Icons.search, size: 22),
          onPressed: _toggleSearch,
          color: MojoColors.textSecondary,
        ),
        IconButton(
          icon: ShaderMask(
            shaderCallback: (bounds) =>
                MojoColors.purpleGradient.createShader(bounds),
            child: const Icon(Icons.auto_awesome, size: 22, color: Colors.white),
          ),
          onPressed: _showAICatchUp,
          tooltip: 'AI Catch-Up',
        ),
        PopupMenuButton<String>(
          icon: Icon(Icons.more_vert, size: 22, color: MojoColors.textSecondary),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          onSelected: _onMenuAction,
          itemBuilder: (_) => [
            const PopupMenuItem(value: 'info', child: Text('Room info')),
            const PopupMenuItem(value: 'search', child: Text('Search')),
            const PopupMenuItem(value: 'mute', child: Text('Mute')),
            const PopupMenuItem(value: 'pinned', child: Text('Pinned messages')),
            const PopupMenuItem(value: 'wallpaper', child: Text('Wallpaper')),
            const PopupMenuItem(value: 'clear', child: Text('Clear chat')),
          ],
        ),
      ],
    );
  }

  bool get _isOpenRoom {
    final type = _room?.type;
    return type == RoomType.community ||
        type == RoomType.broadcast ||
        type == RoomType.channel;
  }

  MojoUserProfile? get _currentUserProfile {
    if (_currentUserId == 'guest') return null;
    return ref.read(userProfileProvider(_currentUserId)).valueOrNull;
  }

  bool get _currentUserIsAdmin => _currentUserProfile?.role == 'admin';

  bool get _currentUserIsApproved => _currentUserProfile?.isApproved ?? false;

  bool get _canCompose {
    final room = _room;
    if (room == null) return false;
    if (_currentUserIsAdmin || room.isAdmin(_currentUserId)) return true;
    if (!_currentUserIsApproved) return false;
    if (room.memberIds.contains(_currentUserId)) return true;
    return _isOpenRoom && !room.isAdminOnly;
  }

  bool get _canUseSmartReplies {
    final room = _room;
    if (room == null) return false;
    if (_currentUserIsAdmin || room.isAdmin(_currentUserId)) return true;
    if (!_currentUserIsApproved) return false;
    if (room.memberIds.contains(_currentUserId)) return true;
    return _isOpenRoom && !room.isAdminOnly;
  }

  Widget _buildReadOnlyNotice() {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.of(context).padding.bottom + 12,
      ),
      color: Colors.white.withOpacity(0.95),
      child: Text(
        _room?.isAdminOnly == true
            ? 'This room is read-only. Only admins can post announcements.'
            : 'You can view this room, but posting is currently disabled.',
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontSize: 13,
          color: MojoColors.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  void _onMenuAction(String action) {
    switch (action) {
      case 'search':
        _toggleSearch();
        break;
      case 'mute':
        _chatService.muteRoom(widget.roomId);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Room muted'),
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
        break;
      default:
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$action coming soon'),
            behavior: SnackBarBehavior.floating,
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        );
    }
  }

  Widget _buildSearchBar() {
    return Row(
      children: [
        const SizedBox(width: 4),
        IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 20),
          onPressed: _toggleSearch,
          color: MojoColors.textPrimary,
        ),
        Expanded(
          child: TextField(
            controller: _searchController,
            autofocus: true,
            onChanged: _performSearch,
            style: const TextStyle(fontSize: 16),
            decoration: InputDecoration(
              hintText: 'Search messages...',
              hintStyle: TextStyle(color: MojoColors.textSecondary),
              border: InputBorder.none,
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 20),
                      onPressed: () {
                        _searchController.clear();
                        _performSearch('');
                      },
                    )
                  : null,
            ),
          ),
        ),
        if (_searchResults.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Text(
              '${_searchResults.length} found',
              style: TextStyle(
                fontSize: 12,
                color: MojoColors.textSecondary,
              ),
            ),
          ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Pinned messages banner
  // ---------------------------------------------------------------------------

  Widget _buildPinnedBanner() {
    final pinned = _pinnedMessages.first;
    return GestureDetector(
      onTap: () => _scrollToMessage(pinned.id),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: MojoColors.primaryPurple.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: MojoColors.primaryPurple.withOpacity(0.2),
          ),
        ),
        child: Row(
          children: [
            Icon(Icons.push_pin, size: 16, color: MojoColors.primaryPurple),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Pinned message',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: MojoColors.primaryPurple,
                    ),
                  ),
                  Text(
                    pinned.text ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      color: MojoColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            if (_pinnedMessages.length > 1)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: MojoColors.primaryPurple.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '+${_pinnedMessages.length - 1}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: MojoColors.primaryPurple,
                  ),
                ),
              ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 200.ms).slideY(begin: -0.3, end: 0);
  }

  // ---------------------------------------------------------------------------
  // Message list
  // ---------------------------------------------------------------------------

  Widget _buildMessageList(List<ChatMessage> messages) {
    return ListView.builder(
      controller: _scrollController,
      reverse: true,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      itemCount: messages.length + (_isLoadingOlder ? 1 : 0),
      itemBuilder: (context, index) {
        // Loading indicator at the very top
        if (_isLoadingOlder && index == messages.length) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(
              child: SizedBox(
                width: 24,
                height: 24,
                child: AppLoadingIndicator(strokeWidth: 2),
              ),
            ),
          );
        }

        final msg = messages[index];
        final isMe = msg.senderId == _currentUserId;

        // Date separator: check if next message (index+1, older) is a
        // different day.
        Widget? dateSeparator;
        if (index < messages.length - 1) {
          final nextMsg = messages[index + 1];
          if (!_isSameDay(msg.createdAt, nextMsg.createdAt)) {
            dateSeparator = ChatDateSeparator(date: nextMsg.createdAt);
          }
        } else {
          // Very first (oldest) message also gets a separator above
          dateSeparator = ChatDateSeparator(date: msg.createdAt);
        }

        // Consecutive message grouping
        final bool showAvatar;
        final bool showSenderName;
        final double topPadding;

        if (index > 0) {
          final newerMsg = messages[index - 1];
          final sameSender = newerMsg.senderId == msg.senderId;
          final closeInTime =
              newerMsg.createdAt.difference(msg.createdAt).inMinutes < 2;
          showAvatar = !sameSender || !closeInTime;
          showSenderName = !sameSender || !closeInTime;
          topPadding = sameSender && closeInTime ? 2 : 8;
        } else {
          showAvatar = true;
          showSenderName = !isMe;
          topPadding = 8;
        }

        final isHighlighted = msg.id == _highlightedMessageId;

        // System messages
        if (msg.type == MessageType.system) {
          return _buildSystemMessage(msg);
        }

        // Deleted messages
        if (msg.isDeletedForEveryone) {
          return _buildDeletedMessage(isMe);
        }

        Widget bubble = Padding(
          padding: EdgeInsets.only(top: topPadding),
          child: _SwipeToReply(
            isMe: isMe,
            onReply: () => _onReply(msg),
            child: ChatBubble(
              message: msg,
              isMe: isMe,
              showSenderName: showSenderName && !isMe,
              showAvatar: showAvatar && !isMe,
              onReply: () => _onReply(msg),
              onReact: () => _onReact(msg, 'â¤ï¸'),
              onLongPress: () => _showContextMenu(msg),
              onEmojiReaction: (emoji) => _onReact(msg, emoji),
            ),
          ),
        );

        // Highlight animation when scrolled to
        if (isHighlighted) {
          bubble = Container(
            decoration: BoxDecoration(
              color: MojoColors.primaryPurple.withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: bubble,
          )
              .animate()
              .shimmer(duration: 600.ms, color: MojoColors.primaryPurple.withOpacity(0.15))
              .then()
              .fadeOut(delay: 1500.ms, duration: 300.ms);
        }

        // Entrance animation for newest messages only
        if (index < 3) {
          bubble = bubble
              .animate()
              .fadeIn(duration: 200.ms, delay: (index * 50).ms)
              .slideY(begin: 0.1, end: 0, duration: 200.ms);
        }

        return Column(
          children: [
            if (dateSeparator != null) dateSeparator,
            bubble,
          ],
        );
      },
    );
  }

  Widget _buildSystemMessage(ChatMessage msg) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 40),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: MojoColors.textSecondary.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          msg.text ?? '',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: MojoColors.textSecondary,
            fontStyle: FontStyle.italic,
          ),
        ),
      ),
    );
  }

  Widget _buildDeletedMessage(bool isMe) {
    return Align(
      alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 2, horizontal: 12),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.grey.withOpacity(0.1),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.grey.withOpacity(0.15)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.block, size: 14, color: Colors.grey[500]),
            const SizedBox(width: 6),
            Text(
              'This message was deleted',
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey[500],
                fontStyle: FontStyle.italic,
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              gradient: MojoColors.mainGradient,
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Icon(Icons.chat_bubble_outline, color: Colors.white,
                size: 36),
          ),
          const SizedBox(height: 20),
          const Text(
            'Start the conversation!',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: MojoColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Be the first to say something amazing',
            style: TextStyle(fontSize: 14, color: MojoColors.textSecondary),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 400.ms)
        .scale(begin: const Offset(0.9, 0.9), end: const Offset(1, 1));
  }

  // ---------------------------------------------------------------------------
  // Scroll-to-bottom FAB
  // ---------------------------------------------------------------------------

  Widget _buildScrollToBottomFab() {
    return ScaleTransition(
      scale: CurvedAnimation(
        parent: _fabAnimController,
        curve: Curves.easeOutBack,
      ),
      child: GestureDetector(
        onTap: _scrollToBottom,
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: MojoColors.surface,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.12),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(Icons.keyboard_arrow_down,
                  color: MojoColors.textSecondary, size: 28),
              if (_unreadCountWhileScrolled > 0)
                Positioned(
                  top: 2,
                  right: 2,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      gradient: MojoColors.mainGradient,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _unreadCountWhileScrolled > 99
                          ? '99+'
                          : '$_unreadCountWhileScrolled',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Smart replies row
  // ---------------------------------------------------------------------------

  Widget _buildSmartReplies() {
    return Container(
      height: 44,
      padding: const EdgeInsets.only(bottom: 4),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemCount: _smartReplies.length,
        itemBuilder: (_, i) {
          final reply = _smartReplies[i];
          return GestureDetector(
            onTap: () => _sendSmartReply(reply),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: MojoColors.primaryPurple.withOpacity(0.08),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: MojoColors.primaryPurple.withOpacity(0.2),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.auto_awesome,
                      size: 14, color: MojoColors.primaryPurple),
                  const SizedBox(width: 6),
                  Text(
                    reply,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: MojoColors.primaryPurple,
                    ),
                  ),
                ],
              ),
            ),
          )
              .animate()
              .fadeIn(duration: 200.ms, delay: (i * 80).ms)
              .slideX(begin: 0.15, end: 0);
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Reply preview above input
  // ---------------------------------------------------------------------------

  Widget _buildReplyPreview() {
    final msg = _replyingTo!;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 8, 6),
      decoration: BoxDecoration(
        color: MojoColors.surface,
        border: Border(
          top: BorderSide(color: Colors.grey.withOpacity(0.15)),
          left: BorderSide(
            color: msg.senderId == _currentUserId
                ? MojoColors.primaryOrange
                : MojoColors.primaryPurple,
            width: 3,
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  msg.senderId == _currentUserId ? 'You' : msg.senderName,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: msg.senderId == _currentUserId
                        ? MojoColors.primaryOrange
                        : MojoColors.primaryPurple,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  msg.text ?? (msg.type == MessageType.image
                      ? 'Photo'
                      : 'Media'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    color: MojoColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 18),
            onPressed: _onCancelReply,
            color: MojoColors.textSecondary,
          ),
        ],
      ),
    ).animate().slideY(begin: 1, end: 0, duration: 200.ms, curve: Curves.easeOut);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

// =============================================================================
// Swipe-to-reply gesture wrapper
// =============================================================================

class _SwipeToReply extends StatefulWidget {
  final bool isMe;
  final VoidCallback onReply;
  final Widget child;

  const _SwipeToReply({
    required this.isMe,
    required this.onReply,
    required this.child,
  });

  @override
  State<_SwipeToReply> createState() => _SwipeToReplyState();
}

class _SwipeToReplyState extends State<_SwipeToReply>
    with SingleTickerProviderStateMixin {
  double _dragOffset = 0;
  bool _triggered = false;
  late final AnimationController _springController;
  late Animation<double> _springAnimation;

  static const _triggerThreshold = 64.0;

  @override
  void initState() {
    super.initState();
    _springController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _springAnimation =
        Tween<double>(begin: 0, end: 0).animate(CurvedAnimation(
      parent: _springController,
      curve: Curves.elasticOut,
    ));
    _springController.addListener(() {
      setState(() => _dragOffset = _springAnimation.value);
    });
  }

  @override
  void dispose() {
    _springController.dispose();
    super.dispose();
  }

  void _onHorizontalDragUpdate(DragUpdateDetails details) {
    // Only allow swipe right (positive dx)
    final newOffset = (_dragOffset + details.delta.dx).clamp(0.0, 100.0);
    setState(() => _dragOffset = newOffset);

    if (!_triggered && _dragOffset >= _triggerThreshold) {
      _triggered = true;
      HapticFeedback.mediumImpact();
    }
  }

  void _onHorizontalDragEnd(DragEndDetails details) {
    if (_triggered) {
      widget.onReply();
    }
    _triggered = false;
    _springAnimation =
        Tween<double>(begin: _dragOffset, end: 0).animate(CurvedAnimation(
      parent: _springController,
      curve: Curves.elasticOut,
    ));
    _springController
      ..reset()
      ..forward();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onHorizontalDragUpdate: _onHorizontalDragUpdate,
      onHorizontalDragEnd: _onHorizontalDragEnd,
      child: Stack(
        children: [
          // Reply icon behind the bubble
          if (_dragOffset > 8)
            Positioned(
              left: 8,
              top: 0,
              bottom: 0,
              child: Center(
                child: AnimatedOpacity(
                  opacity: (_dragOffset / _triggerThreshold).clamp(0.0, 1.0),
                  duration: const Duration(milliseconds: 50),
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: MojoColors.primaryPurple.withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.reply,
                      size: 20,
                      color: _triggered
                          ? MojoColors.primaryPurple
                          : MojoColors.textSecondary,
                    ),
                  ),
                ),
              ),
            ),
          Transform.translate(
            offset: Offset(_dragOffset, 0),
            child: widget.child,
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// Context menu bottom sheet
// =============================================================================

class _ContextMenuSheet extends StatelessWidget {
  final ChatMessage message;
  final bool isMe;
  final VoidCallback onReply;
  final VoidCallback onCopy;
  final VoidCallback? onEdit;
  final VoidCallback onPin;
  final VoidCallback onStar;
  final VoidCallback onForward;
  final VoidCallback? onDelete;
  final void Function(String emoji) onReact;

  const _ContextMenuSheet({
    required this.message,
    required this.isMe,
    required this.onReply,
    required this.onCopy,
    this.onEdit,
    required this.onPin,
    required this.onStar,
    required this.onForward,
    this.onDelete,
    required this.onReact,
  });

  static const _quickEmojis = ['ðŸ‘', 'â¤ï¸', 'ðŸ˜‚', 'ðŸ˜®', 'ðŸ˜¢', 'ðŸ™'];

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: MojoColors.surface,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Quick reaction row
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: _quickEmojis
                  .map(
                    (emoji) => GestureDetector(
                      onTap: () => onReact(emoji),
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: MojoColors.background,
                          shape: BoxShape.circle,
                        ),
                        child: Center(
                          child: Text(emoji, style: const TextStyle(fontSize: 22)),
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),

          const Divider(height: 1),

          // Action list
          _MenuTile(icon: Icons.reply, label: 'Reply', onTap: onReply),
          _MenuTile(icon: Icons.content_copy, label: 'Copy', onTap: onCopy),
          _MenuTile(
              icon: Icons.forward, label: 'Forward', onTap: onForward),
          _MenuTile(
            icon: message.isPinned ? Icons.push_pin : Icons.push_pin_outlined,
            label: message.isPinned ? 'Unpin' : 'Pin',
            onTap: onPin,
          ),
          _MenuTile(
            icon: message.isStarred ? Icons.star : Icons.star_border,
            label: message.isStarred ? 'Unstar' : 'Star',
            onTap: onStar,
          ),
          if (onEdit != null)
            _MenuTile(icon: Icons.edit, label: 'Edit', onTap: onEdit!),
          if (onDelete != null)
            _MenuTile(
              icon: Icons.delete_outline,
              label: 'Delete',
              onTap: onDelete!,
              isDestructive: true,
            ),

          SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 150.ms)
        .slideY(begin: 0.15, end: 0, duration: 200.ms, curve: Curves.easeOut);
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isDestructive;

  const _MenuTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isDestructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = isDestructive ? Colors.red : MojoColors.textPrimary;
    return ListTile(
      dense: true,
      leading: Icon(icon, size: 22, color: color),
      title: Text(label,
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w500, color: color)),
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    );
  }
}

// =============================================================================
// AI Catch-Up bottom sheet
// =============================================================================

class _AICatchUpSheet extends StatelessWidget {
  final String summary;

  const _AICatchUpSheet({required this.summary});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(12),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.65,
      ),
      decoration: BoxDecoration(
        color: MojoColors.surface,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    gradient: MojoColors.purpleGradient,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.auto_awesome,
                      color: Colors.white, size: 20),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'AI Catch-Up',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: MojoColors.textPrimary,
                        ),
                      ),
                      Text(
                        'Here\'s what you missed',
                        style: TextStyle(
                          fontSize: 13,
                          color: MojoColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.pop(context),
                  color: MojoColors.textSecondary,
                ),
              ],
            ),
          ),

          const Divider(height: 1),

          // Summary content
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Text(
                summary,
                style: const TextStyle(
                  fontSize: 15,
                  height: 1.6,
                  color: MojoColors.textPrimary,
                ),
              ),
            ),
          ),

          SizedBox(height: MediaQuery.of(context).padding.bottom + 12),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 200.ms)
        .slideY(begin: 0.1, end: 0, duration: 250.ms, curve: Curves.easeOut);
  }
}

