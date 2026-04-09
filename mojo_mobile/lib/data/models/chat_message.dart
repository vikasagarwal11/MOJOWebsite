import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/text/safe_text.dart';

enum MessageType {
  text,
  image,
  video,
  voice,
  gif,
  sticker,
  document,
  location,
  contact,
  system,
  reply,
}

enum MessageStatus {
  sending,
  sent,
  delivered,
  read,
  failed,
}

class ChatMessage {
  final String id;
  final String chatRoomId;
  final String senderId;
  final String senderName;
  final String? senderAvatarUrl;
  final MessageType type;
  final MessageStatus status;
  final String? text;
  final DateTime createdAt;
  final DateTime? updatedAt;

  // Read receipts
  final DateTime? sentAt;
  final DateTime? deliveredAt;
  final DateTime? readAt;

  // Reply / quote
  final String? replyToId;
  final String? replyToText;
  final String? replyToSenderName;

  // Reactions
  final Map<String, List<String>> reactions; // emoji -> list of userIds

  // Editing
  final bool isEdited;
  final DateTime? editedAt;

  // Deletion
  final bool isDeletedForEveryone;
  final DateTime? deletedAt;

  // Forwarding
  final bool isForwarded;
  final int forwardCount;

  // Pin
  final bool isPinned;
  final String? pinnedBy;
  final DateTime? pinnedAt;

  // Link preview
  final String? linkUrl;
  final String? linkTitle;
  final String? linkDescription;
  final String? linkImage;

  // Media metadata
  final String? mediaUrl;
  final String? mediaThumbnailUrl;
  final int? mediaWidth;
  final int? mediaHeight;
  final int? mediaDuration; // seconds
  final int? mediaSize; // bytes

  // AI features
  final bool aiEnhanced;
  final String? aiCaption;
  final List<String> aiTags;
  final List<String> aiSuggestedReplies;

  // Mentions
  final List<String> mentionedUserIds;

  // Star / bookmark
  final bool isStarred;

  const ChatMessage({
    required this.id,
    required this.chatRoomId,
    required this.senderId,
    required this.senderName,
    this.senderAvatarUrl,
    this.type = MessageType.text,
    this.status = MessageStatus.sending,
    this.text,
    required this.createdAt,
    this.updatedAt,
    this.sentAt,
    this.deliveredAt,
    this.readAt,
    this.replyToId,
    this.replyToText,
    this.replyToSenderName,
    this.reactions = const {},
    this.isEdited = false,
    this.editedAt,
    this.isDeletedForEveryone = false,
    this.deletedAt,
    this.isForwarded = false,
    this.forwardCount = 0,
    this.isPinned = false,
    this.pinnedBy,
    this.pinnedAt,
    this.linkUrl,
    this.linkTitle,
    this.linkDescription,
    this.linkImage,
    this.mediaUrl,
    this.mediaThumbnailUrl,
    this.mediaWidth,
    this.mediaHeight,
    this.mediaDuration,
    this.mediaSize,
    this.aiEnhanced = false,
    this.aiCaption,
    this.aiTags = const [],
    this.aiSuggestedReplies = const [],
    this.mentionedUserIds = const [],
    this.isStarred = false,
  });

