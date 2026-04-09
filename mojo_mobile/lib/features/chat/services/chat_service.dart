import 'dart:io';
import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:rxdart/rxdart.dart';
import '../../../core/logging/app_logger.dart';
import '../../../core/text/safe_text.dart';
import '../../../data/models/chat_message.dart';
import '../../../data/models/chat_room.dart';
import '../../../data/models/mojo_user_profile.dart';

/// Logs then rethrows so listeners (e.g. [StreamBuilder]) still receive the error.
/// Filter logcat by `MOJO_CHAT`.
void _logFirestoreStreamError(String context, Object error, StackTrace stackTrace) {
  appLogger.e('MOJO_CHAT $context', error: error, stackTrace: stackTrace);
  if (error is FirebaseException) {
    appLogger.e(
      'MOJO_CHAT $context: code=${error.code} message=${error.message} '
      'plugin=${error.plugin}',
    );
  }
  Error.throwWithStackTrace(error, stackTrace);
}

class ChatService {
  ChatService({FirebaseFunctions? functions})
      : _functions =
            functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;
  final FirebaseFunctions _functions;

  /// Cache of typing indicator streams per room to avoid duplicate listeners.
  final Map<String, BehaviorSubject<Map<String, DateTime>>> _typingSubjects =
      {};

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  String? get _uid => _auth.currentUser?.uid;

  /// Firestore [MojoUserProfile] first (phone users), then Auth — matches RSVP / posts.
  Future<({String name, String? photo})> _resolveSenderIdentity(User user) async {
    try {
      final snap = await _db.collection('users').doc(user.uid).get();
      if (snap.exists) {
        final p = MojoUserProfile.fromDoc(snap);
        final name = p.resolvedPublicName?.trim().isNotEmpty == true
            ? p.resolvedPublicName!.trim()
            : (user.displayName?.trim().isNotEmpty == true
                ? user.displayName!.trim()
                : _fallbackNameFromEmail(user));
        final photo = p.photoUrl?.trim().isNotEmpty == true
            ? p.photoUrl
            : user.photoURL;
        return (name: name, photo: photo);
      }
    } catch (e, st) {
      appLogger.w(
        'resolveSenderIdentity: Firestore read failed',
        error: e,
        stackTrace: st,
      );
    }
    final name = user.displayName?.trim().isNotEmpty == true
        ? user.displayName!.trim()
        : _fallbackNameFromEmail(user);
    return (name: name, photo: user.photoURL);
  }

  String _fallbackNameFromEmail(User user) {
    final e = user.email;
    if (e != null && e.contains('@')) {
      final local = e.split('@').first.trim();
      if (local.isNotEmpty) return local;
    }
    return 'Mojo Mom';
  }

  DocumentReference _roomRef(String roomId) =>
      _db.collection('chatRooms').doc(roomId);

  CollectionReference _messagesRef(String roomId) =>
      _roomRef(roomId).collection('messages');

  Future<ChatRoom?> getRoom(String roomId) async {
    try {
      final snap = await _roomRef(roomId).get();
      if (!snap.exists) return null;
      return ChatRoom.fromDoc(snap);
    } catch (e, st) {
      appLogger.e('getRoom failed', error: e, stackTrace: st);
      return null;
    }
  }

  String _messagePreview(String text, MessageType type) {
    final safeText = sanitizeUtf16(text);
    switch (type) {
      case MessageType.image:
        return '\u{1F4F7} Photo';
      case MessageType.video:
        return '\u{1F3AC} Video';
      case MessageType.voice:
        return '\u{1F3A4} Voice message';
      case MessageType.gif:
        return 'GIF';
      case MessageType.sticker:
        return '\u{1F600} Sticker';
      case MessageType.document:
        return '\u{1F4CE} Document';
      case MessageType.location:
        return '\u{1F4CD} Location';
      case MessageType.contact:
        return '\u{1F464} Contact';
      case MessageType.system:
        return safeText;
      case MessageType.text:
      default:
        return safeText.length > 50
            ? '${safeText.substring(0, 50)}...'
            : safeText;
    }
  }

