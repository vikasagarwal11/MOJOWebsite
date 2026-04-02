import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/providers/core_providers.dart';
import '../../../data/models/mojo_user_profile.dart';
import '../../media/services/media_service.dart';

/// Create flow aligned with web CreatePostModal: pending moderation, same core fields.
class CreatePostSheet extends ConsumerStatefulWidget {
  const CreatePostSheet({super.key});

  @override
  ConsumerState<CreatePostSheet> createState() => _CreatePostSheetState();
}

class _CreatePostSheetState extends ConsumerState<CreatePostSheet> {
  final _title = TextEditingController();
  final _content = TextEditingController();
  final _imageUrl = TextEditingController();
  final _mediaService = MediaService();
  final _picker = ImagePicker();

  bool _isPublic = true;
  bool _submitting = false;
  String? _pickedImagePath;

  @override
  void dispose() {
    _title.dispose();
    _content.dispose();
    _imageUrl.dispose();
    super.dispose();
  }

  bool _canPost(MojoUserProfile? p, User? u) {
    if (u == null || p == null) return false;
    if (!p.isApproved) return false;
    final r = p.role ?? '';
    return r == 'member' || r == 'admin';
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final x = await _picker.pickImage(
        source: source,
        maxWidth: 1920,
        imageQuality: 85,
      );
      if (mounted) {
        setState(() {
          _pickedImagePath = x?.path;
        });
      }
    } catch (e, st) {
      appLogger.e('Post image pick failed', error: e, stackTrace: st);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not pick image: $e')),
        );
      }
    }
  }

  void _clearPickedImage() {
    setState(() => _pickedImagePath = null);
  }

  Future<void> _submit() async {
    final user = ref.read(authStateProvider).valueOrNull;
    final profile = user != null ? ref.read(userProfileProvider(user.uid)).valueOrNull : null;
    if (!_canPost(profile, user)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Only approved members can create posts.')),
        );
      }
      return;
    }

    final title = _title.text.trim();
    final content = _content.text.trim();
    final img = _imageUrl.text.trim();

    if (title.isEmpty || title.length > 100) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Title is required (max 100 characters).')),
      );
      return;
    }
    if (content.length < 10 || content.length > 2000) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Content must be 10–2000 characters.')),
      );
      return;
    }

    if (_pickedImagePath == null && img.isNotEmpty) {
      final u = Uri.tryParse(img);
      if (u == null || !u.hasScheme || !(u.scheme == 'http' || u.scheme == 'https')) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Image URL must be a valid http(s) link.')),
        );
        return;
      }
    }

    setState(() => _submitting = true);
    try {
      final authorName = profile?.displayName?.trim().isNotEmpty == true
          ? profile!.displayName!.trim()
          : (user!.displayName ?? user.email?.split('@').first ?? 'Member');
      final photo = profile?.photoUrl ?? user!.photoURL;

      String? imageField;
      if (_pickedImagePath != null) {
        imageField = await _mediaService.uploadPostImage(File(_pickedImagePath!));
      } else if (img.isNotEmpty) {
        imageField = img;
      }

      final data = <String, dynamic>{
        'title': title,
        'content': content,
        'authorId': user!.uid,
        'authorName': authorName,
        'isPublic': _isPublic,
        'moderationStatus': 'pending',
        'requiresApproval': true,
        'moderationReason': 'Awaiting automated moderation review',
        'moderationDetectedIssues': <dynamic>[],
        'moderationPipeline': 'auto_pending',
        'likes': <String>[],
        'comments': <dynamic>[],
        'likesCount': 0,
        'commentsCount': 0,
        'createdAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      };
      if (photo != null && photo.isNotEmpty) {
        data['authorPhoto'] = photo;
      }
      if (imageField != null && imageField.isNotEmpty) {
        data['imageUrl'] = imageField;
      }

      await ref.read(firestoreProvider).collection('posts').add(data);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e, st) {
      appLogger.e('Create post failed', error: e, stackTrace: st);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not create post: $e')));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authStateProvider).valueOrNull;
    final profile = user != null ? ref.watch(userProfileProvider(user.uid)).valueOrNull : null;
    final can = _canPost(profile, user);
    final scheme = Theme.of(context).colorScheme;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Text('New post', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const Spacer(),
                IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
              ],
            ),
            if (!can)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  user == null
                      ? 'Sign in to create posts.'
                      : 'Your account must be approved as a member to post (same as web).',
                  style: TextStyle(color: scheme.error),
                ),
              ),
            TextField(
              controller: _title,
              enabled: can && !_submitting,
              decoration: const InputDecoration(labelText: 'Title', border: OutlineInputBorder()),
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _content,
              enabled: can && !_submitting,
              decoration: const InputDecoration(
                labelText: 'Content',
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
              ),
              minLines: 4,
              maxLines: 8,
            ),
            const SizedBox(height: 12),
            Text(
              'Photo (optional)',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: scheme.onSurfaceVariant),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: can && !_submitting ? () => _pickImage(ImageSource.gallery) : null,
                  icon: const Icon(Icons.photo_library_outlined, size: 18),
                  label: const Text('Gallery'),
                ),
                OutlinedButton.icon(
                  onPressed: can && !_submitting ? () => _pickImage(ImageSource.camera) : null,
                  icon: const Icon(Icons.photo_camera_outlined, size: 18),
                  label: const Text('Camera'),
                ),
                if (_pickedImagePath != null)
                  TextButton.icon(
                    onPressed: _submitting ? null : _clearPickedImage,
                    icon: const Icon(Icons.clear, size: 18),
                    label: const Text('Clear photo'),
                  ),
              ],
            ),
            if (_pickedImagePath != null) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(
                  File(_pickedImagePath!),
                  height: 140,
                  width: double.infinity,
                  fit: BoxFit.cover,
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text(
                  'Uploaded photo is used instead of the URL below.',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _imageUrl,
              enabled: can && !_submitting && _pickedImagePath == null,
              decoration: InputDecoration(
                labelText: _pickedImagePath != null ? 'Image URL (disabled — photo attached)' : 'Or paste image URL',
                border: const OutlineInputBorder(),
              ),
              keyboardType: TextInputType.url,
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Public post'),
              subtitle: const Text('If off, only approved members see it in the member feed.'),
              value: _isPublic,
              onChanged: can && !_submitting ? (v) => setState(() => _isPublic = v) : null,
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: can && !_submitting ? _submit : null,
              child: _submitting
                  ? const SizedBox(height: 22, width: 22, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Submit for review'),
            ),
          ],
        ),
      ),
    );
  }
}
