import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../theme/mojo_colors.dart';

/// Live theme + copy from Firestore `platform_branding/default` (public read).
/// Falls back to [PlatformBranding.fallback] when missing or invalid.
class PlatformBranding {
  const PlatformBranding({
    required this.primary,
    required this.secondary,
    required this.accent,
    required this.background,
    required this.surface,
    required this.appDisplayName,
    this.tagline,
  });

  final Color primary;
  final Color secondary;
  final Color accent;
  final Color background;
  final Color surface;
  final String appDisplayName;
  final String? tagline;

  static const PlatformBranding fallback = PlatformBranding(
    primary: MojoColors.primaryOrange,
    secondary: MojoColors.primaryPurple,
    accent: MojoColors.primaryPink,
    background: MojoColors.background,
    surface: MojoColors.surface,
    appDisplayName: 'Mom Fitness Mojo',
    tagline: 'Stronger together',
  );

  static PlatformBranding fromSnapshot(DocumentSnapshot<Map<String, dynamic>> snap) {
    const fb = PlatformBranding.fallback;
    if (!snap.exists || snap.data() == null) return fb;
    final m = snap.data()!;
    return PlatformBranding(
      primary: _parseColor(m['primaryHex'] as String?, fb.primary),
      secondary: _parseColor(m['secondaryHex'] as String?, fb.secondary),
      accent: _parseColor(m['accentHex'] as String?, fb.accent),
      background: _parseColor(m['backgroundHex'] as String?, fb.background),
      surface: _parseColor(m['surfaceHex'] as String?, fb.surface),
      appDisplayName: (m['appDisplayName'] as String?)?.trim().isNotEmpty == true
          ? m['appDisplayName'] as String
          : fb.appDisplayName,
      tagline: m['tagline'] as String?,
    );
  }

  static Color _parseColor(String? hex, Color fallback) {
    if (hex == null || hex.isEmpty) return fallback;
    var s = hex.trim();
    if (s.startsWith('#')) s = s.substring(1);
    if (s.length == 6) s = 'FF$s';
    if (s.length != 8) return fallback;
    final v = int.tryParse(s, radix: 16);
    if (v == null) return fallback;
    return Color(v);
  }

  LinearGradient get heroGradient => LinearGradient(
        colors: [primary, accent],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
}