  // ---------------------------------------------------------------------------
  // Core messaging
  // ---------------------------------------------------------------------------

  /// Real-time stream of the most recent [limit] messages in [roomId].
  Stream<List<ChatMessage>> getMessages(String roomId, {int limit = 50}) {
    return _messagesRef(roomId)
        .orderBy('timestamp', descending: true)
        .limit(limit)
        .snapshots()
        .map((snap) =>
            snap.docs.map((doc) => ChatMessage.fromDoc(doc)).toList());
  }

  /// Paginated fetch for infinite scroll. Returns older messages before
  /// [lastDoc] (the last DocumentSnapshot from the previous page).
  Future<List<ChatMessage>> getOlderMessages(
    String roomId,
    DocumentSnapshot lastDoc, {
    int limit = 30,
  }) async {
    try {
      final snap = await _messagesRef(roomId)
          .orderBy('timestamp', descending: true)
          .startAfterDocument(lastDoc)
          .limit(limit)
          .get();
      return snap.docs.map((doc) => ChatMessage.fromDoc(doc)).toList();
    } catch (e, st) {
      appLogger.e('getOlderMessages failed', error: e, stackTrace: st);
      return [];
    }
  }

  /// Real-time stream of chat rooms the current user belongs to, sorted by
  /// most recent activity.
  ///
  /// Subscribes via [FirebaseAuth.authStateChanges] so the Firestore listener
  /// starts only after Auth has a user (avoids PERMISSION_DENIED races right
  /// after sign-in when the previous listener was signed out).
  Stream<List<ChatRoom>> getChatRooms() {
    return _auth.authStateChanges().switchMap((User? user) {
      if (user == null) {
        return Stream<List<ChatRoom>>.value(const []);
      }
      final memberRooms = _db
          .collection('chatRooms')
          .where('memberIds', arrayContains: user.uid)
          .orderBy('lastMessageTime', descending: true)
          .snapshots();
      final openRooms = _db
          .collection('chatRooms')
          .where(
            'type',
            whereIn: const ['community', 'broadcast', 'channel'],
          )
          .orderBy('lastMessageTime', descending: true)
          .snapshots();
      return Rx.combineLatest2(
            memberRooms,
            openRooms,
            (
              QuerySnapshot<Map<String, dynamic>> memberSnap,
              QuerySnapshot<Map<String, dynamic>> openSnap,
            ) {
              final roomsById = <String, ChatRoom>{};
              for (final doc in memberSnap.docs) {
                roomsById[doc.id] = ChatRoom.fromDoc(doc);
              }
              for (final doc in openSnap.docs) {
                roomsById[doc.id] = ChatRoom.fromDoc(doc);
              }
              final rooms = roomsById.values.toList()
                ..sort((a, b) {
                  final aMs = a.lastMessageTime?.millisecondsSinceEpoch ?? 0;
                  final bMs = b.lastMessageTime?.millisecondsSinceEpoch ?? 0;
                  return bMs.compareTo(aMs);
                });
              return rooms;
            },
          )
          .handleError(
            (Object e, StackTrace st) =>
                _logFirestoreStreamError('getChatRooms', e, st),
          );
    });
  }

