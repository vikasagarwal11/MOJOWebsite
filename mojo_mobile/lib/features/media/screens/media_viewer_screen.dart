import 'dart:io';
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:photo_view/photo_view.dart';
import 'package:photo_view/photo_view_gallery.dart';
import 'package:share_plus/share_plus.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../../../core/theme/mojo_colors.dart';

class MediaViewerScreen extends StatefulWidget {
  final List<String> imageUrls;
  final int initialIndex;

  const MediaViewerScreen({
    super.key,
    required this.imageUrls,
    required this.initialIndex,
  });

  @override
  State<MediaViewerScreen> createState() => _MediaViewerScreenState();
}

class _MediaViewerScreenState extends State<MediaViewerScreen> {
  late int _currentIndex;
  bool _isSharing = false;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
  }

  Future<void> _shareCurrentMedia() async {
    setState(() => _isSharing = true);
    try {
      final url = widget.imageUrls[_currentIndex];
      
      // WhatsApp prefers raw files over text URLs. We download the image to temp.
      final response = await http.get(Uri.parse(url));
      final documentDirectory = await getTemporaryDirectory();
      
      // Extract extension natively or fallback
      final extension = url.contains('.mp4') ? 'mp4' : 'jpg';
      final file = File('${documentDirectory.path}/share_mojo_${DateTime.now().millisecondsSinceEpoch}.$extension');
      
      file.writeAsBytesSync(response.bodyBytes);

      // Trigger the native OS Share Sheet (WhatsApp, IG Stories, Facebook, etc.)
      await Share.shareXFiles([XFile(file.path)], text: 'Check out this moment on MOJO! 💥');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to Share')));
      }
    } finally {
      if (mounted) setState(() => _isSharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        actions: [
          if (_isSharing)
            const Padding(
              padding: EdgeInsets.all(16.0),
              child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: MojoColors.primaryOrange)),
            )
          else
            IconButton(
              icon: const Icon(Icons.share_outlined), 
              tooltip: 'Share to WhatsApp / Instagram',
              onPressed: _shareCurrentMedia
            ),
          IconButton(icon: const Icon(Icons.download_outlined), onPressed: () {}),
        ],
      ),
      body: PhotoViewGallery.builder(
        scrollPhysics: const BouncingScrollPhysics(),
        builder: (BuildContext context, int index) {
          return PhotoViewGalleryPageOptions(
            imageProvider: CachedNetworkImageProvider(widget.imageUrls[index]),
            initialScale: PhotoViewComputedScale.contained,
            heroAttributes: PhotoViewHeroAttributes(tag: 'media_$index'),
          );
        },
        itemCount: widget.imageUrls.length,
        loadingBuilder: (context, event) => const Center(
          child: CircularProgressIndicator(color: MojoColors.primaryOrange),
        ),
        pageController: PageController(initialPage: widget.initialIndex),
        onPageChanged: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
      ),
    );
  }
}
