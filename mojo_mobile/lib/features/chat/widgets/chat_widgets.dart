import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/chat_message.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Color _hashColor(String name) {
  final hash = name.hashCode.abs();
  const palette = [
    Color(0xFFF25129),
    Color(0xFF8B5CF6),
    Color(0xFFEC4899),
    Color(0xFF10B981),
    Color(0xFF3B82F6),
    Color(0xFFF59E0B),
    Color(0xFFEF4444),
    Color(0xFF14B8A6),
  ];
  return palette[hash % palette.length];
}

String _formatDuration(int totalSeconds) {
  final m = totalSeconds ~/ 60;
  final s = totalSeconds % 60;
  return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
}

// =========================================================================
// 1. ChatBubble
// =========================================================================

class ChatBubble extends StatelessWidget {
  final ChatMessage message;
  final bool isMe;
  final bool showSenderName;
  final bool showAvatar;
  final VoidCallback? onReply;
  final VoidCallback? onReact;
  final VoidCallback? onLongPress;
  final Function(String emoji)? onEmojiReaction;

  const ChatBubble({
    super.key,
    required this.message,
    required this.isMe,
    this.showSenderName = false,
    this.showAvatar = false,
    this.onReply,
    this.onReact,
    this.onLongPress,
    this.onEmojiReaction,
  });

