import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../../../core/logging/app_logger.dart';

/// Instagram Graph ([graph.instagram.com]) — requires a valid user access token from a Meta app
/// (Basic Display or Instagram API with appropriate permissions). Tokens must not be committed to git.
class InstagramMediaItem {
  const InstagramMediaItem({
    required this.id,
    required this.mediaType,
    this.mediaUrl,
    this.thumbnailUrl,
  });

  final String id;
  final String mediaType;
  final String? mediaUrl;
  final String? thumbnailUrl;

  String? get previewUrl => thumbnailUrl ?? mediaUrl;
}

class InstagramMediaService {
  static const _base = 'https://graph.instagram.com/me/media';

  /// Fetches the first page of the authenticated user's media.
  Future<List<InstagramMediaItem>> fetchRecentMedia(String accessToken, {int limit = 25}) async {
    final trimmed = accessToken.trim();
    if (trimmed.isEmpty) return [];

    final uri = Uri.parse(_base).replace(queryParameters: {
      'fields': 'id,media_type,media_url,thumbnail_url,timestamp',
      'limit': '$limit',
      'access_token': trimmed,
    });

    final response = await http.get(uri);
    if (response.statusCode != 200) {
      appLogger.w(
        'Instagram Graph error: ${response.statusCode} ${response.body.length > 200 ? response.body.substring(0, 200) : response.body}',
      );
      throw InstagramApiException(
        'Instagram returned ${response.statusCode}. Check the token and app permissions.',
      );
    }

    final dynamic decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) return [];
    final data = decoded['data'];
    if (data is! List) return [];

    final out = <InstagramMediaItem>[];
    for (final item in data) {
      if (item is! Map<String, dynamic>) continue;
      final id = item['id']?.toString();
      final type = item['media_type']?.toString() ?? '';
      if (id == null || id.isEmpty) continue;
      out.add(
        InstagramMediaItem(
          id: id,
          mediaType: type,
          mediaUrl: item['media_url']?.toString(),
          thumbnailUrl: item['thumbnail_url']?.toString(),
        ),
      );
    }
    return out;
  }

  /// Downloads remote media to a temp file for editing / upload.
  Future<File> downloadMedia(String url, {required bool video}) async {
    final res = await http.get(Uri.parse(url));
    if (res.statusCode != 200) {
      throw InstagramApiException('Download failed (${res.statusCode})');
    }
    final dir = await getTemporaryDirectory();
    final ext = video ? 'mp4' : 'jpg';
    final file = File('${dir.path}/ig_${DateTime.now().millisecondsSinceEpoch}.$ext');
    await file.writeAsBytes(res.bodyBytes);
    return file;
  }
}

class InstagramApiException implements Exception {
  InstagramApiException(this.message);
  final String message;

  @override
  String toString() => message;
}
