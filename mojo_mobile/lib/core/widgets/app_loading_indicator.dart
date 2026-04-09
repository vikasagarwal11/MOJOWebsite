import 'package:flutter/material.dart';

class AppLoadingIndicator extends StatelessWidget {
  const AppLoadingIndicator({
    super.key,
    this.size = 34,
    this.color,
    this.strokeWidth,
  });

  final double size;
  final Color? color;
  final double? strokeWidth;

  @override
  Widget build(BuildContext context) {
    final tone = color ?? Theme.of(context).colorScheme.primary;
    final shortestSide = MediaQuery.sizeOf(context).shortestSide;
    final scale = (shortestSide / 390).clamp(0.90, 1.35);
    final effectiveSize = size * scale;

    return SizedBox(
      width: effectiveSize,
      height: effectiveSize,
      child: Image.asset(
        'assets/gif/loading.gif',
        width: effectiveSize,
        height: effectiveSize,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.medium,
        errorBuilder: (_, __, ___) => CircularProgressIndicator(
          strokeWidth: strokeWidth ?? (2 * scale),
          color: tone,
        ),
      ),
    );
  }
}
