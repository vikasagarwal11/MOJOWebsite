import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/text/safe_text.dart';

enum RoomType { direct, group, community, broadcast, channel }

class ChatRoom {
  final String id;
  final String? name;
  final String? description;
  final String? imageUrl;
  final RoomType type;

  // Members
  final List<String> memberIds;
  final List<String> adminIds;
  final int memberCount;

  // Last message
  final String? lastMessage;
  final DateTime? lastMessageTime;
  final String? lastMessageSenderId;
  final String? lastMessageSenderName;
  final String? lastMessageType;

  // Unread tracking per user
  final Map<String, int> unreadCounts;

  // Per-user settings ([chat_service] uses `mutedBy` array; `isMuted` map for legacy)
  final List<String> mutedBy;
  final Map<String, bool> isMuted;
  final Map<String, bool> isPinned;
  final bool isArchived;

  // Typing indicators
  final Map<String, DateTime> typingUsers;

  // Online presence
  final List<String> onlineMembers;

  // Group settings
  final bool isAdminOnly;
  final bool allowMemberInvites;
  final int? disappearingMessagesSeconds;

  // Theme / customization
  final String? themeColor;
  final String? wallpaperUrl;

  // Metadata
  final DateTime? createdAt;
  final String? createdBy;
  final DateTime? updatedAt;

  // Pinned messages
  final List<String> pinnedMessageIds;

  // AI features
  final bool aiSummaryEnabled;
  final String? lastAiSummary;
  final DateTime? lastAiSummaryAt;

  const ChatRoom({
    required this.id,
    this.name,
    this.description,
    this.imageUrl,
    this.type = RoomType.group,
    this.memberIds = const [],
    this.adminIds = const [],
    this.memberCount = 0,
    this.lastMessage,
    this.lastMessageTime,
    this.lastMessageSenderId,
    this.lastMessageSenderName,
    this.lastMessageType,
    this.unreadCounts = const {},
    this.mutedBy = const [],
    this.isMuted = const {},
    this.isPinned = const {},
    this.isArchived = false,
    this.typingUsers = const {},
    this.onlineMembers = const [],
    this.isAdminOnly = false,
    this.allowMemberInvites = true,
    this.disappearingMessagesSeconds,
    this.themeColor,
    this.wallpaperUrl,
    this.createdAt,
    this.createdBy,
    this.updatedAt,
    this.pinnedMessageIds = const [],
    this.aiSummaryEnabled = false,
    this.lastAiSummary,
    this.lastAiSummaryAt,
  });

  // ---------------------------------------------------------------------------
  // Firestore serialization
  // ---------------------------------------------------------------------------