  @override
  Widget build(BuildContext context) {
    // Deleted placeholder
    if (message.isDeletedForEveryone) {
      return _DeletedBubble(isMe: isMe);
    }

    double dragOffset = 0;

    return StatefulBuilder(
      builder: (context, setState) {
        return GestureDetector(
          onHorizontalDragUpdate: (d) {
            if (d.delta.dx > 0) {
              setState(() => dragOffset = (dragOffset + d.delta.dx).clamp(0, 80));
            }
          },
          onHorizontalDragEnd: (_) {
            if (dragOffset > 50) onReply?.call();
            setState(() => dragOffset = 0);
          },
          onLongPress: onLongPress,
          child: Transform.translate(
            offset: Offset(dragOffset, 0),
            child: Padding(
              padding: EdgeInsets.only(
                left: isMe ? 64 : 8,
                right: isMe ? 8 : 64,
                top: 2,
                bottom: 2,
              ),
              child: Row(
                mainAxisAlignment:
                    isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (!isMe && showAvatar) _buildAvatar(),
                  if (!isMe && !showAvatar) const SizedBox(width: 36),
                  Flexible(child: _buildBubbleColumn(context)),
                ],
              ),
            ),
          ),
        );
      },
    )
        .animate()
        .fadeIn(duration: 200.ms)
        .slideX(begin: isMe ? 0.05 : -0.05, end: 0, duration: 200.ms);
  }

  Widget _buildAvatar() {
    return Padding(
      padding: const EdgeInsets.only(right: 6, bottom: 2),
      child: CircleAvatar(
        radius: 16,
        backgroundColor: _hashColor(message.senderName),
        backgroundImage: message.senderAvatarUrl != null
            ? CachedNetworkImageProvider(message.senderAvatarUrl!)
            : null,
        child: message.senderAvatarUrl == null
            ? Text(
                message.senderName.isNotEmpty
                    ? message.senderName[0].toUpperCase()
                    : '?',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600),
              )
            : null,
      ),
    );
  }

  Widget _buildBubbleColumn(BuildContext context) {
    return Column(
      crossAxisAlignment:
          isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        // Forwarded label
        if (message.isForwarded)
          Padding(
            padding: const EdgeInsets.only(bottom: 2, left: 4, right: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.forward, size: 12, color: MojoColors.textSecondary),
                const SizedBox(width: 2),
                Text(
                  'Forwarded',
                  style: TextStyle(
                    fontSize: 11,
                    fontStyle: FontStyle.italic,
                    color: MojoColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),

        // Main bubble
        Container(
          constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.75,
          ),
          decoration: BoxDecoration(
            gradient: isMe ? MojoColors.mainGradient : null,
            color: isMe ? null : const Color(0xFFF3F4F6),
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(20),
              topRight: const Radius.circular(20),
              bottomLeft: Radius.circular(isMe ? 20 : 4),
              bottomRight: Radius.circular(isMe ? 4 : 20),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.06),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(20),
              topRight: const Radius.circular(20),
              bottomLeft: Radius.circular(isMe ? 20 : 4),
              bottomRight: Radius.circular(isMe ? 4 : 20),
            ),
            child: _buildBubbleContent(context),
          ),
        ),

        // Reactions row
        if (message.reactions.isNotEmpty) _buildReactions(),

        // Pin indicator
        if (message.isPinned)
          Padding(
            padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.push_pin,
                    size: 10, color: MojoColors.textSecondary),
                const SizedBox(width: 2),
                Text('Pinned',
                    style: TextStyle(
                        fontSize: 10, color: MojoColors.textSecondary)),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildBubbleContent(BuildContext context) {
    final textColor = isMe ? Colors.white : MojoColors.textPrimary;
    final subColor = isMe ? Colors.white70 : MojoColors.textSecondary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Sender name for group
        if (showSenderName && !isMe)
          Padding(
            padding: const EdgeInsets.only(left: 12, right: 12, top: 8),
            child: Text(
              message.senderName,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: _hashColor(message.senderName),
              ),
            ),
          ),

        // Reply preview
        if (message.replyToId != null && message.replyToText != null)
          Container(
            margin: const EdgeInsets.only(left: 8, right: 8, top: 8),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: isMe ? Colors.white.withOpacity(0.15) : Colors.black.withOpacity(0.05),
              borderRadius: BorderRadius.circular(12),
              border: Border(
                left: BorderSide(
                  color: isMe ? Colors.white : MojoColors.primaryPurple,
                  width: 3,
                ),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (message.replyToSenderName != null)
                  Text(
                    message.replyToSenderName!,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: isMe ? Colors.white : MojoColors.primaryPurple,
                    ),
                  ),
                Text(
                  message.replyToText!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: subColor),
                ),
              ],
            ),
          ),

        // Content by type
        _buildTypeContent(context, textColor, subColor),

        // Metadata row: edited, time, read receipt, star
        Padding(
          padding: const EdgeInsets.only(left: 12, right: 8, bottom: 6, top: 2),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (message.isStarred)
                Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: Icon(Icons.star, size: 11, color: subColor),
                ),
              if (message.isEdited)
                Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: Text('edited',
                      style: TextStyle(
                          fontSize: 10,
                          fontStyle: FontStyle.italic,
                          color: subColor)),
                ),
              Text(
                DateFormat.Hm().format(message.createdAt),
                style: TextStyle(fontSize: 10, color: subColor),
              ),
              if (isMe) ...[
                const SizedBox(width: 3),
                _buildStatusIcon(subColor),
              ],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTypeContent(
      BuildContext context, Color textColor, Color subColor) {
    switch (message.type) {
      case MessageType.image:
        return _ImageContent(message: message, isMe: isMe, textColor: textColor);
      case MessageType.video:
        return _VideoContent(message: message, isMe: isMe, textColor: textColor);
      case MessageType.voice:
        return Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
          child: VoiceMessageBubble(
            audioUrl: message.mediaUrl ?? '',
            durationMs: (message.mediaDuration ?? 0) * 1000,
            isMe: isMe,
          ),
        );
      case MessageType.gif:
        return _GifContent(message: message);
      default:
        // text / system / others
        if (message.text != null && message.text!.isNotEmpty)
          return Padding(
            padding: const EdgeInsets.only(
                left: 12, right: 12, top: 8),
            child: Text(
              message.text!,
              style: TextStyle(
                  fontSize: 15, color: textColor, height: 1.35),
            ),
          );
        return const SizedBox.shrink();
    }
  }

  Widget _buildStatusIcon(Color color) {
    switch (message.status) {
      case MessageStatus.sending:
        return Icon(Icons.access_time, size: 13, color: color);
      case MessageStatus.sent:
        return Icon(Icons.check, size: 13, color: color);
      case MessageStatus.delivered:
        return Icon(Icons.done_all, size: 13, color: color);
      case MessageStatus.read:
        return const Icon(Icons.done_all, size: 13, color: Color(0xFF34B7F1));
      case MessageStatus.failed:
        return Icon(Icons.error_outline, size: 13, color: Colors.red.shade300);
    }
  }

  Widget _buildReactions() {
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Wrap(
        spacing: 4,
        children: message.reactions.entries.map((e) {
          return GestureDetector(
            onTap: () => onEmojiReaction?.call(e.key),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE5E7EB)),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black.withOpacity(0.04), blurRadius: 4)
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(e.key, style: const TextStyle(fontSize: 14)),
                  if (e.value.length > 1) ...[
                    const SizedBox(width: 2),
                    Text('${e.value.length}',
                        style: TextStyle(
                            fontSize: 11, color: MojoColors.textSecondary)),
                  ],
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// Deleted bubble placeholder
class _DeletedBubble extends StatelessWidget {
  final bool isMe;
  const _DeletedBubble({required this.isMe});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          left: isMe ? 64 : 48, right: isMe ? 8 : 64, top: 2, bottom: 2),
      child: Align(
        alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFFF3F4F6),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFE5E7EB)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.block, size: 14, color: MojoColors.textSecondary),
              const SizedBox(width: 6),
              Text(
                'This message was deleted',
                style: TextStyle(
                  fontSize: 13,
                  fontStyle: FontStyle.italic,
                  color: MojoColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// Image content inside bubble
class _ImageContent extends StatelessWidget {
  final ChatMessage message;
  final bool isMe;
  final Color textColor;
  const _ImageContent(
      {required this.message, required this.isMe, required this.textColor});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Hero(
              tag: 'media_${message.id}',
              child: CachedNetworkImage(
                imageUrl: message.mediaUrl ?? '',
                width: double.infinity,
                height: 200,
                fit: BoxFit.cover,
                placeholder: (_, __) => Container(
                  height: 200,
                  color: Colors.grey.shade200,
                  child:
                      const Center(child: AppLoadingIndicator(strokeWidth: 2)),
                ),
                errorWidget: (_, __, ___) => Container(
                  height: 200,
                  color: Colors.grey.shade200,
                  child: const Icon(Icons.broken_image, size: 40),
                ),
              ),
            ),
          ),
        ),
        if (message.text != null && message.text!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 12, right: 12, top: 6),
            child: Text(message.text!,
                style:
                    TextStyle(fontSize: 14, color: textColor, height: 1.3)),
          ),
      ],
    );
  }
}