  /// Sends a message and updates the room's last-message metadata and unread
  /// counts for all other members. Returns the new message document ID.
  Future<String> sendMessage({
    required String roomId,
    required String text,
    MessageType type = MessageType.text,
    Map<String, dynamic>? metadata,
    String? replyToId,
    String? replyToText,
    String? replyToSenderName,
    List<String>? mentions,
    String? mediaUrl,
    String? mediaThumbnailUrl,
  }) async {
    final user = _auth.currentUser;
    if (user == null) throw StateError('Not authenticated');

    final identity = await _resolveSenderIdentity(user);
    final safeText = sanitizeUtf16(text);
    final safeReplyToText = sanitizeUtf16(replyToText);
    final safeReplyToSenderName = sanitizeUtf16(replyToSenderName);
    final mentionIds = sanitizeUtf16List(mentions ?? <String>[]);
    final messageData = <String, dynamic>{
      'roomId': roomId,
      'chatRoomId': roomId,
      'text': safeText,
      'senderId': user.uid,
      'senderName': sanitizeUtf16(identity.name, fallback: 'Mojo Mom'),
      'senderPhoto': identity.photo,
      'senderAvatarUrl': identity.photo,
      'type': type.name,
      'status': MessageStatus.sent.name,
      'timestamp': FieldValue.serverTimestamp(),
      'createdAt': FieldValue.serverTimestamp(),
      'reactions': <String, List<String>>{},
      'readBy': <String, dynamic>{user.uid: FieldValue.serverTimestamp()},
      'isEdited': false,
      'isDeletedForEveryone': false,
      'isForwarded': false,
      'forwardCount': 0,
      'isPinned': false,
      'isStarred': false,
      'mentions': mentionIds,
      'mentionedUserIds': mentionIds,
      'metadata': metadata ?? {},
    };

    if (replyToId != null) {
      messageData['replyToId'] = replyToId;
      messageData['replyToText'] = safeReplyToText;
      messageData['replyToSenderName'] = safeReplyToSenderName;
    }
    if (mediaUrl != null) messageData['mediaUrl'] = mediaUrl;
    if (mediaThumbnailUrl != null) {
      messageData['mediaThumbnailUrl'] = mediaThumbnailUrl;
    }

    try {
      final roomSnap = await _roomRef(roomId).get();
      final roomData = roomSnap.data() as Map<String, dynamic>?;
      final memberIds =
          List<String>.from(roomData?['memberIds'] ?? <String>[]);

      final unreadUpdates = <String, dynamic>{};
      for (final memberId in memberIds) {
        if (memberId != user.uid) {
          unreadUpdates['unreadCounts.$memberId'] = FieldValue.increment(1);
        }
      }

      final messageRef = _messagesRef(roomId).doc();
      final batch = _db.batch();
      batch.set(messageRef, messageData);
      batch.update(_roomRef(roomId), {
        'lastMessage': _messagePreview(safeText, type),
        'lastMessageTime': FieldValue.serverTimestamp(),
        'lastMessageSenderId': user.uid,
        'lastMessageSenderName': sanitizeUtf16(
          identity.name,
          fallback: 'Mojo Mom',
        ),
        'lastMessageType': type.name,
        ...unreadUpdates,
      });
      await batch.commit();

      return messageRef.id;
    } catch (e, st) {
      appLogger.e('sendMessage failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Admin-only broadcast to the global announcements room.
  Future<void> sendBroadcast(String text) async {
    final user = _auth.currentUser;
    if (user == null) return;

    final role = (await _db.collection('users').doc(user.uid).get())
        .data()?['role'] as String?;
    if (role != 'admin') {
      appLogger.w('sendBroadcast denied: user ${user.uid} is not admin');
      return;
    }

    const String announcementsRoomId = 'global_announcements';

    await _db.collection('chatRooms').doc(announcementsRoomId).set({
      'name': '\u{1F4E2} MFM Announcements',
      'description': 'Important updates for the whole community',
      'type': RoomType.broadcast.name,
      'isAdminOnly': true,
    }, SetOptions(merge: true));

    await sendMessage(
      roomId: announcementsRoomId,
      text: text,
      type: MessageType.text,
      metadata: {'isBroadcast': true},
    );
  }

  /// Uploads a voice recording to Storage and sends a voice message.
  Future<void> sendVoiceMessage(
      String roomId, String filePath, int durationMs) async {
    final user = _auth.currentUser;
    if (user == null) return;

    final file = File(filePath);
    if (!await file.exists()) {
      appLogger.w('sendVoiceMessage: file missing at $filePath');
      return;
    }

    try {
      final ref = _storage.ref().child(
          'chat_voice/${user.uid}/${DateTime.now().millisecondsSinceEpoch}.m4a');
      await ref.putFile(file);
      final url = await ref.getDownloadURL();

      await sendMessage(
        roomId: roomId,
        text: '',
        type: MessageType.voice,
        mediaUrl: url,
        metadata: {'duration': durationMs},
      );
    } catch (e, st) {
      appLogger.e('sendVoiceMessage failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  // ---------------------------------------------------------------------------
  // Reactions
  // ---------------------------------------------------------------------------

  Future<void> addReaction(
      String roomId, String messageId, String emoji) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      await _messagesRef(roomId).doc(messageId).update({
        'reactions.$emoji': FieldValue.arrayUnion([uid]),
      });
    } catch (e, st) {
      appLogger.e('addReaction failed', error: e, stackTrace: st);
    }
  }

  Future<void> removeReaction(
      String roomId, String messageId, String emoji) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      await _messagesRef(roomId).doc(messageId).update({
        'reactions.$emoji': FieldValue.arrayRemove([uid]),
      });
    } catch (e, st) {
      appLogger.e('removeReaction failed', error: e, stackTrace: st);
    }
  }

  // ---------------------------------------------------------------------------
  // Read receipts & typing indicators
  // ---------------------------------------------------------------------------

  /// Marks recent messages as read by the current user and resets the room's
  /// unread counter.
  Future<void> markAsRead(String roomId) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      // Reset unread count on the room.
      await _roomRef(roomId).update({'unreadCounts.$uid': 0});

      // Mark last 50 unread messages as read by this user.
      final unread = await _messagesRef(roomId)
          .orderBy('timestamp', descending: true)
          .limit(50)
          .get();

      final batch = _db.batch();
      for (final doc in unread.docs) {
        final readBy = doc.data() as Map<String, dynamic>;
        final alreadyRead =
            (readBy['readBy'] as Map<String, dynamic>?)?.containsKey(uid) ??
                false;
        if (!alreadyRead) {
          batch.update(doc.reference, {
            'readBy.$uid': FieldValue.serverTimestamp(),
            'status': MessageStatus.read.name,
          });
        }
      }
      await batch.commit();
    } catch (e, st) {
      appLogger.e('markAsRead failed', error: e, stackTrace: st);
    }
  }

