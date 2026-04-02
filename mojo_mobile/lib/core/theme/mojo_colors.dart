import 'package:flutter/material.dart';

class MojoColors {
  // Brand Colors synced with Web Version
  static const primaryOrange = Color(0xFFF25129);
  static const primaryPurple = Color(0xFF8B5CF6);
  static const primaryPink = Color(0xFFEC4899);
  
  // Neutral Colors
  static const background = Color(0xFFFAFAFA);
  static const surface = Colors.white;
  static const textPrimary = Color(0xFF1F2937);
  static const textSecondary = Color(0xFF6B7280);
  
  // Gradients
  static const mainGradient = LinearGradient(
    colors: [primaryOrange, primaryPink],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const purpleGradient = LinearGradient(
    colors: [primaryPurple, Color(0xFFA78BFA)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}