// Video content inside bubble
class _VideoContent extends StatelessWidget {
  final ChatMessage message;
  final bool isMe;
  final Color textColor;
  const _VideoContent(
      {required this.message, required this.isMe, required this.textColor});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Stack(
              alignment: Alignment.center,
              children: [
                CachedNetworkImage(
                  imageUrl: message.mediaThumbnailUrl ?? '',
                  width: double.infinity,
                  height: 200,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => Container(
                    height: 200,
                    color: Colors.grey.shade300,
                  ),
                  errorWidget: (_, __, ___) => Container(
                    height: 200,
                    color: Colors.grey.shade300,
                    child: const Icon(Icons.videocam, size: 40),
                  ),
                ),
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.black.withOpacity(0.5),
                  ),
                  child: const Icon(Icons.play_arrow,
                      color: Colors.white, size: 32),
                ),
                if (message.mediaDuration != null)
                  Positioned(
                    bottom: 8,
                    right: 8,
                    child: Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        _formatDuration(message.mediaDuration!),
                        style: const TextStyle(
                            color: Colors.white, fontSize: 11),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (message.text != null && message.text!.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 12, right: 12, top: 6),
            child: Text(message.text!,
                style:
                    TextStyle(fontSize: 14, color: textColor, height: 1.3)),
          ),
      ],
    );
  }
}

