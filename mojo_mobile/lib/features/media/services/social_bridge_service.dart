import 'package:share_plus/share_plus.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'dart:io';

class SocialBridgeService {
  // NEXT-GEN: Share the actual FILE to WhatsApp/Instagram, not just a link
  Future<void> shareMediaNatively(String url, String text) async {
    try {
      // 1. Download the file locally first for high-quality sharing
      final response = await http.get(Uri.parse(url));
      final directory = await getTemporaryDirectory();
      final file = File('${directory.path}/mojo_share_media.jpg');
      await file.writeAsBytes(response.bodyBytes);

      // 2. Open native share sheet with the actual file
      await Share.shareXFiles(
        [XFile(file.path)],
        text: text,
      );
    } catch (e) {
      // Fallback to text link if file sharing fails
      await Share.share('$text \n\nCheck it out here: $url');
    }
  }

  // TODO: Implement "Pull from Social" logic using Instagram Graph API
  Future<void> syncFromInstagram() async {
    // This will hit the endpoint you configured in your web socialMediaService
    // and populate the local Firestore 'media' collection
  }
}
