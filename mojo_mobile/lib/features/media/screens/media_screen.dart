import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:shimmer/shimmer.dart';
import 'package:image_picker/image_picker.dart';
import 'package:pro_image_editor/pro_image_editor.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/network/firebase_error_messages.dart';
import '../../../core/providers/pending_shared_media_provider.dart';
import '../../../core/theme/mojo_colors.dart';
import '../services/media_service.dart';
import '../widgets/instagram_import_sheet.dart';
import 'media_viewer_screen.dart';
import 'video_editor_screen.dart';

/// Aligns with website `media` docs: `type` (image | video | reel), optional `eventId`.
enum MediaGalleryFilter { all, images, videos, events }

class MediaScreen extends ConsumerStatefulWidget {
  const MediaScreen({super.key});

  @override
  ConsumerState<MediaScreen> createState() => _MediaScreenState();
}

class _MediaScreenState extends ConsumerState<MediaScreen> {
  final _mediaService = MediaService();
  final _picker = ImagePicker();
  bool _isUploading = false;
  File? _draftFile;
  MediaGalleryFilter _galleryFilter = MediaGalleryFilter.all;

  @override
  void initState() {
    super.initState();
    _checkDraft();
    WidgetsBinding.instance.addPostFrameCallback((_) => _takePendingShareIntent());
  }

  /// Drains [pendingSharedMediaPathsProvider] once (share from another app or same-tab update).
  void _takePendingShareIntent() {
    if (!mounted) return;
    final next = ref.read(pendingSharedMediaPathsProvider);
    if (next == null || next.isEmpty) return;
    ref.read(pendingSharedMediaPathsProvider.notifier).state = null;
    _processSharedPaths(next);
  }

