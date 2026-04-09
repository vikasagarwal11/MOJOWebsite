import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../firebase_options.dart';
import '../logging/app_logger.dart';
import '../router/app_router.dart' show rootNavigatorKey;

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  WidgetsFlutterBinding.ensureInitialized();
  if (firebaseOptionsConfigured) {
    await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform);
  }
  appLogger.d('FCM background: ${message.messageId} ${message.data}');
}

/// Registers the device FCM token on `users/{uid}` (same fields as web) and
/// wires tap / foreground handlers to align with Cloud Functions payloads.
class PushNotificationService {
  PushNotificationService._();
  static final PushNotificationService instance = PushNotificationService._();

  bool _handlersAttached = false;
  StreamSubscription<String>? _tokenRefreshSub;

  Future<void> attachMessageHandlersOnce() async {
    if (_handlersAttached) return;
    _handlersAttached = true;

    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      appLogger.i(
        'FCM foreground: ${message.notification?.title} — ${message.notification?.body}',
      );
    });

    FirebaseMessaging.onMessageOpenedApp.listen(_handleRemoteMessageNavigation);

    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _handleRemoteMessageNavigation(initial);
      });
    }
  }

  void _handleRemoteMessageNavigation(RemoteMessage message) {
    final data = message.data;
    _navigateFromPayload(data);
  }

  void _navigateFromPayload(Map<String, dynamic> data) {
    final ctx = rootNavigatorKey.currentContext;
    if (ctx == null) {
      appLogger.w('FCM: no navigator context for deep link');
      return;
    }

    final type = data['type']?.toString() ?? '';
    final eventId = data['eventId']?.toString();

    if (eventId != null && eventId.isNotEmpty) {
      ctx.go('/events/$eventId');
      return;
    }

    if (type == 'account_approved' || type == 'account_rejected') {
      ctx.go('/');
      return;
    }

    if (type == 'rsvp' || type == 'waitlist_promotion') {
      final eid = data['eventId']?.toString();
      if (eid != null && eid.isNotEmpty) {
        ctx.go('/events/$eid');
        return;
      }
    }

    ctx.go('/notifications');
  }

  Future<void> syncTokenForUser(FirebaseFirestore firestore, String uid) async {
    if (!firebaseOptionsConfigured) return;

    await attachMessageHandlersOnce();

    try {
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      final ok =
          settings.authorizationStatus == AuthorizationStatus.authorized ||
              settings.authorizationStatus == AuthorizationStatus.provisional;
      if (!ok) {
        appLogger
            .w('FCM permission not granted: ${settings.authorizationStatus}');
        return;
      }

      final token = await FirebaseMessaging.instance.getToken();
      if (token == null || token.isEmpty) {
        appLogger.w('FCM getToken returned empty');
        return;
      }

      await _persistToken(firestore, uid, token);

      await _tokenRefreshSub?.cancel();
      _tokenRefreshSub = FirebaseMessaging.instance.onTokenRefresh.listen(
        (newToken) => unawaited(_persistToken(firestore, uid, newToken)),
        onError: (Object e, StackTrace st) {
          appLogger.w('FCM onTokenRefresh error', error: e, stackTrace: st);
        },
      );
    } catch (e, st) {
      appLogger.w('FCM sync failed', error: e, stackTrace: st);
    }
  }

  Future<void> _persistToken(
      FirebaseFirestore firestore, String uid, String token) async {
    try {
      await firestore.collection('users').doc(uid).set(
        {
          'fcmToken': token,
          'notificationPreferences.pushEnabled': true,
          'notificationPreferences.updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );
      appLogger.i('FCM token saved for user $uid');
    } catch (e, st) {
      appLogger.w('FCM token Firestore write failed', error: e, stackTrace: st);
    }
  }

  Future<void> disposeTokenRefresh() async {
    await _tokenRefreshSub?.cancel();
    _tokenRefreshSub = null;
  }
}




