import 'package:flutter/material.dart';

import '../../../core/theme/mojo_colors.dart';

/// A reusable animated expand/collapse section with a tappable header.
///
/// Displays a [title] with an optional [leadingIcon] and a rotating chevron
/// that indicates the current expanded/collapsed state. The [child] content
/// animates in/out with a smooth size transition.
///
/// **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
class CollapsibleSection extends StatefulWidget {
  const CollapsibleSection({
    super.key,
    required this.title,
    required this.child,
    this.initiallyExpanded = true,
    this.leadingIcon,
  });

  /// Header text displayed in the section bar.
  final String title;

  /// Content revealed when the section is expanded.
  final Widget child;

  /// Whether the section starts in the expanded state.
  final bool initiallyExpanded;

  /// Optional icon shown before the title text.
  final IconData? leadingIcon;

  @override
  State<CollapsibleSection> createState() => _CollapsibleSectionState();
}

class _CollapsibleSectionState extends State<CollapsibleSection>
    with SingleTickerProviderStateMixin {
  late bool _isExpanded;
  late AnimationController _controller;
  late Animation<double> _chevronTurns;

  @override
  void initState() {
    super.initState();
    _isExpanded = widget.initiallyExpanded;
    _controller = AnimationController(
      duration: const Duration(milliseconds: 250),
      vsync: this,
    );
    _chevronTurns = Tween<double>(begin: 0.0, end: 0.5).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );

    if (_isExpanded) _controller.value = 1.0;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _toggle() {
    setState(() {
      _isExpanded = !_isExpanded;
      if (_isExpanded) {
        _controller.forward();
      } else {
        _controller.reverse();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Header
        InkWell(
          onTap: _toggle,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                if (widget.leadingIcon != null) ...[
                  Icon(
                    widget.leadingIcon,
                    size: 20,
                    color: MojoColors.primaryOrange,
                  ),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Text(
                    widget.title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: MojoColors.textPrimary,
                        ),
                  ),
                ),
                RotationTransition(
                  turns: _chevronTurns,
                  child: const Icon(
                    Icons.expand_more,
                    color: MojoColors.primaryOrange,
                  ),
                ),
              ],
            ),
          ),
        ),

        // Animated content
        AnimatedSize(
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeInOut,
          alignment: Alignment.topCenter,
          child: _isExpanded
              ? Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: widget.child,
                )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }
}
