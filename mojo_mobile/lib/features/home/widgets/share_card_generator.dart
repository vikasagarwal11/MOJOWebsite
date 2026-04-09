import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import '../../../core/theme/mojo_colors.dart';

class ShareCardGenerator extends StatelessWidget {
  final GlobalKey _globalKey = GlobalKey();

  ShareCardGenerator({super.key});

  Future<void> _captureAndShare() async {
    try {
      RenderRepaintBoundary boundary = _globalKey.currentContext!.findRenderObject() as RenderRepaintBoundary;
      ui.Image image = await boundary.toImage(pixelRatio: 3.0);
      final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      final pngBytes = byteData!.buffer.asUint8List();

      final directory = await getTemporaryDirectory();
      final imagePath = await File('${directory.path}/mojo_achievement.png').create();
      await imagePath.writeAsBytes(pngBytes);

      await Share.shareXFiles([XFile(imagePath.path)], text: 'Check out my Mojo Achievement! 🔥');
    } catch (e) {
      debugPrint('Share error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        RepaintBoundary(
          key: _globalKey,
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: MojoColors.mainGradient,
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.bolt, color: Colors.white, size: 60),
                SizedBox(height: 12),
                Text('MOJO STREAK', style: TextStyle(color: Colors.white70, fontSize: 14, letterSpacing: 2)),
                Text('12 DAYS', style: TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.bold)),
                SizedBox(height: 12),
                Text('momsfitnessmojo.com', style: TextStyle(color: Colors.white54, fontSize: 12)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        ElevatedButton.icon(
          onPressed: _captureAndShare,
          icon: const Icon(Icons.share),
          label: const Text('Share to WhatsApp'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.green.shade600,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ],
    );
  }
}
