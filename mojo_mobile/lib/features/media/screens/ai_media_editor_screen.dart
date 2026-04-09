import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/theme/mojo_colors.dart';
import '../services/ai_media_service.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

class AiMediaEditorScreen extends StatefulWidget {
  final File imageFile;
  final Function(File) onSave;
  final bool forChat;
  final bool forStory;

  const AiMediaEditorScreen({
    super.key,
    required this.imageFile,
    required this.onSave,
    this.forChat = false,
    this.forStory = false,
  });

  @override
  State<AiMediaEditorScreen> createState() => _AiMediaEditorScreenState();
}

enum _ToolTab { enhance, filters, art, ai }

class _AiMediaEditorScreenState extends State<AiMediaEditorScreen>
    with TickerProviderStateMixin {
  late final AiMediaService _aiService;
  late final TabController _tabController;
  late final TransformationController _transformationController;

  // Image state
  late File _currentImage;
  final List<File> _undoStack = [];
  final List<File> _redoStack = [];
  bool _hasChanges = false;

  // Processing
  bool _isProcessing = false;
  String _processingLabel = '';

  // Tool states
  SmartFilter _selectedFilter = SmartFilter.original;
  double _beautyIntensity = 0.0;
  double _blurStrength = 0.0;
  int _selectedAspectIndex = -1;
  ArtStyle? _selectedArtStyle;

  // AI tab state
  String? _generatedCaption;
  List<String>? _generatedTags;

  // Comparison
  bool _showingOriginal = false;

  // Aspect ratio presets
  static const _aspectRatios = [
    (label: '1:1', value: 1.0),
    (label: '4:5', value: 4 / 5),
    (label: '9:16', value: 9 / 16),
    (label: '16:9', value: 16 / 9),
    (label: 'Free', value: 0.0),
  ];

  @override
  void initState() {
    super.initState();
    _aiService = AiMediaService();
    _currentImage = widget.imageFile;
    _tabController = TabController(length: _ToolTab.values.length, vsync: this);
    _transformationController = TransformationController();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _transformationController.dispose();
    super.dispose();
  }

  // --- State helpers ---

  void _pushState(File newImage) {
    _undoStack.add(_currentImage);
    _redoStack.clear();
    setState(() {
      _currentImage = newImage;
      _hasChanges = true;
    });
  }

  void _undo() {
    if (_undoStack.isEmpty) return;
    HapticFeedback.lightImpact();
    _redoStack.add(_currentImage);
    setState(() {
      _currentImage = _undoStack.removeLast();
      _hasChanges = _undoStack.isNotEmpty;
    });
  }

  void _redo() {
    if (_redoStack.isEmpty) return;
    HapticFeedback.lightImpact();
    _undoStack.add(_currentImage);
    setState(() {
      _currentImage = _redoStack.removeLast();
      _hasChanges = true;
    });
  }

  // --- Processing wrapper ---

  Future<void> _runAiTask(String label, Future<File> Function() task) async {
    HapticFeedback.mediumImpact();
    setState(() {
      _isProcessing = true;
      _processingLabel = label;
    });
    try {
      final result = await task();
      _pushState(result);
      if (mounted) _showToast('$label applied');
    } catch (e) {
      if (mounted) _showErrorSnackbar(label, task);
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  void _showToast(String message) {
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        duration: const Duration(seconds: 1),
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 100),
      ),
    );
  }

  void _showErrorSnackbar(String label, Future<File> Function() task) {
    ScaffoldMessenger.of(context).clearSnackBars();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Failed to apply $label'),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 100),
        action: SnackBarAction(
          label: 'Retry',
          onPressed: () => _runAiTask(label, task),
        ),
      ),
    );
  }

  // --- Save ---

  Future<void> _save() async {
    HapticFeedback.mediumImpact();
    File output = _currentImage;
    setState(() {
      _isProcessing = true;
      _processingLabel = 'Preparing...';
    });
    try {
      if (widget.forChat) {
        output = await _aiService.compressForChat(output);
      } else if (widget.forStory) {
        output = await _aiService.compressForStory(output);
      }
      widget.onSave(output);
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) _showToast('Failed to save');
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  Future<bool> _confirmDiscard() async {
    if (!_hasChanges) return true;
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard changes?'),
        content: const Text('You have unsaved edits. Are you sure you want to discard them?'),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text('Discard', style: TextStyle(color: MojoColors.primaryOrange)),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  // --- Build ---

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_hasChanges,
      onPopInvokedWithResult: (didPop, _) async {
        if (!didPop) {
          final discard = await _confirmDiscard();
          if (discard && mounted) Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: Column(
            children: [
              _buildTopBar(),
              Expanded(child: _buildImagePreview()),
              _buildAiChips(),
              _buildToolBar(),
            ],
          ),
        ),
      ),
    );
  }

  // --- Top bar ---

  Widget _buildTopBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.close, color: Colors.white),
            onPressed: () async {
              final discard = await _confirmDiscard();
              if (discard && mounted) Navigator.of(context).pop();
            },
          ),
          const Spacer(),
          IconButton(
            icon: Icon(Icons.undo,
                color: _undoStack.isNotEmpty ? Colors.white : Colors.white30),
            onPressed: _undoStack.isNotEmpty ? _undo : null,
          ),
          IconButton(
            icon: Icon(Icons.redo,
                color: _redoStack.isNotEmpty ? Colors.white : Colors.white30),
            onPressed: _redoStack.isNotEmpty ? _redo : null,
          ),
          const SizedBox(width: 8),
          _buildSaveButton(),
        ],
      ),
    );
  }

  Widget _buildSaveButton() {
    return GestureDetector(
      onTap: _isProcessing ? null : _save,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: BoxDecoration(
          gradient: MojoColors.mainGradient,
          borderRadius: BorderRadius.circular(20),
        ),
        child: const Text(
          'Done',
          style: TextStyle(
              color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14),
        ),
      ),
    );
  }

  // --- Image preview ---

  Widget _buildImagePreview() {
    return Stack(
      fit: StackFit.expand,
      children: [
        GestureDetector(
          onLongPressStart: (_) => setState(() => _showingOriginal = true),
          onLongPressEnd: (_) => setState(() => _showingOriginal = false),
          child: InteractiveViewer(
            transformationController: _transformationController,
            minScale: 0.5,
            maxScale: 4.0,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 350),
              child: Image.file(
                _showingOriginal ? widget.imageFile : _currentImage,
                key: ValueKey(
                    _showingOriginal ? 'original' : _currentImage.path),
                fit: BoxFit.contain,
              ),
            ),
          ),
        ),
        if (_showingOriginal)
          Positioned(
            top: 16,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Text('Original',
                    style: TextStyle(color: Colors.white, fontSize: 12)),
              ),
            ),
          ),
        if (_isProcessing) _buildProcessingOverlay(),
      ],
    );
  }

  Widget _buildProcessingOverlay() {
    return Container(
      color: Colors.black45,
      child: Center(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Container(
            width: 200,
            padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.15),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white24),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  width: 40,
                  height: 40,
                  child: AppLoadingIndicator(
                    strokeWidth: 3,
                    valueColor:
                        AlwaysStoppedAnimation(MojoColors.primaryOrange),
                  ),
                )
                    .animate(onPlay: (c) => c.repeat())
                    .shimmer(
                        duration: 1200.ms,
                        color: MojoColors.primaryPurple.withOpacity(0.3)),
                const SizedBox(height: 16),
                Text(
                  _processingLabel,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w500),
                ),
                const SizedBox(height: 4),
                Text(
                  'Applying AI magic...',
                  style: TextStyle(color: Colors.white60, fontSize: 11),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // --- AI chips (caption / tags shown below image) ---

  Widget _buildAiChips() {
    if (_generatedCaption == null && _generatedTags == null) {
      return const SizedBox.shrink();
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          if (_generatedCaption != null)
            _chip(Icons.auto_awesome, _generatedCaption!),
          if (_generatedTags != null)
            for (final tag in _generatedTags!) _chip(Icons.tag, tag),
        ],
      ),
    );
  }

  Widget _chip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white24),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: MojoColors.primaryPurple),
          const SizedBox(width: 4),
          Flexible(
            child: Text(label,
                style: const TextStyle(color: Colors.white, fontSize: 11),
                overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.1);
  }

  // --- Bottom toolbar ---

  Widget _buildToolBar() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1A1A1A),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: _toolPanelHeight,
            child: TabBarView(
              controller: _tabController,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _buildEnhanceTab(),
                _buildFiltersTab(),
                _buildArtTab(),
                _buildAiTab(),
              ],
            ),
          ),
          TabBar(
            controller: _tabController,
            indicatorColor: MojoColors.primaryOrange,
            indicatorSize: TabBarIndicatorSize.label,
            labelColor: MojoColors.primaryOrange,
            unselectedLabelColor: Colors.white54,
            labelStyle:
                const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            unselectedLabelStyle: const TextStyle(fontSize: 12),
            onTap: (_) => HapticFeedback.selectionClick(),
            tabs: const [
              Tab(icon: Icon(Icons.auto_fix_high, size: 20), text: 'Enhance'),
              Tab(icon: Icon(Icons.filter_vintage, size: 20), text: 'Filters'),
              Tab(icon: Icon(Icons.palette, size: 20), text: 'Art'),
              Tab(icon: Icon(Icons.smart_toy, size: 20), text: 'AI'),
            ],
          ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }

  double get _toolPanelHeight => 160;

  // --- Enhance tab ---

  Widget _buildEnhanceTab() {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      children: [
        // Row of action buttons
        SizedBox(
          height: 56,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              _enhanceButton(Icons.auto_awesome, 'Auto\nEnhance', () {
                _runAiTask(
                    'Auto Enhance', () => _aiService.autoEnhance(_currentImage));
              }),
              _enhanceButton(Icons.wallpaper, 'Remove\nBG', () {
                _runAiTask('Background Removal',
                    () => _aiService.removeBackground(_currentImage));
              }),
              const SizedBox(width: 8),
              ..._aspectRatios.asMap().entries.map((e) {
                final i = e.key;
                final ar = e.value;
                final selected = _selectedAspectIndex == i;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _selectedAspectIndex = i);
                      if (ar.value > 0) {
                        _runAiTask(
                          'Smart Crop ${ar.label}',
                          () => _aiService.smartCrop(_currentImage,
                              aspectRatio: ar.value),
                        );
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: selected
                            ? MojoColors.primaryOrange.withOpacity(0.2)
                            : Colors.white.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: selected
                            ? Border.all(color: MojoColors.primaryOrange)
                            : null,
                      ),
                      child: Center(
                        child: Text(ar.label,
                            style: TextStyle(
                                color: selected
                                    ? MojoColors.primaryOrange
                                    : Colors.white70,
                                fontSize: 12,
                                fontWeight: FontWeight.w500)),
                      ),
                    ),
                  ),
                );
              }),
            ],
          ),
        ),
        const SizedBox(height: 10),
        // Beauty slider
        _sliderRow(
          Icons.face_retouching_natural,
          'Beauty',
          _beautyIntensity,
          0,
          100,
          (v) => setState(() => _beautyIntensity = v),
          () {
            if (_beautyIntensity > 0) {
              _runAiTask(
                'Beauty Mode',
                () => _aiService.beautyMode(_currentImage,
                    intensity: _beautyIntensity / 100),
              );
            }
          },
        ),
        // Blur slider
        _sliderRow(
          Icons.blur_on,
          'Blur',
          _blurStrength,
          0,
          20,
          (v) => setState(() => _blurStrength = v),
          () {
            if (_blurStrength > 0) {
              _runAiTask(
                'Portrait Blur',
                () => _aiService.portraitBlur(_currentImage,
                    blurStrength: _blurStrength),
              );
            }
          },
        ),
      ],
    );
  }

  Widget _enhanceButton(IconData icon, String label, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: _isProcessing ? null : onTap,
        child: Container(
          width: 64,
          decoration: BoxDecoration(
            gradient: MojoColors.purpleGradient,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: Colors.white, size: 20),
              const SizedBox(height: 2),
              Text(label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 9)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sliderRow(IconData icon, String label, double value, double min,
      double max, ValueChanged<double> onChanged, VoidCallback onEnd) {
    return Row(
      children: [
        Icon(icon, color: Colors.white54, size: 18),
        const SizedBox(width: 6),
        SizedBox(
            width: 42,
            child: Text(label,
                style: const TextStyle(color: Colors.white70, fontSize: 11))),
        Expanded(
          child: SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: MojoColors.primaryOrange,
              inactiveTrackColor: Colors.white12,
              thumbColor: MojoColors.primaryOrange,
              trackHeight: 2,
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
            ),
            child: Slider(
              value: value,
              min: min,
              max: max,
              onChanged: onChanged,
              onChangeEnd: (_) => onEnd(),
            ),
          ),
        ),
        SizedBox(
          width: 32,
          child: Text(value.round().toString(),
              style: const TextStyle(color: Colors.white54, fontSize: 11),
              textAlign: TextAlign.right),
        ),
      ],
    );
  }

  // --- Filters tab ---

  Widget _buildFiltersTab() {
    return ListView.builder(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      itemCount: SmartFilter.values.length,
      itemBuilder: (context, index) {
        final filter = SmartFilter.values[index];
        final selected = filter == _selectedFilter;
        return GestureDetector(
          onTap: _isProcessing
              ? null
              : () {
                  HapticFeedback.selectionClick();
                  setState(() => _selectedFilter = filter);
                  if (filter == SmartFilter.original) {
                    if (_undoStack.isNotEmpty) {
                      _pushState(widget.imageFile);
                    }
                  } else {
                    _runAiTask(
                      filter.name,
                      () =>
                          _aiService.applySmartFilter(_currentImage, filter),
                    );
                  }
                },
          child: Container(
            width: 76,
            margin: const EdgeInsets.only(right: 8),
            child: Column(
              children: [
                Expanded(
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: selected
                          ? Border.all(
                              color: MojoColors.primaryOrange, width: 2.5)
                          : Border.all(color: Colors.white12),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(selected ? 9.5 : 12),
                      child: ColorFiltered(
                        colorFilter: _previewColorFilter(filter),
                        child: Image.file(
                          widget.imageFile,
                          fit: BoxFit.cover,
                          width: 76,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  filter.name,
                  style: TextStyle(
                    color: selected ? MojoColors.primaryOrange : Colors.white60,
                    fontSize: 10,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ).animate().fadeIn(delay: (index * 30).ms, duration: 200.ms);
      },
    );
  }

  ColorFilter _previewColorFilter(SmartFilter filter) {
    // Simple client-side tint hints for filter thumbnails
    switch (filter) {
      case SmartFilter.original:
        return const ColorFilter.mode(Colors.transparent, BlendMode.dst);
      case SmartFilter.warm:
      case SmartFilter.golden:
      case SmartFilter.sunset:
        return ColorFilter.mode(
            Colors.orange.withOpacity(0.15), BlendMode.color);
      case SmartFilter.cool:
      case SmartFilter.moonlight:
      case SmartFilter.ocean:
        return ColorFilter.mode(
            Colors.blue.withOpacity(0.15), BlendMode.color);
      case SmartFilter.vintage:
      case SmartFilter.retro:
      case SmartFilter.film:
        return ColorFilter.mode(
            Colors.brown.withOpacity(0.2), BlendMode.color);
      case SmartFilter.noir:
        return const ColorFilter.mode(Colors.grey, BlendMode.saturation);
      case SmartFilter.rose:
      case SmartFilter.pastel:
        return ColorFilter.mode(
            Colors.pink.withOpacity(0.12), BlendMode.color);
      case SmartFilter.neon:
      case SmartFilter.aurora:
        return ColorFilter.mode(
            Colors.purple.withOpacity(0.15), BlendMode.color);
      case SmartFilter.vivid:
      case SmartFilter.crisp:
      case SmartFilter.dramatic:
        return ColorFilter.mode(
            Colors.deepPurple.withOpacity(0.08), BlendMode.color);
      case SmartFilter.forest:
        return ColorFilter.mode(
            Colors.green.withOpacity(0.12), BlendMode.color);
      case SmartFilter.moody:
        return ColorFilter.mode(
            Colors.blueGrey.withOpacity(0.2), BlendMode.color);
    }
  }

  // --- Art tab ---

  Widget _buildArtTab() {
    return GridView.builder(
      padding: const EdgeInsets.all(10),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 5,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 0.85,
      ),
      itemCount: ArtStyle.values.length,
      itemBuilder: (context, index) {
        final style = ArtStyle.values[index];
        final selected = _selectedArtStyle == style;
        return GestureDetector(
          onTap: _isProcessing
              ? null
              : () {
                  HapticFeedback.selectionClick();
                  setState(() => _selectedArtStyle = style);
                  _runAiTask(
                    style.name,
                    () => _aiService.applyArtStyle(_currentImage, style),
                  );
                },
          child: Container(
            decoration: BoxDecoration(
              color: selected
                  ? MojoColors.primaryPurple.withOpacity(0.2)
                  : Colors.white.withOpacity(0.06),
              borderRadius: BorderRadius.circular(12),
              border: selected
                  ? Border.all(color: MojoColors.primaryPurple, width: 2)
                  : null,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(_artIcon(style),
                    color: selected
                        ? MojoColors.primaryPurple
                        : Colors.white60,
                    size: 24),
                const SizedBox(height: 4),
                Text(
                  style.name,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color:
                        selected ? MojoColors.primaryPurple : Colors.white60,
                    fontSize: 9,
                    fontWeight:
                        selected ? FontWeight.w600 : FontWeight.normal,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ).animate().scale(delay: (index * 40).ms, duration: 200.ms);
      },
    );
  }

  IconData _artIcon(ArtStyle style) {
    switch (style) {
      case ArtStyle.watercolor:
        return Icons.water_drop;
      case ArtStyle.oilPaint:
        return Icons.brush;
      case ArtStyle.sketch:
        return Icons.edit;
      case ArtStyle.cartoon:
        return Icons.face;
      case ArtStyle.pop_art:
        return Icons.color_lens;
      case ArtStyle.mosaic:
        return Icons.grid_view;
      case ArtStyle.pixel:
        return Icons.grid_on;
      case ArtStyle.comic:
        return Icons.menu_book;
      case ArtStyle.anime:
        return Icons.animation;
      case ArtStyle.neon_glow:
        return Icons.light_mode;
    }
  }

  // --- AI tab ---

  Widget _buildAiTab() {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      children: [
        Row(
          children: [
            Expanded(
              child: _aiActionButton(
                Icons.auto_awesome,
                'Generate Caption',
                () async {
                  HapticFeedback.mediumImpact();
                  setState(() {
                    _isProcessing = true;
                    _processingLabel = 'Generating caption...';
                  });
                  try {
                    final caption =
                        await _aiService.generateCaption(_currentImage);
                    setState(() => _generatedCaption = caption);
                    _showToast('Caption generated');
                  } catch (_) {
                    _showToast('Failed to generate caption');
                  } finally {
                    if (mounted) setState(() => _isProcessing = false);
                  }
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _aiActionButton(
                Icons.tag,
                'Auto Tag',
                () async {
                  HapticFeedback.mediumImpact();
                  setState(() {
                    _isProcessing = true;
                    _processingLabel = 'Analyzing image...';
                  });
                  try {
                    final tags = await _aiService.autoTag(_currentImage);
                    setState(() => _generatedTags = tags);
                    _showToast('Tags generated');
                  } catch (_) {
                    _showToast('Failed to generate tags');
                  } finally {
                    if (mounted) setState(() => _isProcessing = false);
                  }
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _aiActionButton(
          Icons.lightbulb_outline,
          'Smart Suggestions',
          () async {
            HapticFeedback.mediumImpact();
            setState(() {
              _isProcessing = true;
              _processingLabel = 'Analyzing...';
            });
            try {
              // Run auto-enhance as a smart suggestion baseline
              final enhanced = await _aiService.autoEnhance(_currentImage);
              final caption = await _aiService.generateCaption(enhanced);
              final tags = await _aiService.autoTag(enhanced);
              _pushState(enhanced);
              setState(() {
                _generatedCaption = caption;
                _generatedTags = tags;
              });
              _showToast('Smart suggestions applied');
            } catch (_) {
              _showToast('Failed to get suggestions');
            } finally {
              if (mounted) setState(() => _isProcessing = false);
            }
          },
        ),
        const SizedBox(height: 10),
        if (_generatedCaption != null)
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.06),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                Icon(Icons.content_copy,
                    size: 14, color: MojoColors.primaryPurple),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(_generatedCaption!,
                      style:
                          const TextStyle(color: Colors.white70, fontSize: 12)),
                ),
                GestureDetector(
                  onTap: () {
                    Clipboard.setData(
                        ClipboardData(text: _generatedCaption!));
                    _showToast('Caption copied');
                  },
                  child: const Icon(Icons.copy, size: 16, color: Colors.white38),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 300.ms),
      ],
    );
  }

  Widget _aiActionButton(
      IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: _isProcessing ? null : onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          gradient: MojoColors.purpleGradient,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: Colors.white, size: 18),
            const SizedBox(width: 8),
            Text(label,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

