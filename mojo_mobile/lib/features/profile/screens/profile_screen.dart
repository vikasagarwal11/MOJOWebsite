import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';
import 'package:mojo_mobile/core/widgets/app_notice.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_user_profile.dart';
import '../widgets/profile_action_tiles.dart';
import '../widgets/profile_hero_card.dart';
import '../widgets/profile_section_card.dart';
import '../widgets/profile_stats_row.dart';

const int _kAboutMaxLength = 1000;

/// Fields loaded once for the form (same document as [MojoUserProfile], richer shape).
class _ProfileFormSnapshot {
  const _ProfileFormSnapshot({
    required this.about,
    required this.phoneNumber,
    required this.interests,
    required this.street,
    required this.city,
    required this.state,
    required this.postalCode,
    required this.instagram,
    required this.facebook,
    required this.twitter,
    required this.tiktok,
    required this.youtube,
    required this.website,
    this.createdAt,
  });

  final String? about;
  final String? phoneNumber;
  final List<String> interests;
  final String? street;
  final String? city;
  final String? state;
  final String? postalCode;
  final String? instagram;
  final String? facebook;
  final String? twitter;
  final String? tiktok;
  final String? youtube;
  final String? website;
  final DateTime? createdAt;
}

final _profileFormSnapshotProvider =
    FutureProvider.family<_ProfileFormSnapshot, String>((ref, uid) async {
  final snap =
      await ref.watch(firestoreProvider).collection('users').doc(uid).get();
  if (!snap.exists) {
    return const _ProfileFormSnapshot(
      about: null,
      phoneNumber: null,
      interests: [],
      street: null,
      city: null,
      state: null,
      postalCode: null,
      instagram: null,
      facebook: null,
      twitter: null,
      tiktok: null,
      youtube: null,
      website: null,
      createdAt: null,
    );
  }
  final d = snap.data() ?? {};
  final rawInterests = d['interests'];
  final interests = rawInterests is List
      ? rawInterests.whereType<String>().toList()
      : <String>[];
  final addr = d['address'];
  String? street, city, state, postalCode;
  if (addr is Map) {
    street = addr['street'] as String?;
    city = addr['city'] as String?;
    state = addr['state'] as String?;
    postalCode = addr['postalCode'] as String?;
  }
  final soc = d['social'];
  String? ig, fb, tw, tt, yt, web;
  if (soc is Map) {
    ig = soc['instagram'] as String?;
    fb = soc['facebook'] as String?;
    tw = soc['twitter'] as String?;
    tt = soc['tiktok'] as String?;
    yt = soc['youtube'] as String?;
    web = soc['website'] as String?;
  }
  final rawCreated = d['createdAt'];
  final createdAt = rawCreated is Timestamp ? rawCreated.toDate() : null;
  return _ProfileFormSnapshot(
    about: d['about'] as String?,
    phoneNumber: d['phoneNumber'] as String?,
    interests: interests,
    street: street,
    city: city,
    state: state,
    postalCode: postalCode,
    instagram: ig,
    facebook: fb,
    twitter: tw,
    tiktok: tt,
    youtube: yt,
    website: web,
    createdAt: createdAt,
  );
});

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _firstName;
  late final TextEditingController _lastName;
  late final TextEditingController _email;
  late final TextEditingController _about;
  late final TextEditingController _street;
  late final TextEditingController _city;
  late final TextEditingController _state;
  late final TextEditingController _postal;
  late final TextEditingController _instagram;
  late final TextEditingController _facebook;
  late final TextEditingController _twitter;
  late final TextEditingController _tiktok;
  late final TextEditingController _youtube;
  late final TextEditingController _website;
  late final TextEditingController _tagInput;
  late final List<TextEditingController> _textControllers;

  List<String> _interests = [];
  String? _seededForUid;
  bool _saving = false;
  bool _uploadingPhoto = false;
  bool _dirty = false;
  bool _suppressDirty = false;
  bool _isEditing = false;

  int get _socialCount => [
        _instagram,
        _facebook,
        _twitter,
        _tiktok,
        _youtube,
        _website,
      ].where((c) => c.text.trim().isNotEmpty).length;

  @override
  void initState() {
    super.initState();
    _firstName = TextEditingController();
    _lastName = TextEditingController();
    _email = TextEditingController();
    _about = TextEditingController();
    _street = TextEditingController();
    _city = TextEditingController();
    _state = TextEditingController();
    _postal = TextEditingController();
    _instagram = TextEditingController();
    _facebook = TextEditingController();
    _twitter = TextEditingController();
    _tiktok = TextEditingController();
    _youtube = TextEditingController();
    _website = TextEditingController();
    _tagInput = TextEditingController();
    _textControllers = [
      _firstName,
      _lastName,
      _email,
      _about,
      _street,
      _city,
      _state,
      _postal,
      _instagram,
      _facebook,
      _twitter,
      _tiktok,
      _youtube,
      _website,
      _tagInput,
    ];
    for (final c in _textControllers) {
      c.addListener(_onFieldChanged);
    }
  }

  @override
  void dispose() {
    for (final c in _textControllers) {
      c.dispose();
    }
    super.dispose();
  }

  void _onFieldChanged() {
    if (_suppressDirty) return;
    if (!_dirty) setState(() => _dirty = true);
  }

  void _markInterestsDirty() {
    if (_suppressDirty) return;
    if (!_dirty) setState(() => _dirty = true);
  }

  static String? _optionalEmailValidator(String? v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return null;
    final email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
    if (!email.hasMatch(t)) return 'Enter a valid email';
    return null;
  }

  static String? _optionalHttpUrlValidator(String? v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return null;
    if (!t.startsWith('http://') && !t.startsWith('https://')) {
      return 'URL must start with http:// or https://';
    }
    try {
      Uri.parse(t);
    } catch (_) {
      return 'Invalid URL';
    }
    return null;
  }


  bool _validateProfileFallback() {
    final emailError = _optionalEmailValidator(_email.text);
    if (emailError != null) {
      if (mounted) {
        AppNotice.error(context, emailError);
      }
      return false;
    }

    final socialValues = <String>[
      _instagram.text,
      _facebook.text,
      _twitter.text,
      _tiktok.text,
      _youtube.text,
      _website.text,
    ];
    for (final value in socialValues) {
      final urlError = _optionalHttpUrlValidator(value);
      if (urlError != null) {
        if (mounted) {
          AppNotice.error(context, urlError);
        }
        return false;
      }
    }
    return true;
  }
  void _seedControllers(
    String uid,
    MojoUserProfile? profile,
    _ProfileFormSnapshot snap,
    User auth,
  ) {
    if (_seededForUid == uid) return;
    _suppressDirty = true;
    _firstName.text = profile?.firstName ?? '';
    _lastName.text = profile?.lastName ?? '';
    final pe = profile?.email?.trim();
    _email.text = (pe != null && pe.isNotEmpty) ? pe : (auth.email ?? '');
    _about.text = snap.about?.trim() ?? '';
    _street.text = snap.street?.trim() ?? '';
    _city.text = snap.city?.trim() ?? '';
    _state.text =
        (snap.state?.trim().isNotEmpty == true) ? snap.state!.trim() : 'NJ';
    _postal.text = snap.postalCode?.trim() ?? '';
    _instagram.text = snap.instagram?.trim() ?? '';
    _facebook.text = snap.facebook?.trim() ?? '';
    _twitter.text = snap.twitter?.trim() ?? '';
    _tiktok.text = snap.tiktok?.trim() ?? '';
    _youtube.text = snap.youtube?.trim() ?? '';
    _website.text = snap.website?.trim() ?? '';
    _interests = List<String>.from(snap.interests);
    _tagInput.clear();
    _suppressDirty = false;
    _dirty = false;
    _seededForUid = uid;
    setState(() {});
  }

  Future<bool> _confirmDiscardChanges() async {
    if (!_dirty) return true;
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard changes?'),
        content: const Text('You have unsaved profile changes.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep editing'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    return r == true;
  }

  Future<void> _pickAndUploadAvatar(String uid) async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;

    final picker = ImagePicker();
    final xfile = await picker.pickImage(
      source: source,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 88,
    );
    if (xfile == null || !mounted) return;

    final file = File(xfile.path);
    final len = await file.length();
    if (len > 5 * 1024 * 1024) {
      if (mounted) {
        AppNotice.warning(context, 'Image must be under 5 MB.');
      }
      return;
    }

    final lower = xfile.path.toLowerCase();
    String ext = 'jpg';
    String contentType = 'image/jpeg';
    if (lower.endsWith('.png')) {
      ext = 'png';
      contentType = 'image/png';
    } else if (lower.endsWith('.webp')) {
      ext = 'webp';
      contentType = 'image/webp';
    } else if (lower.endsWith('.gif')) {
      ext = 'gif';
      contentType = 'image/gif';
    }

    setState(() => _uploadingPhoto = true);
    try {
      final ts = DateTime.now().millisecondsSinceEpoch;
      final storageRef =
          FirebaseStorage.instance.ref().child('profiles/$uid/avatar_$ts.$ext');
      await storageRef.putFile(
        file,
        SettableMetadata(
          contentType: contentType,
          cacheControl: 'public, max-age=3600',
        ),
      );
      final url = await storageRef.getDownloadURL();
      await ref.read(firestoreProvider).collection('users').doc(uid).update({
        'photoURL': url,
        'avatarUpdatedAt': FieldValue.serverTimestamp(),
        'updatedAt': FieldValue.serverTimestamp(),
      });
      try {
        final auth = ref.read(firebaseAuthProvider).currentUser;
        if (auth != null && auth.photoURL != url) {
          await auth.updatePhotoURL(url);
        }
      } catch (e, st) {
        appLogger.w(
          'Firebase Auth photo sync failed (non-blocking)',
          error: e,
          stackTrace: st,
        );
      }
      ref.invalidate(userProfileProvider(uid));
      ref.invalidate(_profileFormSnapshotProvider(uid));
      if (mounted) {
        AppNotice.success(context, 'Profile photo updated');
      }
    } catch (e, st) {
      appLogger.e('Avatar upload failed', error: e, stackTrace: st);
      if (mounted) {
        AppNotice.error(context, 'Photo upload failed: $e');
      }
    } finally {
      if (mounted) setState(() => _uploadingPhoto = false);
    }
  }

  void _addInterestTag() {
    final raw = _tagInput.text.trim();
    if (raw.isEmpty) return;
    var tag = raw.startsWith('#') ? raw.substring(1) : raw;
    tag = tag.trim();
    if (tag.isEmpty) return;
    if (_interests.contains(tag)) {
      _tagInput.clear();
      return;
    }
    setState(() {
      _interests = [..._interests, tag];
      _tagInput.clear();
    });
    _markInterestsDirty();
  }

  void _removeInterest(String tag) {
    setState(() {
      _interests = _interests.where((t) => t != tag).toList();
    });
    _markInterestsDirty();
  }

  Future<void> _syncFirebaseAuthProfile({
    required String displayName,
    String? firestorePhotoUrl,
  }) async {
    final auth = ref.read(firebaseAuthProvider).currentUser;
    if (auth == null) return;
    try {
      final dn = displayName.trim();
      if (dn.length >= 2 && auth.displayName != dn) {
        await auth.updateDisplayName(dn);
      }
      final pu = firestorePhotoUrl;
      if (pu != null && pu.isNotEmpty && auth.photoURL != pu) {
        await auth.updatePhotoURL(pu);
      }
    } catch (e, st) {
      appLogger.w(
        'Firebase Auth profile sync failed (non-blocking)',
        error: e,
        stackTrace: st,
      );
    }
  }

  Future<void> _saveProfile(String uid, MojoUserProfile? profile) async {
    final formState = _formKey.currentState;
    if (formState != null) {
      if (!formState.validate()) return;
    } else if (!_validateProfileFallback()) {
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();

    final st = _street.text.trim();
    final ci = _city.text.trim();
    final stt = _state.text.trim();
    final po = _postal.text.trim();
    final hasAnyAddress =
        st.isNotEmpty || ci.isNotEmpty || stt.isNotEmpty || po.isNotEmpty;
    if (hasAnyAddress && (ci.isEmpty || stt.isEmpty)) {
      AppNotice.warning(context, 'If you add an address, City and State are required.');
      return;
    }

    setState(() => _saving = true);
    try {
      final fn = _firstName.text.trim();
      final ln = _lastName.text.trim();
      final nameParts = [fn, ln].where((s) => s.isNotEmpty).toList();
      final stored = profile?.displayName?.trim();
      final displayName = nameParts.isNotEmpty
          ? nameParts.join(' ')
          : ((stored != null && stored.isNotEmpty) ? stored : 'Member');

      final cleanSocial = <String, String>{};
      void addSoc(String key, String value) {
        final t = value.trim();
        if (t.isNotEmpty) cleanSocial[key] = t;
      }

      addSoc('instagram', _instagram.text);
      addSoc('facebook', _facebook.text);
      addSoc('twitter', _twitter.text);
      addSoc('tiktok', _tiktok.text);
      addSoc('youtube', _youtube.text);
      addSoc('website', _website.text);

      final update = <String, dynamic>{
        'firstName': fn,
        'lastName': ln,
        'displayName': displayName,
        'email': _email.text.trim(),
        'about': _about.text.trim(),
        'interests': _interests,
        'social': cleanSocial,
        'updatedAt': FieldValue.serverTimestamp(),
      };

      if (hasAnyAddress) {
        update['address'] = {
          'street': st,
          'city': ci,
          'state': stt,
          'postalCode': po,
        };
      } else {
        update['address'] = FieldValue.delete();
      }

      await ref
          .read(firestoreProvider)
          .collection('users')
          .doc(uid)
          .update(update);

      await _syncFirebaseAuthProfile(
        displayName: displayName,
        firestorePhotoUrl: profile?.photoUrl?.trim(),
      );

      ref.invalidate(_profileFormSnapshotProvider(uid));
      ref.invalidate(userProfileProvider(uid));

      setState(() {
        _dirty = false;
        _isEditing = false;
      });

      if (mounted) {
        AppNotice.success(context, 'Profile updated successfully');
        if (Navigator.of(context).canPop()) {
          context.pop();
        }
      }
    } catch (e, st) {
      appLogger.e('Profile save failed', error: e, stackTrace: st);
      if (mounted) {
        AppNotice.error(context, 'Could not save profile: $e');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    if (authState.isLoading) {
      return const Scaffold(body: Center(child: AppLoadingIndicator()));
    }
    if (authState.hasError) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('My Profile',
              style: TextStyle(fontWeight: FontWeight.bold)),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Could not read auth state: ${authState.error}'),
          ),
        ),
      );
    }

    final authUser = authState.valueOrNull;
    if (authUser == null) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('My Profile',
              style: TextStyle(fontWeight: FontWeight.bold)),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.person_outline, size: 56),
                const SizedBox(height: 12),
                const Text(
                  'Sign in to view and edit your profile.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16),
                ),
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: () => context.go('/login'),
                  child: const Text('Sign in'),
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => context.go('/register'),
                  child: const Text('Create account'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final profileAsync = ref.watch(userProfileProvider(authUser.uid));
    final snapAsync = ref.watch(_profileFormSnapshotProvider(authUser.uid));
    final keyboardBottom = MediaQuery.viewInsetsOf(context).bottom;
    final safeBottom = MediaQuery.viewPaddingOf(context).bottom;
    final extraBottomSpacing = _isEditing ? 108.0 : 36.0;
    final contentBottomPadding =
        keyboardBottom + safeBottom + extraBottomSpacing;
    final isNarrow = MediaQuery.sizeOf(context).width < 360;

    return profileAsync.when(
      loading: () => const Scaffold(body: Center(child: AppLoadingIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
      data: (profile) {
        return snapAsync.when(
          loading: () =>
              const Scaffold(body: Center(child: AppLoadingIndicator())),
          error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
          data: (snap) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              _seedControllers(authUser.uid, profile, snap, authUser);
            });

            final displayName =
                profile?.resolvedPublicName?.trim().isNotEmpty == true
                    ? profile!.resolvedPublicName!.trim()
                    : (authUser.displayName ?? '');
            final email = authUser.email ?? '';
            final photoUrl = profile?.photoUrl?.trim().isNotEmpty == true
                ? profile!.photoUrl
                : authUser.photoURL;
            final role = profile?.role;
            final eventCount = profile?.eventHistory;

            return PopScope(
              canPop: !_dirty,
              onPopInvokedWithResult: (didPop, result) async {
                if (didPop) return;
                final leave = await _confirmDiscardChanges();
                if (!context.mounted) return;
                if (leave) context.pop();
              },
              child: Scaffold(
                appBar: AppBar(
                  title: Text(
                    _isEditing ? 'Edit Profile' : 'My Profile',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  elevation: 0,
                  scrolledUnderElevation: 0.5,
                  actions: [
                    if (_isEditing) ...[
                      TextButton(
                        onPressed: () async {
                          if (_dirty) {
                            final discard = await _confirmDiscardChanges();
                            if (!discard) return;
                          }
                          if (!mounted) return;
                          setState(() {
                            _seededForUid = null;
                            _isEditing = false;
                          });
                          ref.invalidate(userProfileProvider(authUser.uid));
                          ref.invalidate(
                              _profileFormSnapshotProvider(authUser.uid));
                        },
                        child: const Text('Cancel'),
                      ),
                      const SizedBox(width: 8),
                    ] else ...[
                      IconButton(
                        tooltip: 'Edit profile',
                        icon: const Icon(Icons.edit_outlined),
                        onPressed: () => setState(() => _isEditing = true),
                      ),
                      PopupMenuButton<String>(
                        icon: const Icon(Icons.more_vert),
                        onSelected: (value) async {
                          if (value == 'signout') {
                            if (!await _confirmDiscardChanges()) return;
                            await ref.read(authServiceProvider).signOut();
                            if (context.mounted) context.go('/login');
                          }
                        },
                        itemBuilder: (context) => [
                          const PopupMenuItem(
                            value: 'signout',
                            child: Row(
                              children: [
                                Icon(Icons.logout, size: 18, color: Colors.red),
                                SizedBox(width: 8),
                                Text('Sign out',
                                    style: TextStyle(color: Colors.red)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
                body: SafeArea(
                  bottom: true,
                  child: RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(userProfileProvider(authUser.uid));
                      ref.invalidate(
                          _profileFormSnapshotProvider(authUser.uid));
                      try {
                        await ref.read(
                            _profileFormSnapshotProvider(authUser.uid).future);
                      } catch (_) {}
                      if (mounted) {
                        setState(() {
                          _seededForUid = null;
                        });
                      }
                    },
                    child: CustomScrollView(
                      keyboardDismissBehavior:
                          ScrollViewKeyboardDismissBehavior.onDrag,
                      physics: const AlwaysScrollableScrollPhysics(
                        parent: BouncingScrollPhysics(),
                      ),
                      slivers: [
                        SliverPadding(
                          padding: EdgeInsets.fromLTRB(
                              20, 12, 20, contentBottomPadding),
                          sliver: SliverList(
                            delegate: SliverChildListDelegate([
                              // Hero card
                              ProfileHeroCard(
                                photoUrl: photoUrl,
                                displayName: displayName,
                                email: email,
                                role: role,
                                memberSince: snap.createdAt,
                                uploading: _uploadingPhoto,
                                onEditPhoto: () =>
                                    _pickAndUploadAvatar(authUser.uid),
                              ),
                              const SizedBox(height: 16),

                              // Stats row
                              ProfileStatsRow(
                                eventsCount: eventCount ?? 0,
                                interestsCount: _interests.length,
                                socialCount: _socialCount,
                              ),
                              const SizedBox(height: 16),

                              // Action tiles
                              ProfileActionTiles(
                                onEventsTap: () async {
                                  if (!await _confirmDiscardChanges()) return;
                                  if (context.mounted) context.go('/events');
                                },
                              ),
                              const SizedBox(height: 16),

                              // Personal Info section
                              _buildPersonalInfoSection(
                                  displayName, email, snap, isNarrow),
                              const SizedBox(height: 16),

                              // Address section
                              _buildAddressSection(isNarrow),
                              const SizedBox(height: 16),

                              // Social Links section
                              _buildSocialLinksSection(),
                              const SizedBox(height: 16),

                              // Interests section
                              _buildInterestsSection(),

                              // Save button (edit mode only)
                              if (_isEditing) ...[
                                const SizedBox(height: 24),
                                SizedBox(
                                  width: double.infinity,
                                  child: FilledButton(
                                    onPressed: _saving
                                        ? null
                                        : () =>
                                            _saveProfile(authUser.uid, profile),
                                    style: FilledButton.styleFrom(
                                      backgroundColor: MojoColors.primaryOrange,
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 16),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(16),
                                      ),
                                    ),
                                    child: _saving
                                        ? const SizedBox(
                                            width: 22,
                                            height: 22,
                                            child: AppLoadingIndicator(
                                              strokeWidth: 2,
                                              color: Colors.white,
                                            ),
                                          )
                                        : const Text('Update Profile'),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 30),
                            ]),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }


  InputDecoration _fieldDecoration({
    required String label,
    String? hint,
    IconData? icon,
    bool alignLabelWithHint = false,
    String? counterText,
  }) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: Color(0xFFE4DDD5)),
    );

    return InputDecoration(
      labelText: label,
      hintText: hint,
      isDense: true,
      alignLabelWithHint: alignLabelWithHint,
      counterText: counterText,
      prefixIcon:
          icon == null ? null : Icon(icon, size: 18, color: const Color(0xFF7B6A62)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      filled: true,
      fillColor: Colors.white.withValues(alpha: 0.92),
      hintStyle: const TextStyle(fontSize: 13, color: Color(0xFF9E928C)),
      floatingLabelStyle: const TextStyle(
        color: MojoColors.primaryOrange,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(
        borderSide: const BorderSide(color: MojoColors.primaryOrange, width: 1.4),
      ),
    );
  }
  Widget _buildPersonalInfoSection(String displayName, String email,
      _ProfileFormSnapshot snap, bool isNarrow) {
    final firstNameField = TextFormField(
      controller: _firstName,
      textCapitalization: TextCapitalization.words,
      decoration: _fieldDecoration(label: 'First name'),
    );
    final lastNameField = TextFormField(
      controller: _lastName,
      textCapitalization: TextCapitalization.words,
      decoration: _fieldDecoration(label: 'Last name'),
    );

    return ProfileSectionCard(
      icon: Icons.person_outline,
      title: 'Personal Info',
      child: _isEditing
          ? Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (isNarrow) ...[
                    firstNameField,
                    const SizedBox(height: 12),
                    lastNameField,
                  ] else
                    Row(
                      children: [
                        Expanded(child: firstNameField),
                        const SizedBox(width: 12),
                        Expanded(child: lastNameField),
                      ],
                    ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: _fieldDecoration(
                      label: 'Email (optional)',
                      hint: 'you@example.com',
                      icon: Icons.email_outlined,
                    ),
                    validator: _optionalEmailValidator,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _about,
                    minLines: 2,
                    maxLines: 4,
                    maxLength: _kAboutMaxLength,
                    buildCounter: (context,
                        {required currentLength,
                        required isFocused,
                        maxLength}) {
                      return Text(
                        '$currentLength / $maxLength',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade600,
                        ),
                      );
                    },
                    decoration: _fieldDecoration(
                      label: 'About',
                      alignLabelWithHint: true,
                      hint: 'Short bio (max $_kAboutMaxLength characters)',
                    ),
                  ),
                  if (snap.phoneNumber?.trim().isNotEmpty == true) ...[
                    const SizedBox(height: 12),
                    _viewRow(Icons.phone_outlined, snap.phoneNumber!),
                    const SizedBox(height: 4),
                    Text(
                      'To change your phone number, contact an administrator.',
                      style:
                          TextStyle(fontSize: 12, color: Colors.grey.shade600),
                    ),
                  ],
                ],
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (displayName.isNotEmpty) _viewRow(Icons.person, displayName),
                if (email.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _viewRow(Icons.email_outlined, email),
                ],
                if (_about.text.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _viewRow(Icons.info_outline, _about.text.trim()),
                ],
                if (snap.phoneNumber?.trim().isNotEmpty == true) ...[
                  const SizedBox(height: 8),
                  _viewRow(Icons.phone_outlined, snap.phoneNumber!),
                ],
              ],
            ),
    );
  }

  Widget _buildAddressSection(bool isNarrow) {
    final hasAddress = _street.text.trim().isNotEmpty ||
        _city.text.trim().isNotEmpty ||
        _state.text.trim().isNotEmpty ||
        _postal.text.trim().isNotEmpty;

    // Hide entire section in view mode if all address fields are empty
    if (!_isEditing && !hasAddress) return const SizedBox.shrink();

    return ProfileSectionCard(
      icon: Icons.location_on_outlined,
      title: 'Address',
      child: _isEditing
          ? Column(
              children: [
                TextFormField(
                  controller: _street,
                  decoration: _fieldDecoration(label: 'Street', icon: Icons.home_outlined),
                ),
                const SizedBox(height: 12),
                Builder(builder: (_) {
                  final cityField = TextFormField(
                    controller: _city,
                    textCapitalization: TextCapitalization.words,
                    decoration: _fieldDecoration(label: 'City', icon: Icons.location_city),
                  );
                  final stateField = TextFormField(
                    controller: _state,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 2,
                    decoration: _fieldDecoration(label: 'State', counterText: ''),
                  );
                  if (isNarrow) {
                    return Column(
                      children: [
                        cityField,
                        const SizedBox(height: 12),
                        stateField,
                      ],
                    );
                  }
                  return Row(
                    children: [
                      Expanded(flex: 2, child: cityField),
                      const SizedBox(width: 12),
                      Expanded(child: stateField),
                    ],
                  );
                }),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _postal,
                  keyboardType: TextInputType.text,
                  decoration: _fieldDecoration(label: 'ZIP code', icon: Icons.markunread_mailbox_outlined),
                ),
                const SizedBox(height: 4),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'If you add an address, City and State are required.',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                ),
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_street.text.trim().isNotEmpty)
                  _viewRow(Icons.home_outlined, _street.text.trim()),
                if (_city.text.trim().isNotEmpty ||
                    _state.text.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _viewRow(
                    Icons.location_city,
                    [_city.text.trim(), _state.text.trim()]
                        .where((s) => s.isNotEmpty)
                        .join(', '),
                  ),
                ],
                if (_postal.text.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _viewRow(
                      Icons.markunread_mailbox_outlined, _postal.text.trim()),
                ],
              ],
            ),
    );
  }

  Widget _buildSocialLinksSection() {
    const platformMap = <String, _SocialPlatform>{
      'instagram': _SocialPlatform('Instagram URL', Icons.camera_alt_outlined),
      'facebook': _SocialPlatform('Facebook URL', Icons.facebook_outlined),
      'twitter': _SocialPlatform('Twitter / X URL', Icons.alternate_email),
      'tiktok': _SocialPlatform('TikTok URL', Icons.music_note_outlined),
      'youtube': _SocialPlatform('YouTube URL', Icons.play_circle_outline),
      'website': _SocialPlatform('Website URL', Icons.language),
    };

    final controllers = <String, TextEditingController>{
      'instagram': _instagram,
      'facebook': _facebook,
      'twitter': _twitter,
      'tiktok': _tiktok,
      'youtube': _youtube,
      'website': _website,
    };

    return ProfileSectionCard(
      icon: Icons.link,
      title: 'Social Links',
      child: _isEditing
          ? Column(
              children: [
                for (final entry in platformMap.entries) ...[
                  TextFormField(
                    controller: controllers[entry.key]!,
                    keyboardType: TextInputType.url,
                    decoration: _fieldDecoration(
                      label: entry.value.label,
                      icon: entry.value.icon,
                    ),
                    validator: _optionalHttpUrlValidator,
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final entry in platformMap.entries)
                  if (controllers[entry.key]!.text.trim().isNotEmpty) ...[
                    _viewRow(
                      entry.value.icon,
                      controllers[entry.key]!.text.trim(),
                    ),
                    const SizedBox(height: 8),
                  ],
                if (_socialCount == 0)
                  Text(
                    'No social links added',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade500,
                    ),
                  ),
              ],
            ),
    );
  }

  Widget _buildInterestsSection() {
    return ProfileSectionCard(
      icon: Icons.interests_outlined,
      title: 'Interests',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _interests
                .map(
                  (tag) => Chip(
                    label: Text('#$tag', style: const TextStyle(fontSize: 12)),
                    onDeleted: _isEditing ? () => _removeInterest(tag) : null,
                    deleteIconColor: MojoColors.primaryOrange,
                    backgroundColor:
                        MojoColors.primaryOrange.withValues(alpha: 0.1),
                    side: BorderSide.none,
                  ),
                )
                .toList(),
          ),
          if (_isEditing) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _tagInput,
                    decoration: _fieldDecoration(
                      label: 'Add interest',
                      hint: 'e.g. yoga',
                    ),
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _addInterestTag(),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.tonal(
                  onPressed: _addInterestTag,
                  child: const Text('Add'),
                ),
              ],
            ),
          ],
          if (!_isEditing && _interests.isEmpty)
            Text(
              'No interests added',
              style: TextStyle(fontSize: 14, color: Colors.grey.shade500),
            ),
        ],
      ),
    );
  }

  Widget _viewRow(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 18, color: Colors.black54),
        const SizedBox(width: 10),
        Expanded(
          child: Text(text,
              style: const TextStyle(fontSize: 14, color: Colors.black87)),
        ),
      ],
    );
  }
}

class _SocialPlatform {
  const _SocialPlatform(this.label, this.icon);
  final String label;
  final IconData icon;
}
