  void _processSharedPaths(List<String> paths) {
    if (!mounted) return;
    if (paths.length > 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Opening the first of ${paths.length} shared items.')),
      );
    }
    final raw = paths.first.trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      _handleSharedUrl(raw);
      return;
    }
    final file = File(raw);
    if (!file.existsSync()) {
      appLogger.w('Shared file missing: $raw');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the shared file.')),
      );
      return;
    }
    _handleMediaSelection(overrideFile: file);
  }

  Future<void> _handleSharedUrl(String url) async {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (c) => const Center(child: CircularProgressIndicator(color: MojoColors.primaryOrange)),
    );
    try {
      final res = await http.get(Uri.parse(url));
      if (!mounted) return;
      Navigator.of(context).pop();
      if (res.statusCode != 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not download media (${res.statusCode}).')),
        );
        return;
      }
      final lower = url.toLowerCase();
      final looksVideo = lower.contains('.mp4') || lower.contains('.mov') || lower.contains('.webm');
      final tempDir = await getTemporaryDirectory();
      final ext = looksVideo ? 'mp4' : 'jpg';
      final file = File('${tempDir.path}/share_${DateTime.now().millisecondsSinceEpoch}.$ext');
      await file.writeAsBytes(res.bodyBytes);
      if (!mounted) return;
      if (looksVideo) {
        Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => VideoEditorScreen(file: file, onExport: _promptDestinations)),
        );
      } else {
        await _showAIProcessingDialog(file);
      }
    } catch (e, st) {
      appLogger.w('Shared URL load failed', error: e, stackTrace: st);
      if (mounted) {
        if (Navigator.of(context).canPop()) Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Download failed: $e')));
      }
    }
  }

  Future<void> _checkDraft() async {
    final docs = await getApplicationDocumentsDirectory();
    final draft = File('${docs.path}/unfinished_draft.jpg');
    if (await draft.exists()) {
      if (mounted) {
        setState(() {
          _draftFile = draft;
        });
      }
    }
  }

  Future<void> _saveDraft(File file) async {
    final docs = await getApplicationDocumentsDirectory();
    final draft = File('${docs.path}/unfinished_draft.jpg');
    await file.copy(draft.path);
    await _checkDraft();
  }

  Future<void> _clearDraft() async {
    if (_draftFile != null && await _draftFile!.exists()) {
      await _draftFile!.delete();
      if (mounted) {
        setState(() {
          _draftFile = null;
        });
      }
    }
  }

  /// Unsigned preset only (no API secret on device). Lock the preset in Cloudinary Console:
  /// signed uploads off, folder/format limits, max file size, allowed eager/transformations if needed.
  Future<File?> _applyCloudinaryAI(File imageFile, String transformation) async {
    final cloudName = dotenv.env['CLOUDINARY_CLOUD_NAME'] ?? '';
    final uploadPreset = dotenv.env['CLOUDINARY_UPLOAD_PRESET'] ?? '';
    if (cloudName.isEmpty || uploadPreset.isEmpty) return null;

    final url = Uri.parse('https://api.cloudinary.com/v1_1/$cloudName/image/upload');
    final request = http.MultipartRequest('POST', url)
      ..fields['upload_preset'] = uploadPreset
      ..files.add(await http.MultipartFile.fromPath('file', imageFile.path));

    final response = await request.send();
    if (response.statusCode == 200) {
      final responseData = await response.stream.bytesToString();
      final json = jsonDecode(responseData);
      String secureUrl = json['secure_url'];
      secureUrl = secureUrl.replaceFirst('/upload/', '/upload/$transformation/');
      final res = await http.get(Uri.parse(secureUrl));
      if (res.statusCode == 200) {
        final docs = await getApplicationDocumentsDirectory();
        final enhancedFile = File('${docs.path}/enhanced_${DateTime.now().millisecondsSinceEpoch}.jpg');
        await enhancedFile.writeAsBytes(res.bodyBytes);
        return enhancedFile;
      }
    }
    return null;
  }

  Future<void> _showAIProcessingDialog(File file) async {
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) {
        return AlertDialog(
          backgroundColor: Colors.black87,
          title: const Text('Apply AI Magic ✨', style: TextStyle(color: Colors.white)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.auto_fix_high, color: MojoColors.primaryOrange),
                title: const Text('AI Auto-Enhance', style: TextStyle(color: Colors.white)),
                onTap: () async {
                  Navigator.pop(context);
                  _processAI(file, 'e_improve');
                },
              ),
              ListTile(
                leading: const Icon(Icons.palette_outlined, color: MojoColors.primaryOrange),
                title: const Text('Boost colors', style: TextStyle(color: Colors.white)),
                subtitle: const Text('Saturation (Cloudinary)', style: TextStyle(color: Colors.white54, fontSize: 11)),
                onTap: () async {
                  Navigator.pop(context);
                  _processAI(file, 'e_saturation:35');
                },
              ),
              ListTile(
                leading: const Icon(Icons.arrow_forward, color: Colors.grey),
                title: const Text('Skip AI', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(context);
                  _openEditor(file);
                },
              ),
            ],
          ),
        );
      }
    );
  }

  Future<void> _processAI(File file, String transformation) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (c) => const Center(child: CircularProgressIndicator(color: MojoColors.primaryOrange)),
    );

    final result = await _applyCloudinaryAI(file, transformation);
    if (mounted) Navigator.pop(context);

    if (result != null) {
      await _saveDraft(result);
      _openEditor(result);
    } else {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('AI Processing failed.')));
      _openEditor(file);
    }
  }

  Future<void> _handleMediaSelection({File? overrideFile}) async {
    File targetFile;
    if (overrideFile != null) {
      targetFile = overrideFile;
    } else {
      final XFile? media = await _picker.pickMedia();
      if (media == null) return;
      targetFile = File(media.path);
    }

    if (!mounted) return;

    final String pathLC = targetFile.path.toLowerCase();
    if (pathLC.endsWith('.mp4') || pathLC.endsWith('.mov')) {
       Navigator.push(
         context, 
         MaterialPageRoute(builder: (_) => VideoEditorScreen(file: targetFile, onExport: _promptDestinations))
       );
       return;
    }
    
    if (overrideFile == null) await _saveDraft(targetFile);
    await _showAIProcessingDialog(targetFile);
  }

  void _promptDestinations(File file, String mediaType) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Share Destination', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 20),
                ListTile(
                  leading: const CircleAvatar(backgroundColor: MojoColors.primaryOrange, child: Icon(Icons.grid_on, color: Colors.white)),
                  title: const Text('Post to Feed'),
                  subtitle: const Text('Add to community gallery'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _uploadFinalMedia(file, mediaType, isStory: false);
                  },
                ),
                ListTile(
                  leading: const CircleAvatar(backgroundColor: Colors.purple, child: Icon(Icons.history_toggle_off, color: Colors.white)),
                  title: const Text('Add to Stories'),
                  subtitle: const Text('Disappears in 24 hours'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _uploadFinalMedia(file, mediaType, isStory: true);
                  },
                ),
              ],
            ),
          ),
        );
      }
    );
  }

  void _openEditor(File file) {
    if (!mounted) return;
    
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => ProImageEditor.file(
          file,
          callbacks: ProImageEditorCallbacks(
            onImageEditingComplete: (Uint8List bytes) async {
              Navigator.pop(context); // Close editor
              await _clearDraft();

              final tempDir = await getTemporaryDirectory();
              final timestamp = DateTime.now().millisecondsSinceEpoch;
              final finalFile = File('${tempDir.path}/export_$timestamp.jpg');
              await finalFile.writeAsBytes(bytes);

              _promptDestinations(finalFile, 'image');
            },
            onCloseEditor: (EditorMode _) {
              Navigator.pop(context);
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Editor closed. Use the yellow draft bar above to reopen your saved photo.',
                    ),
                  ),
                );
              }
            },
          ),
          configs: ProImageEditorConfigs(
            designMode: platformDesignMode,
            theme: ThemeData.dark().copyWith(
              scaffoldBackgroundColor: Colors.black,
              appBarTheme: const AppBarTheme(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
              ),
            ),
            filterEditor: FilterEditorConfigs(
              enabled: true,
              filterList: presetFiltersList,
            ),
            tuneEditor: const TuneEditorConfigs(enabled: true),
            blurEditor: const BlurEditorConfigs(enabled: true),
            stickerEditor: StickerEditorConfigs(
              enabled: true,
              builder: (setLayer, scrollController) {
                return GridView.count(
                  crossAxisCount: 3,
                  controller: scrollController,
                  padding: const EdgeInsets.all(16),
                  mainAxisSpacing: 16,
                  crossAxisSpacing: 16,
                  children: [
                    _buildMojoSticker(setLayer, '💪 Workout Crushed', Colors.orange),
                    _buildMojoSticker(setLayer, '🧘 Mom Life', Colors.purple),
                    _buildMojoSticker(setLayer, '☕ Coffee First', Colors.brown),
                  ],
                );
              },
            ),
            cropRotateEditor: const CropRotateEditorConfigs(
              aspectRatios: [
                AspectRatioItem(text: 'Feed (1:1)', value: 1.0),
                AspectRatioItem(text: 'Story (9:16)', value: 9.0 / 16.0),
              ],
            ),
          ),
        ),
      ),
    ).then((_) {
      _checkDraft();
    });
  }

  Widget _buildMojoSticker(void Function(WidgetLayer) setLayer, String text, Color color) {
    return GestureDetector(
      onTap: () {
        final stickerWidget = Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            color: color.withOpacity(0.9),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4)],
          ),
          child: Text(text, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
        );
        setLayer(WidgetLayer(widget: stickerWidget));
      },
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
          child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 12)),
        ),
      ),
    );
  }

  static bool _docMatchesFilter(Map<String, dynamic> data, MediaGalleryFilter filter) {
    if (filter == MediaGalleryFilter.all) return true;

    final type = (data['type'] as String?)?.toLowerCase().trim();
    final url = '${data['thumbnailUrl'] ?? data['url'] ?? ''}'.toLowerCase();

    bool isVideoDoc() {
      if (type == 'video' || type == 'reel') return true;
      if (data['isReel'] == true) return true;
      if (type == null || type.isEmpty) {
        return url.contains('.mp4') || url.contains('.mov') || url.contains('.webm') || url.contains('.m3u8');
      }
      return false;
    }

    bool isImageDoc() {
      if (type == 'image' || type == 'photo') return true;
      if (data['isPhotoCapture'] == true) return true;
      if (type == null || type.isEmpty) return !isVideoDoc();
      return false;
    }

    final rawEventId = data['eventId'];
    final hasEvent =
        rawEventId != null && rawEventId.toString().trim().isNotEmpty && rawEventId.toString().toLowerCase() != 'null';

    switch (filter) {
      case MediaGalleryFilter.all:
        return true;
      case MediaGalleryFilter.images:
        return isImageDoc() && !isVideoDoc();
      case MediaGalleryFilter.videos:
        return isVideoDoc();
      case MediaGalleryFilter.events:
        return hasEvent;
    }
  }

  Future<void> _uploadFinalMedia(File file, String mediaType, {required bool isStory}) async {
    setState(() => _isUploading = true);
    try {
      final user = FirebaseAuth.instance.currentUser;
      if (user == null) throw Exception('Not signed in');

      final String downloadUrl;
      if (isStory) {
        downloadUrl = await _mediaService.uploadStoryFile(file, mediaType);
        await FirebaseFirestore.instance.collection('stories').add({
          'userId': user.uid,
          'authorPhotoUrl': user.photoURL,
          'authorName': user.displayName ?? 'Mojo Mom',
          'url': downloadUrl,
          'mediaType': mediaType,
          'createdAt': FieldValue.serverTimestamp(),
          'expiresAt': DateTime.now().add(const Duration(hours: 24)).toIso8601String(),
        });
      } else {
        await _mediaService.uploadFeedMedia(file, mediaType);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(isStory ? 'Added to your Story! 📖' : 'Shared to Community Feed! ✨'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload failed: $e')));
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<List<String>?>(pendingSharedMediaPathsProvider, (previous, next) {
      if (next != null && next.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _takePendingShareIntent());
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Mojo Gallery', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          if (_isUploading)
            const Padding(
              padding: EdgeInsets.all(16.0),
              child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else ...[
            IconButton(
              tooltip: 'Import from Instagram',
              icon: const Icon(Icons.camera_alt_outlined, color: MojoColors.primaryOrange),
              onPressed: () {
                showInstagramImportSheet(
                  context,
                  onImported: (file, type) => _handleMediaSelection(overrideFile: file),
                );
              },
            ),
            IconButton(
              tooltip: 'Add from device',
              icon: const Icon(Icons.add_a_photo_outlined, color: MojoColors.primaryOrange),
              onPressed: () => _handleMediaSelection(),
            ),
          ],
        ],
      ),
      body: Column(
        children: [
          _MediaFilters(
            selected: _galleryFilter,
            onChanged: (f) => setState(() => _galleryFilter = f),
          ),
          if (_draftFile != null && !_isUploading)
            Material(
              color: Colors.amber.shade100,
              child: InkWell(
                onTap: () => _handleMediaSelection(overrideFile: _draftFile),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.file(
                          _draftFile!,
                          width: 64,
                          height: 64,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            width: 64,
                            height: 64,
                            color: Colors.orange.shade200,
                            child: const Icon(Icons.image_not_supported_outlined),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Photo draft on this device',
                              style: TextStyle(fontWeight: FontWeight.w600, color: Colors.deepOrange),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Tap this bar or Resume to open AI options & editor, then post to the feed.',
                              style: TextStyle(fontSize: 13, color: Colors.brown.shade800),
                            ),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: () => _handleMediaSelection(overrideFile: _draftFile),
                        child: const Text('Resume'),
                      ),
                      IconButton(
                        tooltip: 'Discard draft',
                        icon: const Icon(Icons.close, size: 22),
                        onPressed: _clearDraft,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance.collection('media').orderBy('createdAt', descending: true).snapshots(),
              builder: (context, snapshot) {
                if (snapshot.hasError) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(
                        userFacingFirestoreMessage(snapshot.error),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  );
                }
                if (snapshot.connectionState == ConnectionState.waiting) return _buildLoadingGrid();
                
                final docs = snapshot.data?.docs ?? [];
                if (docs.isEmpty) return _buildEmptyState();

                final filtered = docs
                    .where((doc) => _docMatchesFilter(doc.data() as Map<String, dynamic>, _galleryFilter))
                    .toList();

                if (filtered.isEmpty) return _buildEmptyFilterState(_galleryFilter);

                final List<String> imageUrls = filtered.map((doc) {
                  final data = doc.data() as Map<String, dynamic>;
                  return (data['thumbnailUrl'] ?? data['url'] ?? '') as String;
                }).where((url) => url.isNotEmpty).toList();

                if (imageUrls.isEmpty) return _buildEmptyFilterState(_galleryFilter);

                return GridView.builder(
                  padding: const EdgeInsets.all(8),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 4, mainAxisSpacing: 4),
                  itemCount: imageUrls.length,
                  itemBuilder: (context, index) => _MediaThumbnail(
                    index: index,
                    imageUrl: imageUrls[index],
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => MediaViewerScreen(imageUrls: imageUrls, initialIndex: index))),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingGrid() {
    return GridView.builder(
      padding: const EdgeInsets.all(8),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 4,
        mainAxisSpacing: 4,
      ),
      itemCount: 12,
      itemBuilder: (context, index) => Shimmer.fromColors(
        baseColor: Colors.grey[300]!,
        highlightColor: Colors.grey[100]!,
        child: Container(color: Colors.white),
      ),
    );
  }

  Widget _buildEmptyState() {
    final signedIn = FirebaseAuth.instance.currentUser != null;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.photo_library_outlined, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            const Text('No photos or videos here yet', style: TextStyle(color: Colors.grey, fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(
              'Use + to upload. After editing, choose Post to Feed so it is saved to the gallery.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey.shade600, fontSize: 14),
            ),
            if (signedIn) ...[
              const SizedBox(height: 12),
              Text(
                'Only approved posts are visible to everyone. You should still see your own uploads while they are pending review.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyFilterState(MediaGalleryFilter filter) {
    String title;
    String subtitle;
    switch (filter) {
      case MediaGalleryFilter.images:
        title = 'No photos yet';
        subtitle = 'Switch to All or upload an image to the feed.';
        break;
      case MediaGalleryFilter.videos:
        title = 'No videos yet';
        subtitle = 'Switch to All or share a video from the gallery.';
        break;
      case MediaGalleryFilter.events:
        title = 'No event media';
        subtitle = 'Event-tagged uploads from the website appear here.';
        break;
      case MediaGalleryFilter.all:
        title = 'Nothing to show';
        subtitle = '';
    }
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.filter_alt_outlined, size: 56, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text(title, style: const TextStyle(color: Colors.grey, fontSize: 18, fontWeight: FontWeight.w600)),
            if (subtitle.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(subtitle, textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
            ],
          ],
        ),
      ),
    );
  }
}

class _MediaFilters extends StatelessWidget {
  const _MediaFilters({required this.selected, required this.onChanged});

  final MediaGalleryFilter selected;
  final ValueChanged<MediaGalleryFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 50,
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _FilterChip(
            label: 'All',
            selected: selected == MediaGalleryFilter.all,
            onSelected: () => onChanged(MediaGalleryFilter.all),
          ),
          _FilterChip(
            label: 'Images',
            selected: selected == MediaGalleryFilter.images,
            onSelected: () => onChanged(MediaGalleryFilter.images),
          ),
          _FilterChip(
            label: 'Videos',
            selected: selected == MediaGalleryFilter.videos,
            onSelected: () => onChanged(MediaGalleryFilter.videos),
          ),
          _FilterChip(
            label: 'Events',
            selected: selected == MediaGalleryFilter.events,
            onSelected: () => onChanged(MediaGalleryFilter.events),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onSelected(),
        backgroundColor: Colors.white,
        selectedColor: MojoColors.primaryOrange.withOpacity(0.1),
        checkmarkColor: MojoColors.primaryOrange,
        labelStyle: TextStyle(
          color: selected ? MojoColors.primaryOrange : MojoColors.textSecondary,
          fontWeight: selected ? FontWeight.bold : FontWeight.normal,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
    );
  }
}

class _MediaThumbnail extends StatelessWidget {
  final int index;
  final String imageUrl;
  final VoidCallback onTap;
  const _MediaThumbnail({required this.index, required this.imageUrl, required this.onTap});
  @override 
  Widget build(BuildContext context) { 
    return InkWell(
      onTap: onTap,
      child: Hero(
        tag: 'media_$index',
        child: CachedNetworkImage(
          imageUrl: imageUrl,
          fit: BoxFit.cover,
          placeholder: (context, url) => Shimmer.fromColors(
            baseColor: Colors.grey[300]!,
            highlightColor: Colors.grey[100]!,
            child: Container(color: Colors.white),
          ),
          errorWidget: (context, url, error) => Container(
            color: Colors.grey.shade100,
            child: const Icon(Icons.broken_image_outlined, color: Colors.grey),
          ),
        ),
      ),
    ).animate().fadeIn(delay: (index * 20).ms).scale(duration: 250.ms, curve: Curves.easeOut);
  }
}
