import 'package:flutter/material.dart';

/// Animated overlay that shows payment success (checkmark + amount) or
/// error (X icon + message), then auto-dismisses after [displayDuration].
///
/// **Validates: Requirements 9.1, 9.2**
class PaymentStatusAnimation extends StatefulWidget {
  const PaymentStatusAnimation({
    super.key,
    required this.isSuccess,
    required this.message,
    this.amountCents,
    this.displayDuration = const Duration(seconds: 3),
    this.onDismissed,
  });

  /// `true` for a success animation, `false` for an error animation.
  final bool isSuccess;

  /// Text shown below the icon (e.g. "Payment successful" or error reason).
  final String message;

  /// If non-null, displayed as a formatted dollar amount on success.
  final int? amountCents;

  /// How long the widget stays visible before fading out.
  final Duration displayDuration;

  /// Called after the fade-out animation completes.
  final VoidCallback? onDismissed;

  @override
  State<PaymentStatusAnimation> createState() => _PaymentStatusAnimationState();
}

class _PaymentStatusAnimationState extends State<PaymentStatusAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _opacity;
  bool _dismissed = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 400),
      vsync: this,
    );
    _opacity = CurvedAnimation(parent: _controller, curve: Curves.easeInOut);

    // Fade in, wait, then fade out.
    _controller.forward().then((_) async {
      await Future.delayed(widget.displayDuration);
      if (!mounted || _dismissed) return;
      await _controller.reverse();
      if (mounted && !_dismissed) {
        _dismissed = true;
        widget.onDismissed?.call();
      }
    });
  }

  @override
  void dispose() {
    _dismissed = true;
    _controller.dispose();
    super.dispose();
  }

  String _formatAmount(int cents) {
    final dollars = (cents / 100).toStringAsFixed(2);
    return '\$$dollars';
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.isSuccess ? Colors.green : Colors.red;
    final icon = widget.isSuccess ? Icons.check_circle : Icons.cancel;

    return FadeTransition(
      opacity: _opacity,
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 32),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: color.withOpacity(0.15),
                blurRadius: 20,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 56, color: color),
              const SizedBox(height: 12),
              if (widget.isSuccess && widget.amountCents != null) ...[
                Text(
                  _formatAmount(widget.amountCents!),
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
                const SizedBox(height: 4),
              ],
              Text(
                widget.message,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: color.shade700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