// GIF content
class _GifContent extends StatelessWidget {
  final ChatMessage message;
  const _GifContent({required this.message});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: CachedNetworkImage(
          imageUrl: message.mediaUrl ?? '',
          width: double.infinity,
          fit: BoxFit.cover,
          placeholder: (_, __) => Container(
            height: 150,
            color: Colors.grey.shade200,
          ),
          errorWidget: (_, __, ___) => Container(
            height: 150,
            color: Colors.grey.shade200,
            child: const Icon(Icons.gif, size: 40),
          ),
        ),
      ),
    );
  }
}

// =========================================================================
// 2. MessageInput
// =========================================================================

class MessageInput extends StatefulWidget {
  final Function(String text) onSendText;
  final VoidCallback onAttachMedia;
  final VoidCallback onCamera;
  final VoidCallback onVoiceStart;
  final VoidCallback onVoiceEnd;
  final VoidCallback? onGif;
  final ChatMessage? replyingTo;
  final VoidCallback? onCancelReply;
  final Function(String)? onTypingChanged;

  const MessageInput({
    super.key,
    required this.onSendText,
    required this.onAttachMedia,
    required this.onCamera,
    required this.onVoiceStart,
    required this.onVoiceEnd,
    this.onGif,
    this.replyingTo,
    this.onCancelReply,
    this.onTypingChanged,
  });

  @override
  State<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends State<MessageInput>
    with SingleTickerProviderStateMixin {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  bool _hasText = false;
  bool _isRecording = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() {
      final has = _controller.text.trim().isNotEmpty;
      if (has != _hasText) setState(() => _hasText = has);
      widget.onTypingChanged?.call(_controller.text);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.lightImpact();
    widget.onSendText(text);
    _controller.clear();
  }

  void _showAttachmentSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => _AttachmentSheet(
        onCamera: () {
          Navigator.pop(context);
          widget.onCamera();
        },
        onGallery: () {
          Navigator.pop(context);
          widget.onAttachMedia();
        },
        onDocument: () => Navigator.pop(context),
        onLocation: () => Navigator.pop(context),
        onContact: () => Navigator.pop(context),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Reply preview bar
        if (widget.replyingTo != null) _buildReplyBar(),

        // Input bar
        Container(
          padding: EdgeInsets.only(
            left: 8,
            right: 8,
            top: 8,
            bottom: MediaQuery.of(context).padding.bottom + 8,
          ),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.92),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 10,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // Attachment
              IconButton(
                onPressed: _showAttachmentSheet,
                icon: const Icon(Icons.add_circle_outline, size: 26),
                color: MojoColors.textSecondary,
                visualDensity: VisualDensity.compact,
              ),

              // Text field
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3F4F6),
                    borderRadius: BorderRadius.circular(24),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      // Emoji button
                      IconButton(
                        onPressed: () {},
                        icon: const Icon(Icons.emoji_emotions_outlined,
                            size: 22),
                        color: MojoColors.textSecondary,
                        visualDensity: VisualDensity.compact,
                      ),
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          focusNode: _focusNode,
                          maxLines: 6,
                          minLines: 1,
                          textCapitalization: TextCapitalization.sentences,
                          style: const TextStyle(fontSize: 15),
                          decoration: const InputDecoration(
                            hintText: 'Message',
                            hintStyle: TextStyle(color: Color(0xFF9CA3AF)),
                            border: InputBorder.none,
                            contentPadding:
                                EdgeInsets.symmetric(vertical: 10),
                          ),
                        ),
                      ),
                      // GIF button
                      if (widget.onGif != null)
                        IconButton(
                          onPressed: widget.onGif,
                          icon: const Icon(Icons.gif_box_outlined, size: 22),
                          color: MojoColors.textSecondary,
                          visualDensity: VisualDensity.compact,
                        ),
                      // Camera
                      IconButton(
                        onPressed: widget.onCamera,
                        icon:
                            const Icon(Icons.camera_alt_outlined, size: 22),
                        color: MojoColors.textSecondary,
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),

              // Send / Voice button
              _hasText
                  ? GestureDetector(
                      onTap: _send,
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: MojoColors.mainGradient,
                        ),
                        child: const Icon(Icons.send_rounded,
                            color: Colors.white, size: 22),
                      ),
                    )
                      .animate(target: _hasText ? 1 : 0)
                      .scale(
                          begin: const Offset(0.6, 0.6),
                          end: const Offset(1, 1),
                          duration: 200.ms)
                  : GestureDetector(
                      onLongPressStart: (_) {
                        HapticFeedback.mediumImpact();
                        setState(() => _isRecording = true);
                        widget.onVoiceStart();
                      },
                      onLongPressEnd: (_) {
                        setState(() => _isRecording = false);
                        widget.onVoiceEnd();
                      },
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _isRecording
                              ? MojoColors.primaryOrange
                              : const Color(0xFFF3F4F6),
                        ),
                        child: Icon(
                          Icons.mic,
                          color: _isRecording
                              ? Colors.white
                              : MojoColors.textSecondary,
                          size: 22,
                        ),
                      ),
                    ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildReplyBar() {
    final msg = widget.replyingTo!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          top: BorderSide(color: Colors.grey.shade200),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 3,
            height: 36,
            decoration: BoxDecoration(
              color: MojoColors.primaryPurple,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  msg.senderName,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: MojoColors.primaryPurple,
                  ),
                ),
                Text(
                  msg.text ?? '',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 13, color: MojoColors.textSecondary),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: widget.onCancelReply,
            icon: const Icon(Icons.close, size: 18),
            color: MojoColors.textSecondary,
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

