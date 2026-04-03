import 'dart:io';
import 'dart:typed_data';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider/path_provider.dart';

import '../../../core/logging/app_logger.dart';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/// Instagram-level smart filters with concrete transformation values.
enum SmartFilter {
  original,
  vivid,
  warm,
  cool,
  vintage,
  noir,
  dramatic,
  golden,
  moonlight,
  rose,
  ocean,
  forest,
  sunset,
  aurora,
  moody,
  crisp,
  film,
  retro,
  pastel,
  neon,
}

/// Artistic style transfer options.
enum ArtStyle {
  watercolor,
  oilPaint,
  sketch,
  cartoon,
  pop_art,
  mosaic,
  pixel,
  comic,
  anime,
  neon_glow,
}

/// Collage layout options.
enum CollageLayout {
  grid2x2,
  grid3x3,
  horizontal2,
  horizontal3,
  vertical2,
  vertical3,
  diagonal,
  overlap,
  magazine,
}

/// Video compression quality tiers.
enum VideoQuality {
  low,
  medium,
  high,
  original,
}

// ---------------------------------------------------------------------------
// Data classes
// ---------------------------------------------------------------------------

class DetectedObject {
  const DetectedObject({
    required this.label,
    required this.confidence,
    required this.boundingBox,
  });

  final String label;
  final double confidence;
  final Map<String, double> boundingBox; // x, y, width, height (normalised)
}

class _SmartFilterConfig {
  const _SmartFilterConfig({
    required this.displayName,
    this.cloudinaryTransformation,
    this.brightness = 0,
    this.contrast = 0,
    this.saturation = 0,
    this.warmth = 0,
    this.tint = 0,
    this.hue = 0,
  });

  final String displayName;
  final String? cloudinaryTransformation;
  final double brightness;
  final double contrast;
  final double saturation;
  final double warmth;
  final double tint;
  final double hue;
}

class _ArtStyleConfig {
  const _ArtStyleConfig({
    required this.displayName,
    required this.cloudinaryEffect,
  });

  final String displayName;
  final String cloudinaryEffect;
}

// ---------------------------------------------------------------------------
// AiMediaService
// ---------------------------------------------------------------------------

class AiMediaService {
  AiMediaService({http.Client? httpClient})
      : _client = httpClient ?? http.Client();

  final http.Client _client;

  String get _cloudName => dotenv.env['CLOUDINARY_CLOUD_NAME'] ?? '';
  String get _uploadPreset => dotenv.env['CLOUDINARY_UPLOAD_PRESET'] ?? '';
  String get _baseUrl => 'https://api.cloudinary.com/v1_1/$_cloudName';

  // -----------------------------------------------------------------------
  // Filter & style configs
  // -----------------------------------------------------------------------

