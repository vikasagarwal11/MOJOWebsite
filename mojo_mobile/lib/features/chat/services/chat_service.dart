import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';

import '../../../core/logging/app_logger.dart';

class ChatService {
  ChatService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instanceFor(region: 'us-east1');

  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFunctions _functions;

  // Stream of messages for a specific room
  Stream<QuerySnapshot> getMessages(String roomId) {
    return _db
        .collection('chatRooms')
        .doc(roomId)
        .collection('messages')
        .orderBy('timestamp', descending: true)
        .limit(50)
        .snapshots();
  }

  // Stream of chat rooms for the list view
  Stream<QuerySnapshot> getChatRooms() {
    return _db
        .collection('chatRooms')
        .orderBy('lastMessageTime', descending: true)
        .snapshots();
  }

  // Send a message with Next-Gen Metadata
  Future<void> sendMessage({
    required String roomId,
    required String text,
    String type = 'text',
    Map<String, dynamic>? metadata,
  }) async {
    final user = _auth.currentUser;
    if (user == null) return;

    final messageData = {
      'text': text,
      'senderId': user.uid,
      'senderName': user.displayName ?? 'Mojo Mom',
      'senderPhoto': user.photoURL,
      'type': type,
      'metadata': metadata ?? {},
      'timestamp': FieldValue.serverTimestamp(),
    };

    final roomRef = _db.collection('chatRooms').doc(roomId);
    final preview = type == 'voice'
        ? '🎤 Voice message'
        : (text.length > 50 ? '${text.substring(0, 50)}...' : text);
    await roomRef.set(
      {
        'lastMessage': preview,
        'lastMessageTime': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );

    await roomRef.collection('messages').add(messageData);
  }

  // ADMIN FEATURE: Broadcast to all users via a special "Announcements" room
  Future<void> sendBroadcast(String text) async {
    final user = _auth.currentUser;
    if (user == null) return;

    final role = (await _db.collection('users').doc(user.uid).get()).data()?['role'] as String?;
    if (role != 'admin') {
      appLogger.w('sendBroadcast denied: user ${user.uid} is not admin');
      return;
    }

    // We use a fixed ID for the global announcements room
    const String announcementsRoomId = 'global_announcements';

    // Ensure the room exists (simplified)
    await _db.collection('chatRooms').doc(announcementsRoomId).set({
      'name': '📢 MFM Announcements',
      'description': 'Important updates for the whole community',
      'type': 'broadcast',
      'isAdminOnly': true,
    }, SetOptions(merge: true));

    await sendMessage(
      roomId: announcementsRoomId,
      text: text,
      type: 'text',
      metadata: {'isBroadcast': true},
    );
  }

  /// AI Catch-Up via Cloud Function `summarizeChatRoom` (Gemini when configured server-side).
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
      return summary.trim();
    } on FirebaseFunctionsException catch (e, st) {
      appLogger.e('getAICatchUp callable failed', error: e, stackTrace: st);
      final msg = e.message ?? e.code;
      return 'Could not load summary: $msg';
    } catch (e, st) {
      appLogger.e('getAICatchUp failed', error: e, stackTrace: st);
      return 'Could not load summary. Check your connection and try again.';
    }
  }

  /// Uploads audio to Storage, then stores the download URL on the message (matches web `voice` type).
  Future<void> sendVoiceMessage(String roomId, String filePath, int durationMs) async {
    final user = _auth.currentUser;
    if (user == null) return;

    final file = File(filePath);
    if (!await file.exists()) {
      appLogger.w('sendVoiceMessage: file missing at $filePath');
      return;
    }

    try {
      final ref = FirebaseStorage.instance
          .ref()
          .child('chat_voice/${user.uid}/${DateTime.now().millisecondsSinceEpoch}.m4a');
      await ref.putFile(file);
      final url = await ref.getDownloadURL();
      await sendMessage(
        roomId: roomId,
        text: '',
        type: 'voice',
        metadata: {'duration': durationMs, 'url': url},
      );
    } catch (e, st) {
      appLogger.e('sendVoiceMessage failed', error: e, stackTrace: st);
      rethrow;
    }
  }
}