class _AttachmentSheet extends StatelessWidget {
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final VoidCallback onDocument;
  final VoidCallback onLocation;
  final VoidCallback onContact;

  const _AttachmentSheet({
    required this.onCamera,
    required this.onGallery,
    required this.onDocument,
    required this.onLocation,
    required this.onContact,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _AttachItem(
                  icon: Icons.camera_alt,
                  label: 'Camera',
                  color: MojoColors.primaryOrange,
                  onTap: onCamera),
              _AttachItem(
                  icon: Icons.photo_library,
                  label: 'Gallery',
                  color: MojoColors.primaryPurple,
                  onTap: onGallery),
              _AttachItem(
                  icon: Icons.insert_drive_file,
                  label: 'Document',
                  color: const Color(0xFF3B82F6),
                  onTap: onDocument),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _AttachItem(
                  icon: Icons.location_on,
                  label: 'Location',
                  color: const Color(0xFF10B981),
                  onTap: onLocation),
              _AttachItem(
                  icon: Icons.person,
                  label: 'Contact',
                  color: MojoColors.primaryPink,
                  onTap: onContact),
              const SizedBox(width: 64), // spacer
            ],
          ),
        ],
      ),
    );
  }
}

class _AttachItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _AttachItem(
      {required this.icon,
      required this.label,
      required this.color,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withOpacity(0.12),
            ),
            child: Icon(icon, color: color, size: 26),
          ),
          const SizedBox(height: 6),
          Text(label,
              style: const TextStyle(
                  fontSize: 12, color: MojoColors.textSecondary)),
        ],
      ),
    );
  }
}

// =========================================================================
// 3. TypingIndicator
// =========================================================================

class TypingIndicator extends StatefulWidget {
  final List<String> typingUserNames;
  const TypingIndicator({super.key, required this.typingUserNames});

  @override
  State<TypingIndicator> createState() => _TypingIndicatorState();
}

