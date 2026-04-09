import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Renders a large heart icon centered on the parent that scales up and fades
/// out over 800 ms. Trigger the animation by flipping [trigger] to `true`.
class HeartAnimationOverlay extends StatefulWidget {
  /// Flip to `true` to fire the animation. Reset to `false` before the next
  /// trigger so the widget can detect the rising edge.
  final ValueNotifier<bool> trigger;

  /// Called when the animation finishes (scale-up + fade-out complete).
  final VoidCallback? onComplete;

  const HeartAnimationOverlay({
    super.key,
    required this.trigger,
    this.onComplete,
  });

  @override
  State<HeartAnimationOverlay> createState() => _HeartAnimationOverlayState();
}

class _HeartAnimationOverlayState extends State<HeartAnimationOverlay> {
  bool _visible = false;

  @override
  void initState() {
    super.initState();
    widget.trigger.addListener(_onTrigger);
  }

  @override
  void dispose() {
    widget.trigger.removeListener(_onTrigger);
    super.dispose();
  }

  void _onTrigger() {
    if (widget.trigger.value && !_visible) {
      setState(() => _visible = true);
    }
  }

  void _onAnimationComplete() {
    setState(() => _visible = false);
    widget.trigger.value = false;
    widget.onComplete?.call();
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible) return const SizedBox.shrink();

    return Center(
      child: const Icon(
        Icons.favorite,
        size: 80,
        color: Colors.white,
      )
          .animate(onComplete: (_) => _onAnimationComplete())
          .scale(
            begin: const Offset(0, 0),
            end: const Offset(1, 1),
            duration: 400.ms,
            curve: Curves.easeOut,
          )
          .then()
          .fadeOut(
            duration: 400.ms,
            curve: Curves.easeIn,
          ),
    );
  }
}
