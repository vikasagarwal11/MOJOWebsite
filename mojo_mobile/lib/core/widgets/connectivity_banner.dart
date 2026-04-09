import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/connectivity_provider.dart';

/// Thin bar when the device reports no network (Wi‑Fi/mobile off).
/// DNS-only failures still show via [userFacingFirestoreMessage] on stream errors.
class ConnectivityBanner extends ConsumerWidget {
  const ConnectivityBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final onlineAsync = ref.watch(isOnlineProvider);
    return onlineAsync.when(
      data: (online) {
        if (online) return const SizedBox.shrink();
        return Material(
          color: Colors.amber.shade800,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Icon(Icons.wifi_off, color: Colors.amber.shade50, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'No network connection. MOJO needs internet to load data.',
                      style: TextStyle(color: Colors.amber.shade50, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}
