import 'package:flutter/material.dart';
import '../../../core/theme/mojo_colors.dart';

class MediaScreen extends StatelessWidget {
  const MediaScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Media', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: Center(
        child: Text(
          'Photos & videos coming soon',
          style: TextStyle(color: MojoColors.textSecondary),
        ),
      ),
    );
  }
}
