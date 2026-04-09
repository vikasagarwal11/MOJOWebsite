import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/logging/app_logger.dart';

/// Shares media as a downloaded file when possible (better for WhatsApp / IG than URL-only).
class SocialBridgeService {
  Future<void> shareMediaNatively(String url, String text) async {
    try {
      final response = await http.get(Uri.parse(url));
      if (response.statusCode != 200) {
        appLogger.w('shareMediaNatively: HTTP ${response.statusCode} for $url');
        await Share.share('$text\n\n$url');
        return;
      }
      final directory = await getTemporaryDirectory();
      final lower = url.toLowerCase();
      final ext = lower.contains('.mp4') || lower.contains('.mov') || lower.contains('.webm')
          ? 'mp4'
          : 'jpg';
      final file = File('${directory.path}/mojo_share_${DateTime.now().millisecondsSinceEpoch}.$ext');
      await file.writeAsBytes(response.bodyBytes);

      await Share.shareXFiles(
        [XFile(file.path)],
        text: text,
      );
    } catch (e, st) {
      appLogger.w('shareMediaNatively failed, falling back to link', error: e, stackTrace: st);
      await Share.share('$text\n\n$url');
    }
  }
}
