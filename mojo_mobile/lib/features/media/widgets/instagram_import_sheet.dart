import 'dart:io';

import 'package:flutter/material.dart';

import '../../../core/theme/mojo_colors.dart';
import '../services/instagram_media_service.dart';

/// Bottom sheet: paste a Graph API user token, list recent posts, import one into the gallery flow.
Future<void> showInstagramImportSheet(
  BuildContext context, {
  required void Function(File file, String mediaType) onImported,
}) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.grey.shade900,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) => _InstagramImportBody(onImported: onImported),
  );
}

class _InstagramImportBody extends StatefulWidget {
  const _InstagramImportBody({required this.onImported});

  final void Function(File file, String mediaType) onImported;

  @override
  State<_InstagramImportBody> createState() => _InstagramImportBodyState();
}

class _InstagramImportBodyState extends State<_InstagramImportBody> {
  final _tokenController = TextEditingController();
  final _service = InstagramMediaService();
  List<InstagramMediaItem> _items = [];
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _tokenController.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
      _items = [];
    });
    try {
      final list = await _service.fetchRecentMedia(_tokenController.text);
      if (!mounted) return;
      setState(() {
        _items = list;
        _loading = false;
        if (list.isEmpty) _error = 'No media returned. For carousel posts, use a token with the right scopes.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  Future<void> _onTapItem(InstagramMediaItem item) async {
    final url = item.mediaUrl;
    if (url == null || url.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('This item has no direct URL (e.g. carousel). Open it in Instagram.')),
        );
      }
      return;
    }

    final isVideo = item.mediaType.toUpperCase() == 'VIDEO';
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (c) => const Center(child: CircularProgressIndicator(color: MojoColors.primaryOrange)),
    );

    try {
      final file = await _service.downloadMedia(url, video: isVideo);
      if (!mounted) return;
      Navigator.of(context).pop();
      Navigator.of(context).pop();
      widget.onImported(file, isVideo ? 'video' : 'image');
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Import failed: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height * 0.88;
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, bottom + 16),
      child: SizedBox(
        height: h,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const Text(
              'Import from Instagram',
              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Uses Instagram Graph (graph.instagram.com). Create a Meta app, add a test user, '
              'then generate a short‑lived user token with instagram_graph_user_media (or Basic Display equivalent). '
              'Do not ship long‑lived tokens inside the app — prefer server-side OAuth for production.',
              style: TextStyle(color: Colors.grey.shade400, fontSize: 12, height: 1.35),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _tokenController,
              obscureText: true,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'User access token',
                labelStyle: TextStyle(color: Colors.grey.shade400),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.grey.shade600)),
                focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: MojoColors.primaryOrange)),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _loading ? null : _fetch,
              style: FilledButton.styleFrom(backgroundColor: MojoColors.primaryOrange),
              child: _loading
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Load my recent media'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
            ],
            const SizedBox(height: 12),
            Expanded(
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  crossAxisSpacing: 6,
                  mainAxisSpacing: 6,
                ),
                itemCount: _items.length,
                itemBuilder: (context, i) {
                  final item = _items[i];
                  final thumb = item.previewUrl;
                  return Material(
                    color: Colors.white12,
                    borderRadius: BorderRadius.circular(8),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => _onTapItem(item),
                      child: thumb == null || thumb.isEmpty
                          ? Center(
                              child: Text(
                                item.mediaType,
                                textAlign: TextAlign.center,
                                style: const TextStyle(color: Colors.white54, fontSize: 11),
                              ),
                            )
                          : Image.network(
                              thumb,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Icon(Icons.broken_image, color: Colors.white38),
                            ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