  factory ChatMessage.fromDoc(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    final ts = (d['createdAt'] as Timestamp?) ?? (d['timestamp'] as Timestamp?);
    return ChatMessage(
      id: doc.id,
      chatRoomId: sanitizeUtf16('${d['chatRoomId'] ?? d['roomId'] ?? ''}'),
      senderId: sanitizeUtf16(d['senderId']?.toString()),
      senderName: sanitizeUtf16(d['senderName']?.toString(), fallback: 'Member'),
      senderAvatarUrl: sanitizeUtf16(
        (d['senderAvatarUrl'] ?? d['senderPhoto']) as String?,
      ),
      type: MessageType.values.firstWhere(
        (e) => e.name == d['type'],
        orElse: () => MessageType.text,
      ),
      status: MessageStatus.values.firstWhere(
        (e) => e.name == d['status'],
        orElse: () => MessageStatus.sent,
      ),
      text: sanitizeUtf16(d['text'] as String?),
      createdAt: ts?.toDate() ?? DateTime.now(),
      updatedAt: (d['updatedAt'] as Timestamp?)?.toDate(),
      sentAt: (d['sentAt'] as Timestamp?)?.toDate(),
      deliveredAt: (d['deliveredAt'] as Timestamp?)?.toDate(),
      readAt: (d['readAt'] as Timestamp?)?.toDate(),
      replyToId: sanitizeUtf16(d['replyToId'] as String?),
      replyToText: sanitizeUtf16(d['replyToText'] as String?),
      replyToSenderName: sanitizeUtf16(d['replyToSenderName'] as String?),
      reactions: (d['reactions'] as Map<String, dynamic>?)?.map(
            (key, value) => MapEntry(
              sanitizeUtf16(key),
              sanitizeUtf16List(List<String>.from(value)),
            ),
          ) ??
          {},
      isEdited: d['isEdited'] ?? false,
      editedAt: (d['editedAt'] as Timestamp?)?.toDate(),
      isDeletedForEveryone: d['isDeletedForEveryone'] ?? false,
      deletedAt: (d['deletedAt'] as Timestamp?)?.toDate(),
      isForwarded: d['isForwarded'] ?? false,
      forwardCount: d['forwardCount'] ?? 0,
      isPinned: d['isPinned'] ?? false,
      pinnedBy: sanitizeUtf16(d['pinnedBy'] as String?),
      pinnedAt: (d['pinnedAt'] as Timestamp?)?.toDate(),
      linkUrl: sanitizeUtf16(d['linkUrl'] as String?),
      linkTitle: sanitizeUtf16(d['linkTitle'] as String?),
      linkDescription: sanitizeUtf16(d['linkDescription'] as String?),
      linkImage: sanitizeUtf16(d['linkImage'] as String?),
      mediaUrl: sanitizeUtf16(d['mediaUrl'] as String?),
      mediaThumbnailUrl: sanitizeUtf16(d['mediaThumbnailUrl'] as String?),
      mediaWidth: d['mediaWidth'],
      mediaHeight: d['mediaHeight'],
      mediaDuration: d['mediaDuration'],
      mediaSize: d['mediaSize'],
      aiEnhanced: d['aiEnhanced'] ?? false,
      aiCaption: sanitizeUtf16(d['aiCaption'] as String?),
      aiTags: sanitizeUtf16List(d['aiTags'] as Iterable<dynamic>?),
      aiSuggestedReplies: sanitizeUtf16List(
        d['aiSuggestedReplies'] as Iterable<dynamic>?,
      ),
      mentionedUserIds: sanitizeUtf16List(
        d['mentionedUserIds'] ?? d['mentions'] ?? [],
      ),
      isStarred: d['isStarred'] ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'chatRoomId': chatRoomId,
      'senderId': senderId,
      'senderName': senderName,
      if (senderAvatarUrl != null) 'senderAvatarUrl': senderAvatarUrl,
      'type': type.name,
      'status': status.name,
      if (text != null) 'text': text,
      'createdAt': Timestamp.fromDate(createdAt),
      if (updatedAt != null) 'updatedAt': Timestamp.fromDate(updatedAt!),
      if (sentAt != null) 'sentAt': Timestamp.fromDate(sentAt!),
      if (deliveredAt != null) 'deliveredAt': Timestamp.fromDate(deliveredAt!),
      if (readAt != null) 'readAt': Timestamp.fromDate(readAt!),
      if (replyToId != null) 'replyToId': replyToId,
      if (replyToText != null) 'replyToText': replyToText,
      if (replyToSenderName != null) 'replyToSenderName': replyToSenderName,
      if (reactions.isNotEmpty) 'reactions': reactions,
      'isEdited': isEdited,
      if (editedAt != null) 'editedAt': Timestamp.fromDate(editedAt!),
      'isDeletedForEveryone': isDeletedForEveryone,
      if (deletedAt != null) 'deletedAt': Timestamp.fromDate(deletedAt!),
      'isForwarded': isForwarded,
      if (forwardCount > 0) 'forwardCount': forwardCount,
      'isPinned': isPinned,
      if (pinnedBy != null) 'pinnedBy': pinnedBy,
      if (pinnedAt != null) 'pinnedAt': Timestamp.fromDate(pinnedAt!),
      if (linkUrl != null) 'linkUrl': linkUrl,
      if (linkTitle != null) 'linkTitle': linkTitle,
      if (linkDescription != null) 'linkDescription': linkDescription,
      if (linkImage != null) 'linkImage': linkImage,
      if (mediaUrl != null) 'mediaUrl': mediaUrl,
      if (mediaThumbnailUrl != null) 'mediaThumbnailUrl': mediaThumbnailUrl,
      if (mediaWidth != null) 'mediaWidth': mediaWidth,
      if (mediaHeight != null) 'mediaHeight': mediaHeight,
      if (mediaDuration != null) 'mediaDuration': mediaDuration,
      if (mediaSize != null) 'mediaSize': mediaSize,
      'aiEnhanced': aiEnhanced,
      if (aiCaption != null) 'aiCaption': aiCaption,
      if (aiTags.isNotEmpty) 'aiTags': aiTags,
      if (aiSuggestedReplies.isNotEmpty)
        'aiSuggestedReplies': aiSuggestedReplies,
      if (mentionedUserIds.isNotEmpty) 'mentionedUserIds': mentionedUserIds,
      'isStarred': isStarred,
    };
  }

