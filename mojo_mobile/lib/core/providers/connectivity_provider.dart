import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Live connectivity updates (Wi‑Fi, mobile, ethernet, none, etc.).
final connectivityProvider = StreamProvider<List<ConnectivityResult>>((ref) async* {
  final connectivity = Connectivity();
  yield await connectivity.checkConnectivity();
  yield* connectivity.onConnectivityChanged;
});

/// True when any non-[ConnectivityResult.none] interface is present.
final isOnlineProvider = Provider<AsyncValue<bool>>((ref) {
  final async = ref.watch(connectivityProvider);
  return async.when(
    data: (results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      return AsyncValue.data(online);
    },
    loading: () => const AsyncValue<bool>.loading(),
    error: (_, __) => const AsyncValue<bool>.data(true),
  );
});