  /// Sets or clears the typing indicator for the current user in a room.
  Future<void> setTyping(String roomId, bool isTyping) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      if (isTyping) {
        await _roomRef(roomId).update({
          'typingUsers.$uid': FieldValue.serverTimestamp(),
        });
      } else {
        await _roomRef(roomId).update({
          'typingUsers.$uid': FieldValue.delete(),
        });
      }
    } catch (e, st) {
      appLogger.e('setTyping failed', error: e, stackTrace: st);
    }
  }

  /// Real-time stream of which users are currently typing in [roomId].
  /// Uses a BehaviorSubject cache to avoid duplicate Firestore listeners.
  Stream<Map<String, DateTime>> getTypingUsers(String roomId) {
    if (_typingSubjects.containsKey(roomId)) {
      return _typingSubjects[roomId]!.stream;
    }

    final subject = BehaviorSubject<Map<String, DateTime>>.seeded({});
    _typingSubjects[roomId] = subject;

    _roomRef(roomId).snapshots().listen(
      (snap) {
        final data = snap.data() as Map<String, dynamic>?;
        if (data == null || data['typingUsers'] == null) {
          subject.add({});
          return;
        }
        final raw = data['typingUsers'] as Map<String, dynamic>;
        final now = DateTime.now();
        final active = <String, DateTime>{};
        for (final entry in raw.entries) {
          if (entry.key == _uid) continue; // exclude self
          final ts = (entry.value as Timestamp?)?.toDate();
          if (ts != null && now.difference(ts).inSeconds < 30) {
            active[entry.key] = ts;
          }
        }
        subject.add(active);
      },
      onError: (e, st) {
        appLogger.e('getTypingUsers stream error', error: e, stackTrace: st);
      },
    );

    return subject.stream;
  }

  // ---------------------------------------------------------------------------
  // Message management
  // ---------------------------------------------------------------------------

  Future<void> editMessage(
      String roomId, String messageId, String newText) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      final docRef = _messagesRef(roomId).doc(messageId);
      final snap = await docRef.get();
      final data = snap.data() as Map<String, dynamic>?;
      if (data?['senderId'] != uid) {
        appLogger.w('editMessage denied: not the sender');
        return;
      }
      await docRef.update({
        'text': newText,
        'isEdited': true,
        'editedAt': FieldValue.serverTimestamp(),
      });
    } catch (e, st) {
      appLogger.e('editMessage failed', error: e, stackTrace: st);
    }
  }

  Future<void> deleteMessage(String roomId, String messageId,
      {bool forEveryone = false}) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      if (forEveryone) {
        await _messagesRef(roomId).doc(messageId).update({
          'isDeletedForEveryone': true,
          'deletedAt': FieldValue.serverTimestamp(),
          'text': '',
        });
      } else {
        // Per-user delete: store in metadata so the client can filter.
        await _messagesRef(roomId).doc(messageId).update({
          'metadata.deletedFor': FieldValue.arrayUnion([uid]),
        });
      }
    } catch (e, st) {
      appLogger.e('deleteMessage failed', error: e, stackTrace: st);
    }
  }

  Future<void> pinMessage(String roomId, String messageId) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      await _messagesRef(roomId).doc(messageId).update({
        'isPinned': true,
        'pinnedBy': uid,
        'pinnedAt': FieldValue.serverTimestamp(),
      });
      await _roomRef(roomId).update({
        'pinnedMessageIds': FieldValue.arrayUnion([messageId]),
      });
    } catch (e, st) {
      appLogger.e('pinMessage failed', error: e, stackTrace: st);
    }
  }

  Future<void> unpinMessage(String roomId, String messageId) async {
    try {
      await _messagesRef(roomId).doc(messageId).update({
        'isPinned': false,
        'pinnedBy': FieldValue.delete(),
        'pinnedAt': FieldValue.delete(),
      });
      await _roomRef(roomId).update({
        'pinnedMessageIds': FieldValue.arrayRemove([messageId]),
      });
    } catch (e, st) {
      appLogger.e('unpinMessage failed', error: e, stackTrace: st);
    }
  }

  Future<void> starMessage(String roomId, String messageId) async {
    try {
      final docRef = _messagesRef(roomId).doc(messageId);
      final snap = await docRef.get();
      final data = snap.data() as Map<String, dynamic>?;
      final current = data?['isStarred'] as bool? ?? false;
      await docRef.update({'isStarred': !current});
    } catch (e, st) {
      appLogger.e('starMessage failed', error: e, stackTrace: st);
    }
  }

  Future<void> forwardMessage(
      String sourceRoomId, String messageId, String targetRoomId) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      final snap = await _messagesRef(sourceRoomId).doc(messageId).get();
      final original = snap.data() as Map<String, dynamic>?;
      if (original == null) return;

      final forwardCount = (original['forwardCount'] as int? ?? 0) + 1;

      // Increment forward count on the original.
      await _messagesRef(sourceRoomId).doc(messageId).update({
        'forwardCount': forwardCount,
      });

      await sendMessage(
        roomId: targetRoomId,
        text: original['text'] as String? ?? '',
        type: MessageType.values.firstWhere(
          (t) => t.name == (original['type'] as String? ?? 'text'),
          orElse: () => MessageType.text,
        ),
        mediaUrl: original['mediaUrl'] as String?,
        mediaThumbnailUrl: original['mediaThumbnailUrl'] as String?,
        metadata: {
          ...?original['metadata'] as Map<String, dynamic>?,
          'isForwarded': true,
          'forwardCount': forwardCount,
          'originalRoomId': sourceRoomId,
          'originalMessageId': messageId,
        },
      );
    } catch (e, st) {
      appLogger.e('forwardMessage failed', error: e, stackTrace: st);
    }
  }

  // ---------------------------------------------------------------------------
  // Media messages
  // ---------------------------------------------------------------------------

  Future<String> _uploadMedia(File file, String folder) async {
    final uid = _uid!;
    final ts = DateTime.now().millisecondsSinceEpoch;
    final ext = file.path.split('.').last;
    final ref = _storage.ref().child('$folder/$uid/$ts.$ext');
    await ref.putFile(file);
    return ref.getDownloadURL();
  }

  Future<String> sendImageMessage(
    String roomId,
    File imageFile, {
    String? replyToId,
    String? replyToText,
    String? replyToSenderName,
  }) async {
    try {
      final url = await _uploadMedia(imageFile, 'chat_media');
      return sendMessage(
        roomId: roomId,
        text: '',
        type: MessageType.image,
        mediaUrl: url,
        replyToId: replyToId,
        replyToText: replyToText,
        replyToSenderName: replyToSenderName,
      );
    } catch (e, st) {
      appLogger.e('sendImageMessage failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  Future<String> sendVideoMessage(
    String roomId,
    File videoFile, {
    int? durationMs,
  }) async {
    try {
      final url = await _uploadMedia(videoFile, 'chat_media');
      return sendMessage(
        roomId: roomId,
        text: '',
        type: MessageType.video,
        mediaUrl: url,
        metadata: {
          if (durationMs != null) 'duration': durationMs,
        },
      );
    } catch (e, st) {
      appLogger.e('sendVideoMessage failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  Future<String> sendGifMessage(String roomId, String gifUrl) async {
    try {
      return sendMessage(
        roomId: roomId,
        text: '',
        type: MessageType.gif,
        mediaUrl: gifUrl,
      );
    } catch (e, st) {
      appLogger.e('sendGifMessage failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  // ---------------------------------------------------------------------------
  // Room management
  // ---------------------------------------------------------------------------

  /// Deterministic Firestore document id for a 1:1 room so both users resolve to the same chat.
  static String directRoomDocumentId(String uidA, String uidB) {
    if (uidA.isEmpty || uidB.isEmpty) {
      throw ArgumentError('UIDs must be non-empty');
    }
    if (uidA == uidB) {
      throw ArgumentError('Cannot create a direct room with the same user twice');
    }
    final ordered = uidA.compareTo(uidB) < 0 ? [uidA, uidB] : [uidB, uidA];
    return 'dm_${ordered[0]}_${ordered[1]}';
  }

  /// Creates [chatRooms] doc if missing (transaction). Both users share this id.
  Future<String> getOrCreateDirectRoom(String otherUserId) async {
    final uid = _uid;
    if (uid == null) throw StateError('Not authenticated');
    if (otherUserId == uid) {
      throw ArgumentError('Cannot start a direct chat with yourself');
    }

    final roomId = directRoomDocumentId(uid, otherUserId);
    final ref = _db.collection('chatRooms').doc(roomId);

    await _db.runTransaction((transaction) async {
      final snap = await transaction.get(ref);
      if (snap.exists) return;

      transaction.set(ref, {
        'name': '',
        'description': '',
        'type': RoomType.direct.name,
        'memberIds': <String>[uid, otherUserId],
        'adminIds': <String>[uid, otherUserId],
        'memberCount': 2,
        'createdAt': FieldValue.serverTimestamp(),
        'createdBy': uid,
        'updatedAt': FieldValue.serverTimestamp(),
        'lastMessage': '',
        'lastMessageTime': FieldValue.serverTimestamp(),
        'unreadCounts': <String, int>{uid: 0, otherUserId: 0},
        'mutedBy': <String>[],
        'pinnedBy': <String>[],
        'typingUsers': <String, dynamic>{},
        'pinnedMessageIds': <String>[],
        'aiSummaryEnabled': false,
        'allowMemberInvites': false,
        'isAdminOnly': false,
      });
    });

    return roomId;
  }

  Future<String> createRoom({
    required String name,
    String? description,
    RoomType type = RoomType.group,
    required List<String> memberIds,
  }) async {
    final uid = _uid;
    if (uid == null) throw StateError('Not authenticated');

    final allMembers = {...memberIds, uid}.toList();

    try {
      final docRef = await _db.collection('chatRooms').add({
        'name': name,
        'description': description ?? '',
        'type': type.name,
        'memberIds': allMembers,
        'adminIds': [uid],
        'memberCount': allMembers.length,
        'createdAt': FieldValue.serverTimestamp(),
        'createdBy': uid,
        'updatedAt': FieldValue.serverTimestamp(),
        'lastMessage': '',
        'lastMessageTime': FieldValue.serverTimestamp(),
        'unreadCounts': {for (final m in allMembers) m: 0},
        'mutedBy': <String>[],
        'pinnedBy': <String>[],
        'typingUsers': <String, dynamic>{},
        'pinnedMessageIds': <String>[],
        'aiSummaryEnabled': false,
      });
      return docRef.id;
    } catch (e, st) {
      appLogger.e('createRoom failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  Future<void> addMembers(String roomId, List<String> userIds) async {
    try {
      await _roomRef(roomId).update({
        'memberIds': FieldValue.arrayUnion(userIds),
        'memberCount': FieldValue.increment(userIds.length),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (e, st) {
      appLogger.e('addMembers failed', error: e, stackTrace: st);
    }
  }

  Future<void> removeMembers(String roomId, List<String> userIds) async {
    try {
      await _roomRef(roomId).update({
        'memberIds': FieldValue.arrayRemove(userIds),
        'memberCount': FieldValue.increment(-userIds.length),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (e, st) {
      appLogger.e('removeMembers failed', error: e, stackTrace: st);
    }
  }

  Future<void> muteRoom(String roomId) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      await _roomRef(roomId).update({
        'mutedBy': FieldValue.arrayUnion([uid]),
      });
    } catch (e, st) {
      appLogger.e('muteRoom failed', error: e, stackTrace: st);
    }
  }

  Future<void> unmuteRoom(String roomId) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      await _roomRef(roomId).update({
        'mutedBy': FieldValue.arrayRemove([uid]),
      });
    } catch (e, st) {
      appLogger.e('unmuteRoom failed', error: e, stackTrace: st);
    }
  }

  Future<void> pinRoom(String roomId) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      await _roomRef(roomId).update({
        'pinnedBy': FieldValue.arrayUnion([uid]),
      });
    } catch (e, st) {
      appLogger.e('pinRoom failed', error: e, stackTrace: st);
    }
  }

  Future<void> archiveRoom(String roomId) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      await _roomRef(roomId).update({
        'archivedBy': FieldValue.arrayUnion([uid]),
      });
    } catch (e, st) {
      appLogger.e('archiveRoom failed', error: e, stackTrace: st);
    }
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  /// Client-side search over recent messages. Fetches the last 200 messages
  /// and filters by [query] (case-insensitive substring match).
  Future<List<ChatMessage>> searchMessages(
      String roomId, String query) async {
    try {
      final snap = await _messagesRef(roomId)
          .orderBy('timestamp', descending: true)
          .limit(200)
          .get();

      final lowerQuery = query.toLowerCase();
      return snap.docs
          .map((doc) => ChatMessage.fromDoc(doc))
          .where((msg) => (msg.text ?? '').toLowerCase().contains(lowerQuery))
          .toList();
    } catch (e, st) {
      appLogger.e('searchMessages failed', error: e, stackTrace: st);
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // AI features
  // ---------------------------------------------------------------------------

  /// AI Catch-Up via Cloud Function `summarizeChatRoom`.
  Future<String> getAICatchUp(String roomId) async {
    final user = _auth.currentUser;
    if (user == null) {
      return 'Sign in to use AI Catch-Up.';
    }
    try {
      final callable = _functions.httpsCallable('summarizeChatRoom');
      final result = await callable.call({'roomId': roomId});
      final data = result.data;
      final summary = data is Map ? data['summary']?.toString() : null;
      if (summary == null || summary.trim().isEmpty) {
        return 'No summary returned. Try again in a moment.';
      }

      // Persist summary on the room for caching.
      await _roomRef(roomId).update({
        'lastAiSummary': summary.trim(),
        'lastAiSummaryAt': FieldValue.serverTimestamp(),
      });

      return summary.trim();
    } on FirebaseFunctionsException catch (e, st) {
      appLogger.e('getAICatchUp callable failed', error: e, stackTrace: st);
      if (e.code == 'not-found') {
        return 'AI Catch-Up is not deployed for this Firebase project yet. '
            'Deploy callable `summarizeChatRoom` in region us-east1 (same project as this app). '
            'From repo root: `firebase deploy --only functions:summarizeChatRoom` with project selected.';
      }
      final msg = e.message ?? e.code;
      return 'Could not load summary: $msg';
    } catch (e, st) {
      appLogger.e('getAICatchUp failed', error: e, stackTrace: st);
      return 'Could not load summary. Check your connection and try again.';
    }
  }

  /// Fetches smart reply suggestions for the current conversation context.
  Future<List<String>> getSmartReplies(String roomId) async {
    final user = _auth.currentUser;
    if (user == null) return [];

    try {
      final callable = _functions.httpsCallable('getSmartReplies');
      final result = await callable.call({'roomId': roomId});
      final data = result.data;
      if (data is Map && data['replies'] is List) {
        return sanitizeUtf16List(data['replies'] as Iterable<dynamic>?);
      }

      // Fallback: generate basic suggestions from last message.
      final lastMessages = await _messagesRef(roomId)
          .orderBy('timestamp', descending: true)
          .limit(3)
          .get();
      if (lastMessages.docs.isEmpty) return [];

      final lastText =
          (lastMessages.docs.first.data() as Map<String, dynamic>)['text']
              as String? ??
              '';
      if (lastText.contains('?')) {
        return ['Yes!', 'No, not really', 'Let me think about it'];
      }
      return ['\u{1F44D}', 'Thanks!', 'Got it'];
    } catch (e, st) {
      appLogger.e('getSmartReplies failed', error: e, stackTrace: st);
      return [];
    }
  }

  /// Calls a cloud function to generate an AI caption for an image.
  Future<String?> generateAICaption(String imageUrl) async {
    try {
      final callable = _functions.httpsCallable('generateImageCaption');
      final result = await callable.call({'imageUrl': imageUrl});
      final data = result.data;
      if (data is Map && data['caption'] is String) {
        return data['caption'] as String;
      }
      return null;
    } catch (e, st) {
      appLogger.e('generateAICaption failed', error: e, stackTrace: st);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Presence
  // ---------------------------------------------------------------------------

  /// Updates the current user's online status and last-seen timestamp.
  Future<void> updatePresence(bool isOnline) async {
    final uid = _uid;
    if (uid == null) return;
    try {
      await _db.collection('users').doc(uid).update({
        'isOnline': isOnline,
        'lastSeen': FieldValue.serverTimestamp(),
      });
    } catch (e, st) {
      appLogger.e('updatePresence failed', error: e, stackTrace: st);
    }
  }

  /// Real-time stream of whether a specific user is online.
  Stream<bool> getOnlineStatus(String userId) {
    return _db
        .collection('users')
        .doc(userId)
        .snapshots()
        .map((snap) {
      final data = snap.data();
      return data?['isOnline'] as bool? ?? false;
    });
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /// Disposes cached BehaviorSubjects. Call when the service is no longer
  /// needed (e.g., on logout).
  void dispose() {
    for (final subject in _typingSubjects.values) {
      subject.close();
    }
    _typingSubjects.clear();
  }
}