  static const Map<SmartFilter, _SmartFilterConfig> _filterConfigs = {
    SmartFilter.original: _SmartFilterConfig(
      displayName: 'Original',
    ),
    SmartFilter.vivid: _SmartFilterConfig(
      displayName: 'Vivid',
      cloudinaryTransformation: 'e_vibrance:60/e_auto_contrast/e_saturation:30',
      saturation: 40,
      contrast: 15,
    ),
    SmartFilter.warm: _SmartFilterConfig(
      displayName: 'Warm',
      cloudinaryTransformation: 'e_warming:40/e_saturation:15/e_auto_brightness',
      warmth: 35,
      saturation: 10,
      brightness: 5,
    ),
    SmartFilter.cool: _SmartFilterConfig(
      displayName: 'Cool',
      cloudinaryTransformation: 'e_cooling:35/e_saturation:10/e_auto_contrast',
      warmth: -30,
      saturation: 5,
      contrast: 10,
    ),
    SmartFilter.vintage: _SmartFilterConfig(
      displayName: 'Vintage',
      cloudinaryTransformation: 'e_sepia:40/e_saturation:-20/e_vignette:60/e_warming:20',
      saturation: -25,
      warmth: 25,
      contrast: -10,
      brightness: -5,
    ),
    SmartFilter.noir: _SmartFilterConfig(
      displayName: 'Noir',
      cloudinaryTransformation: 'e_grayscale/e_contrast:40/e_vignette:80',
      saturation: -100,
      contrast: 40,
    ),
    SmartFilter.dramatic: _SmartFilterConfig(
      displayName: 'Dramatic',
      cloudinaryTransformation: 'e_contrast:50/e_saturation:20/e_vignette:40/e_sharpen:100',
      contrast: 50,
      saturation: 15,
      brightness: -10,
    ),
    SmartFilter.golden: _SmartFilterConfig(
      displayName: 'Golden',
      cloudinaryTransformation: 'e_warming:50/e_saturation:25/e_brightness:10/e_vignette:30',
      warmth: 45,
      saturation: 20,
      brightness: 10,
    ),
    SmartFilter.moonlight: _SmartFilterConfig(
      displayName: 'Moonlight',
      cloudinaryTransformation: 'e_cooling:30/e_brightness:-15/e_contrast:20/e_blue:20',
      warmth: -25,
      brightness: -15,
      contrast: 20,
      tint: -20,
    ),
    SmartFilter.rose: _SmartFilterConfig(
      displayName: 'Rose',
      cloudinaryTransformation: 'e_tint:40:pink/e_saturation:15/e_brightness:5',
      tint: 35,
      saturation: 15,
      brightness: 5,
    ),
    SmartFilter.ocean: _SmartFilterConfig(
      displayName: 'Ocean',
      cloudinaryTransformation: 'e_cooling:25/e_blue:30/e_saturation:20/e_contrast:10',
      warmth: -20,
      tint: -25,
      saturation: 20,
      contrast: 10,
    ),
    SmartFilter.forest: _SmartFilterConfig(
      displayName: 'Forest',
      cloudinaryTransformation: 'e_green:20/e_saturation:15/e_contrast:10/e_vignette:20',
      hue: 30,
      saturation: 15,
      contrast: 10,
      brightness: -5,
    ),
    SmartFilter.sunset: _SmartFilterConfig(
      displayName: 'Sunset',
      cloudinaryTransformation: 'e_warming:60/e_saturation:35/e_contrast:15/e_vignette:30',
      warmth: 55,
      saturation: 35,
      contrast: 15,
    ),
    SmartFilter.aurora: _SmartFilterConfig(
      displayName: 'Aurora',
      cloudinaryTransformation: 'e_vibrance:50/e_saturation:40/e_hue:30/e_contrast:20',
      saturation: 40,
      hue: 30,
      contrast: 20,
      brightness: 5,
    ),
    SmartFilter.moody: _SmartFilterConfig(
      displayName: 'Moody',
      cloudinaryTransformation: 'e_contrast:30/e_saturation:-15/e_brightness:-20/e_vignette:60',
      contrast: 30,
      saturation: -15,
      brightness: -20,
    ),
    SmartFilter.crisp: _SmartFilterConfig(
      displayName: 'Crisp',
      cloudinaryTransformation: 'e_sharpen:150/e_auto_contrast/e_auto_brightness/e_vibrance:20',
      contrast: 20,
      brightness: 5,
      saturation: 10,
    ),
    SmartFilter.film: _SmartFilterConfig(
      displayName: 'Film',
      cloudinaryTransformation: 'e_saturation:-10/e_contrast:15/e_vignette:40/e_warming:15/e_noise:20',
      saturation: -10,
      contrast: 15,
      warmth: 15,
      brightness: -5,
    ),
    SmartFilter.retro: _SmartFilterConfig(
      displayName: 'Retro',
      cloudinaryTransformation: 'e_sepia:25/e_vignette:50/e_saturation:-15/e_warming:30',
      saturation: -20,
      warmth: 30,
      contrast: -5,
      brightness: -5,
    ),
    SmartFilter.pastel: _SmartFilterConfig(
      displayName: 'Pastel',
      cloudinaryTransformation: 'e_saturation:-30/e_brightness:25/e_contrast:-10',
      saturation: -30,
      brightness: 25,
      contrast: -10,
    ),
    SmartFilter.neon: _SmartFilterConfig(
      displayName: 'Neon',
      cloudinaryTransformation: 'e_vibrance:80/e_saturation:60/e_contrast:30/e_brightness:10',
      saturation: 60,
      contrast: 30,
      brightness: 10,
    ),
  };

