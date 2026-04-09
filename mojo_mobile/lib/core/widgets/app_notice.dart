import 'dart:async';

import 'package:flutter/material.dart';

enum AppNoticeType { success, error, info, warning }

class AppNotice {
  static OverlayEntry? _activeEntry;
  static Timer? _autoHideTimer;
  static VoidCallback? _requestHide;

  static void success(BuildContext context, String message,
      {Duration duration = const Duration(seconds: 3)}) {
    _show(context, message, type: AppNoticeType.success, duration: duration);
  }

  static void error(BuildContext context, String message,
      {Duration duration = const Duration(seconds: 4)}) {
    _show(context, message, type: AppNoticeType.error, duration: duration);
  }

  static void info(BuildContext context, String message,
      {Duration duration = const Duration(seconds: 3)}) {
    _show(context, message, type: AppNoticeType.info, duration: duration);
  }

  static void warning(BuildContext context, String message,
      {Duration duration = const Duration(seconds: 4)}) {
    _show(context, message, type: AppNoticeType.warning, duration: duration);
  }

  static void _show(
    BuildContext context,
    String message, {
    required AppNoticeType type,
    required Duration duration,
  }) {
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) return;

    _autoHideTimer?.cancel();
    _requestHide?.call();
    _activeEntry?.remove();
    _activeEntry = null;

    final scheme = Theme.of(context).colorScheme;
    final (tone, icon, label) = switch (type) {
      AppNoticeType.success =>
        (const Color(0xFF2E8E4E), Icons.check_circle_rounded, 'Success'),
      AppNoticeType.error =>
        (const Color(0xFFC0392B), Icons.error_rounded, 'Error'),
      AppNoticeType.warning =>
        (const Color(0xFFD48A00), Icons.warning_rounded, 'Notice'),
      AppNoticeType.info => (scheme.primary, Icons.info_rounded, 'Info'),
    };

    final visible = ValueNotifier<bool>(false);
    var isClosing = false;

    void hide() {
      if (isClosing) return;
      isClosing = true;
      _autoHideTimer?.cancel();
      visible.value = false;
      Future<void>.delayed(const Duration(milliseconds: 220), () {
        if (_activeEntry != null) {
          _activeEntry?.remove();
          _activeEntry = null;
          _requestHide = null;
        }
        visible.dispose();
      });
    }

    _requestHide = hide;

    final entry = OverlayEntry(
      builder: (ctx) {
        return Positioned.fill(
          child: SafeArea(
            top: true,
            bottom: false,
            minimum: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Align(
              alignment: Alignment.topCenter,
              child: Material(
                color: Colors.transparent,
                child: ValueListenableBuilder<bool>(
                  valueListenable: visible,
                  builder: (_, isVisible, __) {
                    return AnimatedSlide(
                      duration: const Duration(milliseconds: 260),
                      curve: Curves.easeOutCubic,
                      offset: isVisible ? Offset.zero : const Offset(0, -0.25),
                      child: AnimatedOpacity(
                        duration: const Duration(milliseconds: 220),
                        opacity: isVisible ? 1 : 0,
                        child: Dismissible(
                          key: ValueKey<String>('app_notice_$message'),
                          direction: DismissDirection.horizontal,
                          onDismissed: (_) => hide(),
                          child: Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(14),
                              border:
                                  Border.all(color: tone.withValues(alpha: 0.22)),
                              boxShadow: <BoxShadow>[
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.12),
                                  blurRadius: 18,
                                  offset: const Offset(0, 8),
                                ),
                              ],
                            ),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10),
                            child: Row(
                              children: <Widget>[
                                Container(
                                  width: 28,
                                  height: 28,
                                  decoration: BoxDecoration(
                                    color: tone.withValues(alpha: 0.14),
                                    shape: BoxShape.circle,
                                  ),
                                  child: Icon(icon, size: 18, color: tone),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(
                                    '$label: $message',
                                    style: const TextStyle(
                                      fontSize: 13.5,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xFF2F2A27),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                GestureDetector(
                                  onTap: hide,
                                  child: Icon(
                                    Icons.close_rounded,
                                    size: 18,
                                    color: tone,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
        );
      },
    );

    _activeEntry = entry;
    overlay.insert(entry);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_isEntryCurrent(entry)) return;
      visible.value = true;
      _autoHideTimer = Timer(duration, hide);
    });
  }

  static bool _isEntryCurrent(OverlayEntry entry) =>
      identical(_activeEntry, entry);
}
