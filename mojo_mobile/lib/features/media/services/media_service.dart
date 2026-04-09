import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:uuid/uuid.dart';

/// Upload paths and `media` document fields align with the web app (`useUploader`, Media upload modal).
class MediaService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  String _normalizeFeedType(String type) {
    final t = type.toLowerCase();
    if (t == 'video' || t == 'reel') return 'video';
    return 'image';
  }

  bool _isVideo(String normalized) => normalized == 'video';

  static String _extFromPath(String path) {
    final parts = path.split('.');
    if (parts.length < 2) return 'jpg';
    final e = parts.last.toLowerCase();
    if (e.length > 8) return 'jpg';
    return e;
  }

  static String _contentType(String ext, {required bool video}) {
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'mp4':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'webm':
        return 'video/webm';
      default:
        return video ? 'video/mp4' : 'image/jpeg';
    }
  }

  /// Story ring only: Storage at `stories/{uid}/…` — no `media` document.
  Future<String> uploadStoryFile(File file, String type) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('User not logged in');

    final id = const Uuid().v4();
    final normalized = _normalizeFeedType(type);
    final ext = _extFromPath(file.path);
    final useExt = _isVideo(normalized)
        ? (ext == 'mov' || ext == 'webm' ? ext : 'mp4')
        : ext;
    final path = 'stories/${user.uid}/$id.$useExt';

    final ref = _storage.ref().child(path);
    final meta = SettableMetadata(
        contentType: _contentType(useExt, video: _isVideo(normalized)));
    final snap = await ref.putFile(file, meta);
    return snap.ref.getDownloadURL();
  }

  /// Community gallery: same Storage layout as web `media/{uid}/{batchId}/{fileName}` + `media` doc.
  Future<String> uploadFeedMedia(File file, String type,
      {String caption = ''}) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('User not logged in');

    final id = const Uuid().v4();
    final normalized = _normalizeFeedType(type);
    final ext = _extFromPath(file.path);
    final fileName = 'upload.$ext';
    final path = 'media/${user.uid}/$id/$fileName';
    final folder = path.substring(0, path.lastIndexOf('/') + 1);

    final ref = _storage.ref().child(path);
    final meta = SettableMetadata(
        contentType: _contentType(ext, video: _isVideo(normalized)));
    final snap = await ref.putFile(file, meta);
    final url = await snap.ref.getDownloadURL();

    final isVideo = _isVideo(normalized);
    const title = 'Mobile upload';

    await _db.collection('media').doc(id).set({
      'id': id,
      'title': title,
      'titleLower': title.toLowerCase(),
      'url': url,
      'thumbnailUrl': url,
      'type': normalized,
      'uploadedBy': user.uid,
      'uploaderName': user.displayName ?? 'Mojo Mom',
      'caption': caption,
      'createdAt': FieldValue.serverTimestamp(),
      'mediaDate': FieldValue.serverTimestamp(),
      'isPublic': true,
      'moderationStatus': 'pending',
      'requiresApproval': true,
      'moderationReason': 'Awaiting automated moderation review',
      'moderationDetectedIssues': <String>[],
      'moderationPipeline': 'auto_pending',
      'likesCount': 0,
      'commentsCount': 0,
      'viewsCount': 0,
      'filePath': path,
      'storageFolder': folder,
      'transcodeStatus': isVideo ? 'processing' : 'ready',
      'likes': <String>[],
      'comments': <dynamic>[],
      'isPhotoCapture': !isVideo,
    });

    return url;
  }

  /// Deletes a community gallery media item: removes the Firestore doc and the Storage file.
  Future<void> deleteFeedMedia(String mediaId, String filePath) async {
    await _db.collection('media').doc(mediaId).delete();
    await _storage.ref().child(filePath).delete();
  }

  /// Optional image on a post — Storage under `posts/{uid}/…`.
  Future<String> uploadPostImage(File file) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('User not logged in');

    final id = const Uuid().v4();
    var ext = _extFromPath(file.path);
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].contains(ext)) {
      ext = 'jpg';
    }
    final path = 'posts/${user.uid}/$id.$ext';

    final ref = _storage.ref().child(path);
    final meta = SettableMetadata(contentType: _contentType(ext, video: false));
    final snap = await ref.putFile(file, meta);
    return snap.ref.getDownloadURL();
  }
}