  ChatMessage copyWith({
    String? id,
    String? chatRoomId,
    String? senderId,
    String? senderName,
    String? senderAvatarUrl,
    MessageType? type,
    MessageStatus? status,
    String? text,
    DateTime? createdAt,
    DateTime? updatedAt,
    DateTime? sentAt,
    DateTime? deliveredAt,
    DateTime? readAt,
    String? replyToId,
    String? replyToText,
    String? replyToSenderName,
    Map<String, List<String>>? reactions,
    bool? isEdited,
    DateTime? editedAt,
    bool? isDeletedForEveryone,
    DateTime? deletedAt,
    bool? isForwarded,
    int? forwardCount,
    bool? isPinned,
    String? pinnedBy,
    DateTime? pinnedAt,
    String? linkUrl,
    String? linkTitle,
    String? linkDescription,
    String? linkImage,
    String? mediaUrl,
    String? mediaThumbnailUrl,
    int? mediaWidth,
    int? mediaHeight,
    int? mediaDuration,
    int? mediaSize,
    bool? aiEnhanced,
    String? aiCaption,
    List<String>? aiTags,
    List<String>? aiSuggestedReplies,
    List<String>? mentionedUserIds,
    bool? isStarred,
  }) {
    return ChatMessage(
      id: id ?? this.id,
      chatRoomId: chatRoomId ?? this.chatRoomId,
      senderId: senderId ?? this.senderId,
      senderName: senderName ?? this.senderName,
      senderAvatarUrl: senderAvatarUrl ?? this.senderAvatarUrl,
      type: type ?? this.type,
      status: status ?? this.status,
      text: text ?? this.text,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      sentAt: sentAt ?? this.sentAt,
      deliveredAt: deliveredAt ?? this.deliveredAt,
      readAt: readAt ?? this.readAt,
      replyToId: replyToId ?? this.replyToId,
      replyToText: replyToText ?? this.replyToText,
      replyToSenderName: replyToSenderName ?? this.replyToSenderName,
      reactions: reactions ?? this.reactions,
      isEdited: isEdited ?? this.isEdited,
      editedAt: editedAt ?? this.editedAt,
      isDeletedForEveryone: isDeletedForEveryone ?? this.isDeletedForEveryone,
      deletedAt: deletedAt ?? this.deletedAt,
      isForwarded: isForwarded ?? this.isForwarded,
      forwardCount: forwardCount ?? this.forwardCount,
      isPinned: isPinned ?? this.isPinned,
      pinnedBy: pinnedBy ?? this.pinnedBy,
      pinnedAt: pinnedAt ?? this.pinnedAt,
      linkUrl: linkUrl ?? this.linkUrl,
      linkTitle: linkTitle ?? this.linkTitle,
      linkDescription: linkDescription ?? this.linkDescription,
      linkImage: linkImage ?? this.linkImage,
      mediaUrl: mediaUrl ?? this.mediaUrl,
      mediaThumbnailUrl: mediaThumbnailUrl ?? this.mediaThumbnailUrl,
      mediaWidth: mediaWidth ?? this.mediaWidth,
      mediaHeight: mediaHeight ?? this.mediaHeight,
      mediaDuration: mediaDuration ?? this.mediaDuration,
      mediaSize: mediaSize ?? this.mediaSize,
      aiEnhanced: aiEnhanced ?? this.aiEnhanced,
      aiCaption: aiCaption ?? this.aiCaption,
      aiTags: aiTags ?? this.aiTags,
      aiSuggestedReplies: aiSuggestedReplies ?? this.aiSuggestedReplies,
      mentionedUserIds: mentionedUserIds ?? this.mentionedUserIds,
      isStarred: isStarred ?? this.isStarred,
    );
  }
}
