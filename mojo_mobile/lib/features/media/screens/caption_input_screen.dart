import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/mojo_colors.dart';
import '../providers/feed_paginator_provider.dart';
import '../services/media_service.dart';

/// Screen shown after media editing where the user can add a caption
/// before uploading to the community feed.
///
/// Accepts a [file], [mediaType], and optional [isStory] flag.
class CaptionInputScreen extends ConsumerStatefulWidget {
  final File file;
  final String mediaType;
  final bool isStory;

  const CaptionInputScreen({
    super.key,
    required this.file,
    required this.mediaType,
    this.isStory = false,
  });

  @override
  ConsumerState<CaptionInputScreen> createState() => _CaptionInputScreenState();
}

class _CaptionInputScreenState extends ConsumerState<CaptionInputScreen> {
  final _captionController = TextEditingController();
  final _mediaService = MediaService();
  bool _isUploading = false;

  @override
  void dispose() {
    _captionController.dispose();
    super.dispose();
  }

  Future<void> _onPost() async {
    if (_isUploading) return;

    setState(() => _isUploading = true);

    try {
      await _mediaService.uploadFeedMedia(
        widget.file,
        widget.mediaType,
        caption: _captionController.text.trim(),
      );

      // Refresh the feed so the new post appears
      ref.read(feedPaginatorProvider.notifier).refresh();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Post uploaded successfully!')),
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isUploading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isImage = widget.mediaType.toLowerCase() == 'image';

    return Scaffold(
      appBar: AppBar(
        title: const Text('New Post'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Media preview
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    // Preview
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: isImage
                          ? Image.file(
                              widget.file,
                              width: double.infinity,
                              fit: BoxFit.cover,
                            )
                          : Container(
                              width: double.infinity,
                              height: 250,
                              decoration: BoxDecoration(
                                color: Colors.grey.shade200,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.videocam,
                                      size: 48, color: Colors.grey),
                                  SizedBox(height: 8),
                                  Text(
                                    'Video preview',
                                    style: TextStyle(color: Colors.grey),
                                  ),
                                ],
                              ),
                            ),
                    ),
                    const SizedBox(height: 16),

                    // Caption field
                    TextField(
                      controller: _captionController,
                      maxLength: 2200,
                      maxLines: null,
                      minLines: 3,
                      textInputAction: TextInputAction.newline,
                      decoration: InputDecoration(
                        hintText: 'Write a caption...',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide(color: Colors.grey.shade300),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide:
                              const BorderSide(color: MojoColors.primaryOrange),
                        ),
                        contentPadding: const EdgeInsets.all(14),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Post button
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: SizedBox(
                width: double.infinity,
                height: 48,
                child: FilledButton(
                  onPressed: _isUploading ? null : _onPost,
                  style: FilledButton.styleFrom(
                    backgroundColor: MojoColors.primaryOrange,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: _isUploading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.5,
                            color: Colors.white,
                          ),
                        )
                      : const Text(
                          'Post',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