class _TypingIndicatorState extends State<TypingIndicator>
    with TickerProviderStateMixin {
  late final List<AnimationController> _dotControllers;

  @override
  void initState() {
    super.initState();
    _dotControllers = List.generate(3, (i) {
      final ctrl = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 600),
      );
      Future.delayed(Duration(milliseconds: i * 180), () {
        if (mounted) ctrl.repeat(reverse: true);
      });
      return ctrl;
    });
  }

  @override
  void dispose() {
    for (final c in _dotControllers) {
      c.dispose();
    }
    super.dispose();
  }

  String get _text {
    final names = widget.typingUserNames;
    if (names.isEmpty) return '';
    if (names.length == 1) return '${names[0]} is typing';
    if (names.length == 2) return '${names[0]} and ${names[1]} are typing';
    return '${names[0]}, ${names[1]} and others are typing';
  }

  @override
  Widget build(BuildContext context) {
    if (widget.typingUserNames.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Row(
        children: [
          // Bouncing dots
          ...List.generate(3, (i) {
            return AnimatedBuilder(
              listenable: _dotControllers[i],
              builder: (_, __) => Container(
                margin: const EdgeInsets.symmetric(horizontal: 1.5),
                child: Transform.translate(
                  offset: Offset(0, -4 * _dotControllers[i].value),
                  child: Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: MojoColors.textSecondary
                          .withOpacity(0.4 + 0.6 * _dotControllers[i].value),
                    ),
                  ),
                ),
              ),
            );
          }),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              _text,
              style: TextStyle(
                fontSize: 12,
                color: MojoColors.textSecondary,
                fontStyle: FontStyle.italic,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 200.ms).slideY(begin: 0.3, end: 0);
  }
}

// Replacement for AnimatedBuilder which doesn't exist - use AnimatedBuilder pattern
class AnimatedBuilder extends AnimatedWidget {
  final Widget Function(BuildContext, Widget?) builder;
  const AnimatedBuilder(
      {super.key, required super.listenable, required this.builder})
      : super();

  Animation<double> get animation => listenable as Animation<double>;

  @override
  Widget build(BuildContext context) => builder(context, null);
}

// =========================================================================
// 4. ChatDateSeparator
// =========================================================================

class ChatDateSeparator extends StatelessWidget {
  final DateTime date;
  const ChatDateSeparator({super.key, required this.date});

  String get _label {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final d = DateTime(date.year, date.month, date.day);

    if (d == today) return 'Today';
    if (d == today.subtract(const Duration(days: 1))) return 'Yesterday';
    if (now.difference(d).inDays < 7) return DateFormat.EEEE().format(date);
    return DateFormat.yMMMd().format(date);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 40),
      child: Row(
        children: [
          Expanded(child: Divider(color: Colors.grey.shade300, thickness: 0.5)),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
            decoration: BoxDecoration(
              color: const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              _label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: MojoColors.textSecondary,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(child: Divider(color: Colors.grey.shade300, thickness: 0.5)),
        ],
      ),
    );
  }
}

// =========================================================================
// 5. ReactionPicker
// =========================================================================

class ReactionPicker extends StatelessWidget {
  final Function(String emoji) onReaction;
  const ReactionPicker({super.key, required this.onReaction});

  static const _quickEmojis = ['â¤ï¸', 'ðŸ˜‚', 'ðŸ˜®', 'ðŸ˜¢', 'ðŸ˜¡', 'ðŸ‘'];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.95),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.12),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ..._quickEmojis.map((e) {
            return GestureDetector(
              onTap: () => onReaction(e),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                child: Text(e, style: const TextStyle(fontSize: 26)),
              ),
            );
          }),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: () {
              // Expand to full emoji grid - handled by parent
              onReaction('+');
            },
            child: Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFFF3F4F6),
              ),
              child: const Icon(Icons.add, size: 18, color: Color(0xFF6B7280)),
            ),
          ),
        ],
      ),
    )
        .animate()
        .scale(
            begin: const Offset(0.7, 0.7),
            end: const Offset(1, 1),
            duration: 200.ms,
            curve: Curves.easeOutBack)
        .fadeIn(duration: 150.ms);
  }
}

// =========================================================================
// 6. MessageContextMenu
// =========================================================================

class MessageContextMenu extends StatelessWidget {
  final ChatMessage message;
  final bool isMe;
  final VoidCallback onReply;
  final VoidCallback onForward;
  final VoidCallback onCopy;
  final VoidCallback onPin;
  final VoidCallback onStar;
  final VoidCallback onDelete;
  final VoidCallback onEdit;
  final Function(String) onReact;

