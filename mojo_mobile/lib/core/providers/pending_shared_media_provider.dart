import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Paths or `https://` URLs from [ReceiveSharingIntent], consumed by [MediaScreen].
final pendingSharedMediaPathsProvider = StateProvider<List<String>?>((ref) => null);