  factory ChatRoom.fromDoc(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return ChatRoom(
      id: doc.id,
      name: sanitizeUtf16(data['name'] as String?),
      description: sanitizeUtf16(data['description'] as String?),
      imageUrl: sanitizeUtf16(data['imageUrl'] as String?),
      type: _roomTypeFromString(data['type'] as String?),
      memberIds: sanitizeUtf16List(data['memberIds'] as Iterable<dynamic>?),
      adminIds: sanitizeUtf16List(data['adminIds'] as Iterable<dynamic>?),
      memberCount: data['memberCount'] as int? ?? 0,
      lastMessage: sanitizeUtf16(data['lastMessage'] as String?),
      lastMessageTime: _toDateTime(data['lastMessageTime']),
      lastMessageSenderId: sanitizeUtf16(data['lastMessageSenderId'] as String?),
      lastMessageSenderName: sanitizeUtf16(
        data['lastMessageSenderName'] as String?,
      ),
      lastMessageType: sanitizeUtf16(data['lastMessageType'] as String?),
      unreadCounts: _toIntMap(data['unreadCounts']),
      mutedBy: sanitizeUtf16List(data['mutedBy'] as Iterable<dynamic>?),
      isMuted: _toBoolMap(data['isMuted']),
      isPinned: _toBoolMap(data['isPinned']),
      isArchived: data['isArchived'] as bool? ?? false,
      typingUsers: _toDateTimeMap(data['typingUsers']),
      onlineMembers: sanitizeUtf16List(
        data['onlineMembers'] as Iterable<dynamic>?,
      ),
      isAdminOnly: data['isAdminOnly'] as bool? ?? false,
      allowMemberInvites: data['allowMemberInvites'] as bool? ?? true,
      disappearingMessagesSeconds: data['disappearingMessagesSeconds'] as int?,
      themeColor: sanitizeUtf16(data['themeColor'] as String?),
      wallpaperUrl: sanitizeUtf16(data['wallpaperUrl'] as String?),
      createdAt: _toDateTime(data['createdAt']),
      createdBy: sanitizeUtf16(data['createdBy'] as String?),
      updatedAt: _toDateTime(data['updatedAt']),
      pinnedMessageIds: sanitizeUtf16List(
        data['pinnedMessageIds'] as Iterable<dynamic>?,
      ),
      aiSummaryEnabled: data['aiSummaryEnabled'] as bool? ?? false,
      lastAiSummary: sanitizeUtf16(data['lastAiSummary'] as String?),
      lastAiSummaryAt: _toDateTime(data['lastAiSummaryAt']),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'description': description,
      'imageUrl': imageUrl,
      'type': type.name,
      'memberIds': memberIds,
      'adminIds': adminIds,
      'memberCount': memberCount,
      'lastMessage': lastMessage,
      'lastMessageTime': lastMessageTime != null
          ? Timestamp.fromDate(lastMessageTime!)
          : null,
      'lastMessageSenderId': lastMessageSenderId,
      'lastMessageSenderName': lastMessageSenderName,
      'lastMessageType': lastMessageType,
      'unreadCounts': unreadCounts,
      'mutedBy': mutedBy,
      'isMuted': isMuted,
      'isPinned': isPinned,
      'isArchived': isArchived,
      'typingUsers': typingUsers.map(
        (k, v) => MapEntry(k, Timestamp.fromDate(v)),
      ),
      'onlineMembers': onlineMembers,
      'isAdminOnly': isAdminOnly,
      'allowMemberInvites': allowMemberInvites,
      'disappearingMessagesSeconds': disappearingMessagesSeconds,
      'themeColor': themeColor,
      'wallpaperUrl': wallpaperUrl,
      'createdAt':
          createdAt != null ? Timestamp.fromDate(createdAt!) : FieldValue.serverTimestamp(),
      'createdBy': createdBy,
      'updatedAt': FieldValue.serverTimestamp(),
      'pinnedMessageIds': pinnedMessageIds,
      'aiSummaryEnabled': aiSummaryEnabled,
      'lastAiSummary': lastAiSummary,
      'lastAiSummaryAt': lastAiSummaryAt != null
          ? Timestamp.fromDate(lastAiSummaryAt!)
          : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Helper getters
  // ---------------------------------------------------------------------------

  bool get isGroup =>
      type == RoomType.group ||
      type == RoomType.community ||
      type == RoomType.channel;

  bool get isDirect => type == RoomType.direct;

  String displayName(String currentUserId) {
    if (name != null && name!.isNotEmpty) return name!;
    // For direct chats fall back to the other member's id.
    if (isDirect) {
      final other = memberIds.where((id) => id != currentUserId);
      return other.isNotEmpty ? other.first : 'Chat';
    }
    return 'Unnamed Room';
  }

  int unreadCountFor(String userId) => unreadCounts[userId] ?? 0;

  bool isMutedFor(String userId) =>
      mutedBy.contains(userId) || (isMuted[userId] ?? false);

  bool isPinnedFor(String userId) => isPinned[userId] ?? false;

  bool isAdmin(String userId) => adminIds.contains(userId);

  List<String> get currentlyTypingUserIds {
    final now = DateTime.now();
    return typingUsers.entries
        .where((e) => now.difference(e.value).inSeconds < 30)
        .map((e) => e.key)
        .toList();
  }

  // ---------------------------------------------------------------------------
  // copyWith
  // ---------------------------------------------------------------------------

  ChatRoom copyWith({
    String? id,
    String? name,
    String? description,
    String? imageUrl,
    RoomType? type,
    List<String>? memberIds,
    List<String>? adminIds,
    int? memberCount,
    String? lastMessage,
    DateTime? lastMessageTime,
    String? lastMessageSenderId,
    String? lastMessageSenderName,
    String? lastMessageType,
    Map<String, int>? unreadCounts,
    List<String>? mutedBy,
    Map<String, bool>? isMuted,
    Map<String, bool>? isPinned,
    bool? isArchived,
    Map<String, DateTime>? typingUsers,
    List<String>? onlineMembers,
    bool? isAdminOnly,
    bool? allowMemberInvites,
    int? disappearingMessagesSeconds,
    String? themeColor,
    String? wallpaperUrl,
    DateTime? createdAt,
    String? createdBy,
    DateTime? updatedAt,
    List<String>? pinnedMessageIds,
    bool? aiSummaryEnabled,
    String? lastAiSummary,
    DateTime? lastAiSummaryAt,
  }) {
    return ChatRoom(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      imageUrl: imageUrl ?? this.imageUrl,
      type: type ?? this.type,
      memberIds: memberIds ?? this.memberIds,
      adminIds: adminIds ?? this.adminIds,
      memberCount: memberCount ?? this.memberCount,
      lastMessage: lastMessage ?? this.lastMessage,
      lastMessageTime: lastMessageTime ?? this.lastMessageTime,
      lastMessageSenderId: lastMessageSenderId ?? this.lastMessageSenderId,
      lastMessageSenderName: lastMessageSenderName ?? this.lastMessageSenderName,
      lastMessageType: lastMessageType ?? this.lastMessageType,
      unreadCounts: unreadCounts ?? this.unreadCounts,
      mutedBy: mutedBy ?? this.mutedBy,
      isMuted: isMuted ?? this.isMuted,
      isPinned: isPinned ?? this.isPinned,
      isArchived: isArchived ?? this.isArchived,
      typingUsers: typingUsers ?? this.typingUsers,
      onlineMembers: onlineMembers ?? this.onlineMembers,
      isAdminOnly: isAdminOnly ?? this.isAdminOnly,
      allowMemberInvites: allowMemberInvites ?? this.allowMemberInvites,
      disappearingMessagesSeconds:
          disappearingMessagesSeconds ?? this.disappearingMessagesSeconds,
      themeColor: themeColor ?? this.themeColor,
      wallpaperUrl: wallpaperUrl ?? this.wallpaperUrl,
      createdAt: createdAt ?? this.createdAt,
      createdBy: createdBy ?? this.createdBy,
      updatedAt: updatedAt ?? this.updatedAt,
      pinnedMessageIds: pinnedMessageIds ?? this.pinnedMessageIds,
      aiSummaryEnabled: aiSummaryEnabled ?? this.aiSummaryEnabled,
      lastAiSummary: lastAiSummary ?? this.lastAiSummary,
      lastAiSummaryAt: lastAiSummaryAt ?? this.lastAiSummaryAt,
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  static RoomType _roomTypeFromString(String? value) {
    switch (value) {
      case 'direct':
        return RoomType.direct;
      case 'community':
        return RoomType.community;
      case 'broadcast':
        return RoomType.broadcast;
      case 'channel':
        return RoomType.channel;
      case 'group':
      default:
        return RoomType.group;
    }
  }

  static DateTime? _toDateTime(dynamic value) {
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    return null;
  }

  static Map<String, int> _toIntMap(dynamic value) {
    if (value is Map) {
      return value.map((k, v) => MapEntry(k.toString(), (v as num).toInt()));
    }
    return {};
  }

  static Map<String, bool> _toBoolMap(dynamic value) {
    if (value is Map) {
      return value.map((k, v) => MapEntry(k.toString(), v as bool));
    }
    return {};
  }

  static Map<String, DateTime> _toDateTimeMap(dynamic value) {
    if (value is Map) {
      final result = <String, DateTime>{};
      for (final entry in value.entries) {
        final dt = _toDateTime(entry.value);
        if (dt != null) result[entry.key.toString()] = dt;
      }
      return result;
    }
    return {};
  }
}