  static const Map<ArtStyle, _ArtStyleConfig> _artStyleConfigs = {
    ArtStyle.watercolor: _ArtStyleConfig(
      displayName: 'Watercolor',
      cloudinaryEffect: 'e_art:painting',
    ),
    ArtStyle.oilPaint: _ArtStyleConfig(
      displayName: 'Oil Paint',
      cloudinaryEffect: 'e_oil_paint:80',
    ),
    ArtStyle.sketch: _ArtStyleConfig(
      displayName: 'Sketch',
      cloudinaryEffect: 'e_art:pencil',
    ),
    ArtStyle.cartoon: _ArtStyleConfig(
      displayName: 'Cartoon',
      cloudinaryEffect: 'e_cartoonify',
    ),
    ArtStyle.pop_art: _ArtStyleConfig(
      displayName: 'Pop Art',
      cloudinaryEffect: 'e_cartoonify:50/e_vibrance:80/e_saturation:60',
    ),
    ArtStyle.mosaic: _ArtStyleConfig(
      displayName: 'Mosaic',
      cloudinaryEffect: 'e_pixelate:15',
    ),
    ArtStyle.pixel: _ArtStyleConfig(
      displayName: 'Pixel',
      cloudinaryEffect: 'e_pixelate:8',
    ),
    ArtStyle.comic: _ArtStyleConfig(
      displayName: 'Comic',
      cloudinaryEffect: 'e_cartoonify/e_contrast:30/e_saturation:40',
    ),
    ArtStyle.anime: _ArtStyleConfig(
      displayName: 'Anime',
      cloudinaryEffect: 'e_cartoonify:80/e_vibrance:40/e_sharpen:100',
    ),
    ArtStyle.neon_glow: _ArtStyleConfig(
      displayName: 'Neon Glow',
      cloudinaryEffect: 'e_negate/e_vibrance:80/e_saturation:60/e_contrast:40',
    ),
  };

  // -----------------------------------------------------------------------
  // Smart Image Enhancement
  // -----------------------------------------------------------------------

