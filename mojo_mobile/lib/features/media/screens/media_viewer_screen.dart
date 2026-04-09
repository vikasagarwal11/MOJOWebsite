import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:photo_view/photo_view.dart';
import 'package:photo_view/photo_view_gallery.dart';

import '../../../core/theme/mojo_colors.dart';
import '../services/social_bridge_service.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

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
  final _socialBridge = SocialBridgeService();

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
  }

  Future<void> _shareCurrentMedia() async {
    setState(() => _isSharing = true);
    try {
      final url = widget.imageUrls[_currentIndex];
      await _socialBridge.shareMediaNatively(url, 'Check out this moment on MOJO!');
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
              child: SizedBox(width: 20, height: 20, child: AppLoadingIndicator(strokeWidth: 2, color: MojoColors.primaryOrange)),
            )
          else
            IconButton(
              icon: const Icon(Icons.share_outlined),
              tooltip: 'Share (file when possible)',
              onPressed: _shareCurrentMedia,
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
          child: AppLoadingIndicator(color: MojoColors.primaryOrange),
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

