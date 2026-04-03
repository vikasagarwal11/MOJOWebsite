import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/core_providers.dart';
import '../services/push_notification_service.dart';

/// After Firebase init, registers FCM for the signed-in user (same backend contract as web).
class FcmBootstrap extends ConsumerStatefulWidget {
  const FcmBootstrap({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<FcmBootstrap> createState() => _FcmBootstrapState();
}

class _FcmBootstrapState extends ConsumerState<FcmBootstrap> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(PushNotificationService.instance.attachMessageHandlersOnce());
      final user = ref.read(authStateProvider).valueOrNull;
      if (user != null) {
        unawaited(
          PushNotificationService.instance.syncTokenForUser(
            ref.read(firestoreProvider),
            user.uid,
          ),
        );
      }
    });

    ref.listenManual<AsyncValue<User?>>(authStateProvider, (previous, next) {
      final user = next.valueOrNull;
      if (user != null) {
        unawaited(
          PushNotificationService.instance.syncTokenForUser(
            ref.read(firestoreProvider),
            user.uid,
          ),
        );
      } else {
        unawaited(PushNotificationService.instance.disposeTokenRefresh());
      }
    });
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
