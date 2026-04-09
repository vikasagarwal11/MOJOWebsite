import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Reusable floating bottom navigation bar with a glassmorphism effect.
class FloatingGlassNavBar extends StatelessWidget {
  const FloatingGlassNavBar({
    super.key,
    required this.currentIndex,
    required this.items,
    required this.onTap,
  });

  final int currentIndex;
  final List<FloatingNavItem> items;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool isDark = theme.brightness == Brightness.dark;
    final ColorScheme scheme = theme.colorScheme;

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double horizontalPadding = constraints.maxWidth < 420 ? 16 : 26;
        final double bottomInset = MediaQuery.of(context).viewPadding.bottom;

        return Padding(
          padding: EdgeInsets.fromLTRB(
            horizontalPadding,
            0,
            horizontalPadding,
            10 + bottomInset,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: (isDark ? Colors.white : scheme.surface)
                      .withValues(alpha: isDark ? 0.12 : 0.16),
                  borderRadius: BorderRadius.circular(28),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: isDark ? 0.18 : 0.30),
                    width: 1,
                  ),
                  boxShadow: <BoxShadow>[
                    BoxShadow(
                      color:
                          Colors.black.withValues(alpha: isDark ? 0.30 : 0.10),
                      blurRadius: 24,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: List<Widget>.generate(items.length, (int index) {
                      final bool selected = index == currentIndex;
                      return _GlassNavButton(
                        item: items[index],
                        selected: selected,
                        onTap: () {
                          HapticFeedback.lightImpact();
                          onTap(index);
                        },
                      );
                    }),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class FloatingNavItem {
  const FloatingNavItem({
    required this.label,
    required this.cupertinoIcon,
    required this.materialIcon,
    this.assetIconPath,
  });

  final String label;
  final IconData cupertinoIcon;
  final IconData materialIcon;
  final String? assetIconPath;
}

class _GlassNavButton extends StatelessWidget {
  const _GlassNavButton({
    required this.item,
    required this.selected,
    required this.onTap,
  });

  final FloatingNavItem item;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme scheme = theme.colorScheme;
    final bool isCupertinoPlatform = theme.platform == TargetPlatform.iOS ||
        theme.platform == TargetPlatform.macOS;
    final IconData icon =
        isCupertinoPlatform ? item.cupertinoIcon : item.materialIcon;

    return Semantics(
      label: item.label,
      button: true,
      selected: selected,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: onTap,
        child: AnimatedScale(
          scale: 1.0,
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: selected
                  ? scheme.primary.withValues(alpha: 0.22)
                  : Colors.transparent,
              shape: BoxShape.circle,
              boxShadow: selected
                  ? <BoxShadow>[
                      BoxShadow(
                        color: scheme.primary.withValues(alpha: 0.42),
                        blurRadius: 16,
                        spreadRadius: 0.3,
                      ),
                    ]
                  : const <BoxShadow>[],
            ),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              transitionBuilder: (Widget child, Animation<double> animation) {
                return ScaleTransition(scale: animation, child: child);
              },
              child: item.assetIconPath != null
                  ? Image.asset(
                      item.assetIconPath!,
                      key: ValueKey<String>('${item.label}-$selected'),
                      width: 22,
                      height: 22,
                    )
                  : Icon(
                      icon,
                      key: ValueKey<String>('${item.label}-$selected'),
                      size: 22,
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