  const MessageContextMenu({
    super.key,
    required this.message,
    required this.isMe,
    required this.onReply,
    required this.onForward,
    required this.onCopy,
    required this.onPin,
    required this.onStar,
    required this.onDelete,
    required this.onEdit,
    required this.onReact,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.97),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.15),
            blurRadius: 24,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Reaction picker row
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
            child: ReactionPicker(onReaction: onReact),
          ),
          const Divider(height: 1),
          // Menu items
          _MenuItem(icon: Icons.reply, label: 'Reply', onTap: onReply),
          _MenuItem(icon: Icons.forward, label: 'Forward', onTap: onForward),
          if (message.type == MessageType.text)
            _MenuItem(icon: Icons.copy, label: 'Copy', onTap: onCopy),
          _MenuItem(
            icon: message.isPinned ? Icons.push_pin : Icons.push_pin_outlined,
            label: message.isPinned ? 'Unpin' : 'Pin',
            onTap: onPin,
          ),
          _MenuItem(
            icon: message.isStarred ? Icons.star : Icons.star_border,
            label: message.isStarred ? 'Unstar' : 'Star',
            onTap: onStar,
          ),
          if (isMe)
            _MenuItem(icon: Icons.edit, label: 'Edit', onTap: onEdit),
          _MenuItem(
            icon: Icons.delete_outline,
            label: 'Delete',
            onTap: onDelete,
            isDestructive: true,
          ),
        ],
      ),
    )
        .animate()
        .scale(
            begin: const Offset(0.85, 0.85),
            end: const Offset(1, 1),
            duration: 200.ms,
            curve: Curves.easeOutBack)
        .fadeIn(duration: 150.ms);
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isDestructive;
  const _MenuItem(
      {required this.icon,
      required this.label,
      required this.onTap,
      this.isDestructive = false});

  @override
  Widget build(BuildContext context) {
    final color = isDestructive ? Colors.red : MojoColors.textPrimary;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
        child: Row(
          children: [
            Icon(icon, size: 20, color: color),
            const SizedBox(width: 14),
            Text(label,
                style: TextStyle(
                    fontSize: 15, color: color, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
    );
  }
}

// =========================================================================
// 7. VoiceMessageBubble
// =========================================================================

class VoiceMessageBubble extends StatefulWidget {
  final String audioUrl;
  final int durationMs;
  final bool isMe;

  const VoiceMessageBubble({
    super.key,
    required this.audioUrl,
    required this.durationMs,
    required this.isMe,
  });

  @override
  State<VoiceMessageBubble> createState() => _VoiceMessageBubbleState();
}

class _VoiceMessageBubbleState extends State<VoiceMessageBubble>
    with SingleTickerProviderStateMixin {
  bool _isPlaying = false;
  double _progress = 0;
  late final List<double> _bars;

  @override
  void initState() {
    super.initState();
    final rng = Random(widget.audioUrl.hashCode);
    _bars = List.generate(28, (_) => 0.15 + rng.nextDouble() * 0.85);
  }

  int get _remainingMs =>
      ((1 - _progress) * widget.durationMs).round();

  @override
  Widget build(BuildContext context) {
    final fg = widget.isMe ? Colors.white : MojoColors.primaryOrange;
    final bgBar =
        widget.isMe ? Colors.white.withOpacity(0.3) : Colors.grey.shade300;

    return SizedBox(
      width: 220,
      child: Row(
        children: [
          // Play/pause
          GestureDetector(
            onTap: () => setState(() => _isPlaying = !_isPlaying),
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: fg.withOpacity(0.15),
              ),
              child: Icon(
                _isPlaying ? Icons.pause : Icons.play_arrow,
                color: fg,
                size: 22,
              ),
            ),
          ),
          const SizedBox(width: 8),
          // Waveform + slider
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  height: 28,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: _bars.asMap().entries.map((e) {
                      final filled =
                          e.key / _bars.length <= _progress;
                      return Expanded(
                        child: Container(
                          margin: const EdgeInsets.symmetric(horizontal: 0.5),
                          height: 28 * e.value,
                          decoration: BoxDecoration(
                            color: filled ? fg : bgBar,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 2),
                // Slider
                SizedBox(
                  height: 14,
                  child: SliderTheme(
                    data: SliderThemeData(
                      trackHeight: 2,
                      thumbShape:
                          const RoundSliderThumbShape(enabledThumbRadius: 5),
                      activeTrackColor: fg,
                      inactiveTrackColor: bgBar,
                      thumbColor: fg,
                      overlayShape: SliderComponentShape.noOverlay,
                    ),
                    child: Slider(
                      value: _progress,
                      onChanged: (v) => setState(() => _progress = v),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Text(
            _formatDuration((_remainingMs / 1000).round()),
            style: TextStyle(
              fontSize: 11,
              color: widget.isMe ? Colors.white70 : MojoColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

// =========================================================================
// 8. MediaMessageBubble
// =========================================================================

class MediaMessageBubble extends StatelessWidget {
  final ChatMessage message;
  final bool isMe;
  final VoidCallback onTap;

  const MediaMessageBubble({
    super.key,
    required this.message,
    required this.isMe,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isVideo = message.type == MessageType.video;

    return GestureDetector(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Hero(
              tag: 'media_${message.id}',
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CachedNetworkImage(
                    imageUrl: isVideo
                        ? (message.mediaThumbnailUrl ?? '')
                        : (message.mediaUrl ?? ''),
                    width: double.infinity,
                    height: 220,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(
                      height: 220,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Center(
                        child: SizedBox(
                          width: 28,
                          height: 28,
                          child: AppLoadingIndicator(
                            strokeWidth: 2,
                            color: MojoColors.primaryOrange,
                          ),
                        ),
                      ),
                    ),
                    errorWidget: (_, __, ___) => Container(
                      height: 220,
                      color: Colors.grey.shade200,
                      child: const Icon(Icons.broken_image,
                          size: 40, color: Colors.grey),
                    ),
                  ),
                  if (isVideo)
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.black.withOpacity(0.5),
                      ),
                      child: const Icon(Icons.play_arrow,
                          color: Colors.white, size: 34),
                    ),
                  if (isVideo && message.mediaDuration != null)
                    Positioned(
                      bottom: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          _formatDuration(message.mediaDuration!),
                          style: const TextStyle(
                              color: Colors.white, fontSize: 11),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (message.text != null && message.text!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 4, right: 4),
              child: Text(
                message.text!,
                style: TextStyle(
                  fontSize: 14,
                  color: isMe ? Colors.white : MojoColors.textPrimary,
                  height: 1.3,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// =========================================================================
// 9. UnreadBadge
// =========================================================================

class UnreadBadge extends StatelessWidget {
  final int count;
  const UnreadBadge({super.key, required this.count});

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();

    final label = count > 99 ? '99+' : '$count';

    return Container(
      constraints: const BoxConstraints(minWidth: 22, minHeight: 22),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: const BoxDecoration(
        shape: BoxShape.rectangle,
        gradient: MojoColors.mainGradient,
        borderRadius: BorderRadius.all(Radius.circular(11)),
      ),
      alignment: Alignment.center,
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    )
        .animate()
        .scale(
            begin: const Offset(0, 0),
            end: const Offset(1, 1),
            duration: 300.ms,
            curve: Curves.elasticOut);
  }
}

// =========================================================================
// 10. OnlineIndicator
// =========================================================================

class OnlineIndicator extends StatelessWidget {
  final bool isOnline;
  final double size;

  const OnlineIndicator({
    super.key,
    required this.isOnline,
    this.size = 10,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: isOnline ? const Color(0xFF22C55E) : const Color(0xFF9CA3AF),
        border: Border.all(color: Colors.white, width: 1.5),
        boxShadow: isOnline
            ? [
                BoxShadow(
                  color: const Color(0xFF22C55E).withOpacity(0.4),
                  blurRadius: 6,
                  spreadRadius: 1,
                ),
              ]
            : [],
      ),
    );
  }
}

