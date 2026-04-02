import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:uuid/uuid.dart';

class MediaService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  /// Returns the public download URL after upload + Firestore write.
  Future<String> uploadMedia(File file, String type) async {
    final user = _auth.currentUser;
    if (user == null) throw Exception('User not logged in');

    final String id = const Uuid().v4();
    final String extension = file.path.split('.').last;
    final String fileName = '$id.$extension';
    final String path = 'media/${user.uid}/$fileName';

    // 1. Upload to Storage
    final ref = _storage.ref().child(path);
    final uploadTask = ref.putFile(file);
    final snapshot = await uploadTask;
    final String url = await snapshot.ref.getDownloadURL();

    // 2. Create Firestore Document
    await _db.collection('media').doc(id).set({
      'id': id,
      'url': url,
      'type': type,
      'uploadedBy': user.uid,
      'uploaderName': user.displayName ?? 'Mojo Mom',
      'createdAt': FieldValue.serverTimestamp(),
      'mediaDate': FieldValue.serverTimestamp(),
      'likes': [],
      'comments': [],
    });
    return url;
  }
}
