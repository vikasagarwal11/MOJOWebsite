import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../branding/platform_branding.dart';

ThemeData buildMojoTheme(PlatformBranding b) {
  final scheme = ColorScheme.fromSeed(
    seedColor: b.primary,
    primary: b.primary,
    secondary: b.secondary,
    surface: b.surface,
    brightness: Brightness.light,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: b.background,
    textTheme: GoogleFonts.poppinsTextTheme(),
    appBarTheme: AppBarTheme(
      elevation: 0,
      centerTitle: true,
      backgroundColor: Colors.transparent,
      foregroundColor: scheme.onSurface,
    ),
    navigationBarTheme: NavigationBarThemeData(
      labelTextStyle: WidgetStateProperty.all(
        const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: b.primary,
      foregroundColor: Colors.white,
    ),
  );
}