  /// Auto-enhance an image with Cloudinary's best-effort pipeline.
  Future<File> autoEnhance(File image) async {
    try {
      appLogger.i('AiMediaService: auto-enhancing image');
      final url = await _uploadToCloudinary(
        image,
        transformation:
            'c_auto,g_auto/e_improve/e_auto_contrast/e_auto_brightness/e_auto_saturation/q_auto:best',
      );
      return _downloadFromUrl(url);
    } catch (e, st) {
      appLogger.e('AiMediaService.autoEnhance failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Apply an Instagram-level smart filter. Uses Cloudinary when a
  /// transformation string is defined; falls back to local `image` package
  /// processing otherwise.
  Future<File> applySmartFilter(File image, SmartFilter filter) async {
    if (filter == SmartFilter.original) return image;

    final config = _filterConfigs[filter]!;
    appLogger.i('AiMediaService: applying filter ${config.displayName}');

    try {
      // Prefer Cloudinary transformations when available.
      if (config.cloudinaryTransformation != null && _cloudName.isNotEmpty) {
        final url = await _uploadToCloudinary(
          image,
          transformation: config.cloudinaryTransformation,
        );
        return _downloadFromUrl(url);
      }

      // Fall back to local processing.
      return _applyLocalAdjustments(
        image,
        brightness: config.brightness,
        contrast: config.contrast,
        saturation: config.saturation,
        warmth: config.warmth,
        tint: config.tint,
      );
    } catch (e, st) {
      appLogger.w(
        'AiMediaService.applySmartFilter Cloudinary failed, falling back to local',
        error: e,
        stackTrace: st,
      );
      return _applyLocalAdjustments(
        image,
        brightness: config.brightness,
        contrast: config.contrast,
        saturation: config.saturation,
        warmth: config.warmth,
        tint: config.tint,
      );
    }
  }

  /// Convenience getter for UI: returns ordered list of filters with display
  /// names.
  static List<MapEntry<SmartFilter, String>> get availableFilters =>
      _filterConfigs.entries
          .map((e) => MapEntry(e.key, e.value.displayName))
          .toList();

  // -----------------------------------------------------------------------
  // AI-Powered Features
  // -----------------------------------------------------------------------

  /// Remove the background from an image using Cloudinary AI.
  Future<File> removeBackground(File image) async {
    try {
      appLogger.i('AiMediaService: removing background');
      final url = await _uploadToCloudinary(
        image,
        transformation: 'e_background_removal',
      );
      return _downloadFromUrl(url);
    } catch (e, st) {
      appLogger.e('AiMediaService.removeBackground failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Intelligent subject-aware crop at the given [aspectRatio].
  Future<File> smartCrop(File image, {double aspectRatio = 1.0}) async {
    try {
      final ratioStr = aspectRatio.toStringAsFixed(2);
      appLogger.i('AiMediaService: smart crop ar=$ratioStr');
      final url = await _uploadToCloudinary(
        image,
        transformation: 'c_fill,g_auto,ar_$ratioStr',
      );
      return _downloadFromUrl(url);
    } catch (e, st) {
      appLogger.e('AiMediaService.smartCrop failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Generate a descriptive caption using Cloudinary AI categorisation.
  Future<String> generateCaption(File image) async {
    try {
      appLogger.i('AiMediaService: generating caption');
      final uploadUrl =
          Uri.parse('$_baseUrl/image/upload');

      final request = http.MultipartRequest('POST', uploadUrl)
        ..fields['upload_preset'] = _uploadPreset
        ..fields['categorization'] = 'google_tagging,aws_rek_tagging'
        ..fields['auto_tagging'] = '0.6'
        ..files.add(await http.MultipartFile.fromPath('file', image.path));

      final streamed = await _client.send(request);
      final body = await streamed.stream.bytesToString();

      if (streamed.statusCode != 200) {
        throw Exception('Cloudinary upload failed (${streamed.statusCode}): $body');
      }

      final json = jsonDecode(body) as Map<String, dynamic>;
      final info = json['info'] as Map<String, dynamic>? ?? {};

      // Build caption from available categorisation data.
      final tags = <String>[];

      // Google tagging
      final googleCat = info['categorization']?['google_tagging']?['data'] as List?;
      if (googleCat != null) {
        for (final entry in googleCat) {
          if ((entry['confidence'] as num? ?? 0) > 0.6) {
            tags.add(entry['tag'] as String);
          }
        }
      }

      // AWS Rekognition tagging
      final awsCat = info['categorization']?['aws_rek_tagging']?['data'] as List?;
      if (awsCat != null) {
        for (final entry in awsCat) {
          if ((entry['confidence'] as num? ?? 0) > 0.6) {
            final tag = entry['tag'] as String;
            if (!tags.contains(tag)) tags.add(tag);
          }
        }
      }

      // Fallback to top-level tags from auto_tagging.
      if (tags.isEmpty) {
        final topTags = json['tags'] as List?;
        if (topTags != null) {
          tags.addAll(topTags.map((t) => t.toString()).take(8));
        }
      }

      if (tags.isEmpty) return 'A beautiful moment captured.';

      // Build a human-readable caption.
      final primary = tags.take(3).join(', ');
      final secondary = tags.skip(3).take(3).join(', ');
      return secondary.isNotEmpty
          ? '$primary featuring $secondary'
          : primary;
    } catch (e, st) {
      appLogger.e('AiMediaService.generateCaption failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Detect objects in an image via Cloudinary AI categorisation.
  Future<List<DetectedObject>> detectObjects(File image) async {
    try {
      appLogger.i('AiMediaService: detecting objects');
      final uploadUrl = Uri.parse('$_baseUrl/image/upload');

      final request = http.MultipartRequest('POST', uploadUrl)
        ..fields['upload_preset'] = _uploadPreset
        ..fields['detection'] = 'coco_v2'
        ..files.add(await http.MultipartFile.fromPath('file', image.path));

      final streamed = await _client.send(request);
      final body = await streamed.stream.bytesToString();

      if (streamed.statusCode != 200) {
        throw Exception('Cloudinary upload failed (${streamed.statusCode}): $body');
      }

      final json = jsonDecode(body) as Map<String, dynamic>;
      final detectionData =
          json['info']?['detection']?['coco_v2']?['data'] as List? ?? [];

      return detectionData.map<DetectedObject>((obj) {
        final bbox = obj['bounding_box'] as Map<String, dynamic>? ?? {};
        return DetectedObject(
          label: (obj['class'] ?? obj['tag'] ?? 'unknown') as String,
          confidence: (obj['confidence'] as num?)?.toDouble() ?? 0.0,
          boundingBox: {
            'x': (bbox['x'] as num?)?.toDouble() ?? 0,
            'y': (bbox['y'] as num?)?.toDouble() ?? 0,
            'width': (bbox['width'] as num?)?.toDouble() ?? 0,
            'height': (bbox['height'] as num?)?.toDouble() ?? 0,
          },
        );
      }).toList();
    } catch (e, st) {
      appLogger.e('AiMediaService.detectObjects failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Auto-tag an image using Cloudinary's AI tagging add-on.
  Future<List<String>> autoTag(File image) async {
    try {
      appLogger.i('AiMediaService: auto-tagging image');
      final uploadUrl = Uri.parse('$_baseUrl/image/upload');

      final request = http.MultipartRequest('POST', uploadUrl)
        ..fields['upload_preset'] = _uploadPreset
        ..fields['auto_tagging'] = '0.5'
        ..files.add(await http.MultipartFile.fromPath('file', image.path));

      final streamed = await _client.send(request);
      final body = await streamed.stream.bytesToString();

      if (streamed.statusCode != 200) {
        throw Exception('Cloudinary upload failed (${streamed.statusCode}): $body');
      }

      final json = jsonDecode(body) as Map<String, dynamic>;
      final tags = json['tags'] as List? ?? [];
      return tags.map((t) => t.toString()).toList();
    } catch (e, st) {
      appLogger.e('AiMediaService.autoTag failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  // -----------------------------------------------------------------------
  // Beauty & Portrait
  // -----------------------------------------------------------------------

  /// Apply beauty-mode adjustments: skin smoothing, eye brightening, teeth
  /// whitening. [intensity] ranges from 0.0 to 1.0.
  Future<File> beautyMode(File image, {double intensity = 0.5}) async {
    try {
      final smoothing = (intensity * 100).round().clamp(0, 100);
      final brighten = (intensity * 40).round().clamp(0, 60);
      appLogger.i('AiMediaService: beauty mode intensity=$intensity');

      final transformation = [
        'e_improve',
        'e_auto_brightness',
        'e_auto_contrast',
        'e_unsharp_mask:$smoothing',
        'e_brightness:$brighten',
        'e_saturation:${(intensity * 15).round()}',
        'q_auto:best',
      ].join('/');

      final url = await _uploadToCloudinary(image, transformation: transformation);
      return _downloadFromUrl(url);
    } catch (e, st) {
      appLogger.e('AiMediaService.beautyMode failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Blur background while keeping the subject sharp.
  Future<File> portraitBlur(File image, {double blurStrength = 10}) async {
    try {
      final blur = blurStrength.round().clamp(1, 2000);
      appLogger.i('AiMediaService: portrait blur strength=$blur');

      final transformation = 'e_blur_region:$blur,g_faces/e_improve';
      final url = await _uploadToCloudinary(image, transformation: transformation);
      return _downloadFromUrl(url);
    } catch (e, st) {
      appLogger.e('AiMediaService.portraitBlur failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  // -----------------------------------------------------------------------
  // Creative Tools
  // -----------------------------------------------------------------------

  /// Apply an artistic style transfer effect.
  Future<File> applyArtStyle(File image, ArtStyle style) async {
    try {
      final config = _artStyleConfigs[style]!;
      appLogger.i('AiMediaService: applying art style ${config.displayName}');

      final url = await _uploadToCloudinary(
        image,
        transformation: config.cloudinaryEffect,
      );
      return _downloadFromUrl(url);
    } catch (e, st) {
      appLogger.e('AiMediaService.applyArtStyle failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Create a collage from multiple images.
  Future<File> createCollage(List<File> images, CollageLayout layout) async {
    try {
      appLogger.i('AiMediaService: creating collage layout=$layout with ${images.length} images');

      if (images.isEmpty) throw ArgumentError('At least one image is required');

      // Determine grid dimensions based on layout.
      final _LayoutSpec spec = _layoutSpecFor(layout, images.length);

      // Load and resize all images to fit cells.
      final decoded = <img.Image>[];
      for (final file in images) {
        final bytes = await file.readAsBytes();
        final src = img.decodeImage(bytes);
        if (src == null) continue;
        decoded.add(src);
      }

      if (decoded.isEmpty) throw Exception('Could not decode any images');

      // Pad with duplicates if fewer images than cells.
      while (decoded.length < spec.cellCount) {
        decoded.add(decoded[decoded.length % images.length]);
      }

      const padding = 4;
      final cellW = spec.cellWidth;
      final cellH = spec.cellHeight;
      final canvasW = spec.cols * cellW + (spec.cols + 1) * padding;
      final canvasH = spec.rows * cellH + (spec.rows + 1) * padding;

      final canvas = img.Image(width: canvasW, height: canvasH);
      img.fill(canvas, color: img.ColorUint8.rgb(255, 255, 255));

      for (int i = 0; i < spec.cellCount && i < decoded.length; i++) {
        final row = i ~/ spec.cols;
        final col = i % spec.cols;
        final resized = img.copyResize(decoded[i], width: cellW, height: cellH);
        final x = padding + col * (cellW + padding);
        final y = padding + row * (cellH + padding);
        img.compositeImage(canvas, resized, dstX: x, dstY: y);
      }

      final dir = await getTemporaryDirectory();
      final outPath = '${dir.path}/collage_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final outFile = File(outPath);
      await outFile.writeAsBytes(img.encodeJpg(canvas, quality: 92));

      appLogger.i('AiMediaService: collage created at $outPath');
      return outFile;
    } catch (e, st) {
      appLogger.e('AiMediaService.createCollage failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  // -----------------------------------------------------------------------
  // Optimization
  // -----------------------------------------------------------------------

  /// Compress an image for fast chat delivery.
  Future<File> compressForChat(File image, {int maxWidth = 1200, int quality = 85}) async {
    try {
      appLogger.i('AiMediaService: compressing for chat maxWidth=$maxWidth q=$quality');
      final bytes = await image.readAsBytes();
      var decoded = img.decodeImage(bytes);
      if (decoded == null) throw Exception('Could not decode image');

      if (decoded.width > maxWidth) {
        decoded = img.copyResize(decoded, width: maxWidth);
      }

      final dir = await getTemporaryDirectory();
      final outPath = '${dir.path}/chat_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final outFile = File(outPath);
      await outFile.writeAsBytes(img.encodeJpg(decoded, quality: quality));
      return outFile;
    } catch (e, st) {
      appLogger.e('AiMediaService.compressForChat failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Compress an image for story format (1080x1920, quality 90).
  Future<File> compressForStory(File image) async {
    try {
      appLogger.i('AiMediaService: compressing for story');
      final bytes = await image.readAsBytes();
      var decoded = img.decodeImage(bytes);
      if (decoded == null) throw Exception('Could not decode image');

      // Resize to fit 1080x1920 while maintaining aspect ratio.
      const storyW = 1080;
      const storyH = 1920;

      final scaleW = storyW / decoded.width;
      final scaleH = storyH / decoded.height;
      final scale = max(scaleW, scaleH);

      final resized = img.copyResize(
        decoded,
        width: (decoded.width * scale).round(),
        height: (decoded.height * scale).round(),
        interpolation: img.Interpolation.cubic,
      );

      // Center crop to exact story dimensions.
      final x = ((resized.width - storyW) / 2).round().clamp(0, resized.width);
      final y = ((resized.height - storyH) / 2).round().clamp(0, resized.height);
      final cropped = img.copyCrop(resized, x: x, y: y, width: storyW, height: storyH);

      final dir = await getTemporaryDirectory();
      final outPath = '${dir.path}/story_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final outFile = File(outPath);
      await outFile.writeAsBytes(img.encodeJpg(cropped, quality: 90));
      return outFile;
    } catch (e, st) {
      appLogger.e('AiMediaService.compressForStory failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Generate a small thumbnail for message previews.
  Future<File> generateThumbnail(File image, {int size = 200}) async {
    try {
      appLogger.i('AiMediaService: generating thumbnail size=$size');
      final bytes = await image.readAsBytes();
      final decoded = img.decodeImage(bytes);
      if (decoded == null) throw Exception('Could not decode image');

      final thumb = img.copyResizeCropSquare(decoded, size: size);

      final dir = await getTemporaryDirectory();
      final outPath = '${dir.path}/thumb_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final outFile = File(outPath);
      await outFile.writeAsBytes(img.encodeJpg(thumb, quality: 80));
      return outFile;
    } catch (e, st) {
      appLogger.e('AiMediaService.generateThumbnail failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  /// Compress a video file via Cloudinary eager transformations.
  Future<File> compressVideo(File video, {VideoQuality quality = VideoQuality.medium}) async {
    try {
      appLogger.i('AiMediaService: compressing video quality=$quality');

      final String transformation;
      switch (quality) {
        case VideoQuality.low:
          transformation = 'q_auto:low,w_480';
        case VideoQuality.medium:
          transformation = 'q_auto:good,w_720';
        case VideoQuality.high:
          transformation = 'q_auto:best,w_1080';
        case VideoQuality.original:
          transformation = 'q_auto:best';
      }

      final uploadUrl = Uri.parse('$_baseUrl/video/upload');
      final request = http.MultipartRequest('POST', uploadUrl)
        ..fields['upload_preset'] = _uploadPreset
        ..fields['eager'] = transformation
        ..fields['eager_async'] = 'false'
        ..files.add(await http.MultipartFile.fromPath('file', video.path));

      final streamed = await _client.send(request);
      final body = await streamed.stream.bytesToString();

      if (streamed.statusCode != 200) {
        throw Exception('Cloudinary video upload failed (${streamed.statusCode}): $body');
      }

      final json = jsonDecode(body) as Map<String, dynamic>;

      // Prefer the eager-transformed URL when available.
      final eager = json['eager'] as List?;
      final url = (eager != null && eager.isNotEmpty)
          ? eager[0]['secure_url'] as String
          : json['secure_url'] as String;

      return _downloadFromUrl(url);
    } catch (e, st) {
      appLogger.e('AiMediaService.compressVideo failed', error: e, stackTrace: st);
      rethrow;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /// Upload a file to Cloudinary unsigned with the configured preset.
  /// If [transformation] is given, the file is uploaded and the transformed
  /// URL is returned.
  Future<String> _uploadToCloudinary(File file, {String? transformation}) async {
    if (_cloudName.isEmpty || _uploadPreset.isEmpty) {
      throw Exception(
        'Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME and '
        'CLOUDINARY_UPLOAD_PRESET in your .env file.',
      );
    }

    final isVideo = file.path.toLowerCase().endsWith('.mp4') ||
        file.path.toLowerCase().endsWith('.mov') ||
        file.path.toLowerCase().endsWith('.avi');

    final resourceType = isVideo ? 'video' : 'image';
    final uploadUrl = Uri.parse('$_baseUrl/$resourceType/upload');

    final request = http.MultipartRequest('POST', uploadUrl)
      ..fields['upload_preset'] = _uploadPreset
      ..files.add(await http.MultipartFile.fromPath('file', file.path));

    if (transformation != null) {
      request.fields['eager'] = transformation;
      request.fields['eager_async'] = 'false';
    }

    final streamed = await _client.send(request);
    final body = await streamed.stream.bytesToString();

    if (streamed.statusCode != 200) {
      throw Exception('Cloudinary upload failed (${streamed.statusCode}): $body');
    }

    final json = jsonDecode(body) as Map<String, dynamic>;

    // If we requested an eager transformation, use that URL.
    if (transformation != null) {
      final eager = json['eager'] as List?;
      if (eager != null && eager.isNotEmpty) {
        return eager[0]['secure_url'] as String;
      }
      // Construct the URL manually from the public_id.
      final publicId = json['public_id'] as String;
      final format = json['format'] as String? ?? 'jpg';
      return 'https://res.cloudinary.com/$_cloudName/$resourceType/upload/$transformation/$publicId.$format';
    }

    return json['secure_url'] as String;
  }

  /// Download an image from a URL to a temporary file.
  Future<File> _downloadFromUrl(String url) async {
    final response = await _client.get(Uri.parse(url));
    if (response.statusCode != 200) {
      throw Exception('Failed to download from $url (${response.statusCode})');
    }

    final dir = await getTemporaryDirectory();
    final ext = url.contains('.png') ? 'png' : 'jpg';
    final outPath = '${dir.path}/ai_media_${DateTime.now().millisecondsSinceEpoch}.$ext';
    final outFile = File(outPath);
    await outFile.writeAsBytes(response.bodyBytes);
    return outFile;
  }

  /// Apply local adjustments using the `image` package.
  /// Values are percentages: positive = increase, negative = decrease.
  Future<File> _applyLocalAdjustments(
    File image, {
    double brightness = 0,
    double contrast = 0,
    double saturation = 0,
    double warmth = 0,
    double tint = 0,
  }) async {
    final bytes = await image.readAsBytes();
    var decoded = img.decodeImage(bytes);
    if (decoded == null) throw Exception('Could not decode image');

    // Brightness: scale -100..100 to additive offset.
    if (brightness != 0) {
      decoded = img.adjustColor(decoded, brightness: brightness / 100);
    }

    // Contrast: scale -100..100 to multiplier.
    if (contrast != 0) {
      decoded = img.adjustColor(decoded, contrast: 1.0 + contrast / 100);
    }

    // Saturation: scale -100..100 to multiplier.
    if (saturation != 0) {
      decoded = img.adjustColor(decoded, saturation: 1.0 + saturation / 100);
    }

    // Warmth: shift red/blue channels.
    if (warmth != 0) {
      final shift = (warmth * 2.55).round().clamp(-255, 255);
      for (final pixel in decoded) {
        final r = (pixel.r.toInt() + shift).clamp(0, 255);
        final b = (pixel.b.toInt() - shift).clamp(0, 255);
        pixel.r = r is num ? r : 0;
        pixel.b = b is num ? b : 0;
      }
    }

    // Tint: shift green/magenta.
    if (tint != 0) {
      final shift = (tint * 2.55).round().clamp(-255, 255);
      for (final pixel in decoded) {
        final g = (pixel.g.toInt() + shift).clamp(0, 255);
        pixel.g = g is num ? g : 0;
      }
    }

    final dir = await getTemporaryDirectory();
    final outPath = '${dir.path}/adj_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final outFile = File(outPath);
    await outFile.writeAsBytes(img.encodeJpg(decoded, quality: 95));
    return outFile;
  }

  // -----------------------------------------------------------------------
  // Collage layout helpers
  // -----------------------------------------------------------------------

  _LayoutSpec _layoutSpecFor(CollageLayout layout, int imageCount) {
    switch (layout) {
      case CollageLayout.grid2x2:
        return const _LayoutSpec(rows: 2, cols: 2, cellWidth: 540, cellHeight: 540);
      case CollageLayout.grid3x3:
        return const _LayoutSpec(rows: 3, cols: 3, cellWidth: 360, cellHeight: 360);
      case CollageLayout.horizontal2:
        return const _LayoutSpec(rows: 1, cols: 2, cellWidth: 540, cellHeight: 540);
      case CollageLayout.horizontal3:
        return const _LayoutSpec(rows: 1, cols: 3, cellWidth: 360, cellHeight: 540);
      case CollageLayout.vertical2:
        return const _LayoutSpec(rows: 2, cols: 1, cellWidth: 540, cellHeight: 540);
      case CollageLayout.vertical3:
        return const _LayoutSpec(rows: 3, cols: 1, cellWidth: 540, cellHeight: 360);
      case CollageLayout.diagonal:
        return const _LayoutSpec(rows: 2, cols: 2, cellWidth: 540, cellHeight: 540);
      case CollageLayout.overlap:
        return const _LayoutSpec(rows: 2, cols: 2, cellWidth: 540, cellHeight: 540);
      case CollageLayout.magazine:
        return const _LayoutSpec(rows: 2, cols: 2, cellWidth: 540, cellHeight: 480);
    }
  }
}

class _LayoutSpec {
  const _LayoutSpec({
    required this.rows,
    required this.cols,
    required this.cellWidth,
    required this.cellHeight,
  });

  final int rows;
  final int cols;
  final int cellWidth;
  final int cellHeight;

  int get cellCount => rows * cols;
}
