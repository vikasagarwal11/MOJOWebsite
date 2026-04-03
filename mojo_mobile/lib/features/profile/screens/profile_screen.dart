import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_user_profile.dart';

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
}

final _profileFormSnapshotProvider =
    FutureProvider.family<_ProfileFormSnapshot, String>((ref, uid) async {
  final snap = await ref.watch(firestoreProvider).collection('users').doc(uid).get();
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
    _state.text = (snap.state?.trim().isNotEmpty == true) ? snap.state!.trim() : 'NJ';
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Image must be under 5 MB.')),
        );
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile photo updated')),
        );
      }
    } catch (e, st) {
      appLogger.e('Avatar upload failed', error: e, stackTrace: st);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Photo upload failed: $e')),
        );
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

  /// Keeps Firebase Auth display name / photo in sync with Firestore (helps APIs that read Auth only).
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
    if (!_formKey.currentState!.validate()) return;

    final st = _street.text.trim();
    final ci = _city.text.trim();
    final stt = _state.text.trim();
    final po = _postal.text.trim();
    final hasAnyAddress = st.isNotEmpty || ci.isNotEmpty || stt.isNotEmpty || po.isNotEmpty;
    if (hasAnyAddress && (ci.isEmpty || stt.isEmpty)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('If you add an address, City and State are required.'),
        ),
      );
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

      await ref.read(firestoreProvider).collection('users').doc(uid).update(update);

      await _syncFirebaseAuthProfile(
        displayName: displayName,
        firestorePhotoUrl: profile?.photoUrl?.trim(),
      );

      ref.invalidate(_profileFormSnapshotProvider(uid));
      ref.invalidate(userProfileProvider(uid));

      setState(() => _dirty = false);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile saved')),
        );
      }
    } catch (e, st) {
      appLogger.e('Profile save failed', error: e, stackTrace: st);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not save profile: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final authUser = ref.watch(authStateProvider).valueOrNull;
    if (authUser == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final profileAsync = ref.watch(userProfileProvider(authUser.uid));
    final snapAsync = ref.watch(_profileFormSnapshotProvider(authUser.uid));
    final keyboardBottom = MediaQuery.viewInsetsOf(context).bottom;

    return profileAsync.when(
      loading: () => const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
      data: (profile) {
        return snapAsync.when(
          loading: () =>
              const Scaffold(body: Center(child: CircularProgressIndicator())),
          error: (e, _) => Scaffold(body: Center(child: Text('Error: $e'))),
          data: (snap) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              _seedControllers(authUser.uid, profile, snap, authUser);
            });

            final displayName = profile?.resolvedPublicName?.trim().isNotEmpty == true
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
                  title: const Text('My Profile',
                      style: TextStyle(fontWeight: FontWeight.bold)),
                  elevation: 0,
                  actions: [
                    TextButton.icon(
                      onPressed: () async {
                        if (!await _confirmDiscardChanges()) return;
                        await ref.read(authServiceProvider).signOut();
                        if (context.mounted) context.go('/login');
                      },
                      icon: const Icon(Icons.logout, size: 18),
                      label: const Text('Sign out'),
                      style: TextButton.styleFrom(
                          foregroundColor: Colors.red.shade400),
                    ),
                  ],
                ),
                body: RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(userProfileProvider(authUser.uid));
                    ref.invalidate(_profileFormSnapshotProvider(authUser.uid));
                    try {
                      await ref
                          .read(_profileFormSnapshotProvider(authUser.uid).future);
                    } catch (_) {}
                    if (mounted) {
                      setState(() {
                        _seededForUid = null;
                      });
                    }
                  },
                  child: SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(
                      parent: BouncingScrollPhysics(),
                    ),
                    padding: EdgeInsets.fromLTRB(20, 20, 20, 24 + keyboardBottom),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(24),
                            decoration: BoxDecoration(
                              gradient: MojoColors.mainGradient,
                              borderRadius: BorderRadius.circular(24),
                              boxShadow: [
                                BoxShadow(
                                  color: MojoColors.primaryOrange
                                      .withValues(alpha: 0.3),
                                  blurRadius: 15,
                                  offset: const Offset(0, 8),
                                ),
                              ],
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _AvatarWithEdit(
                                  photoUrl: photoUrl,
                                  displayName: displayName,
                                  uploading: _uploadingPhoto,
                                  onEdit: () => _pickAndUploadAvatar(authUser.uid),
                                ),
                                const SizedBox(width: 16),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        displayName.isNotEmpty
                                            ? displayName
                                            : 'Mojo Member',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 20,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      if (email.isNotEmpty)
                                        Text(
                                          email,
                                          style: const TextStyle(
                                              color: Colors.white70,
                                              fontSize: 13),
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                      if (role != null) ...[
                                        const SizedBox(height: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 10, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: Colors.white
                                                .withValues(alpha: 0.2),
                                            borderRadius:
                                                BorderRadius.circular(20),
                                          ),
                                          child: Text(
                                            role[0].toUpperCase() +
                                                role.substring(1),
                                            style: const TextStyle(
                                                color: Colors.white,
                                                fontSize: 12),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 24),

                          Text(
                            'Edit profile',
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Matches the website: name, email, photo, address, social links, and interests.',
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.grey.shade700,
                            ),
                          ),
                          const SizedBox(height: 16),

                          Row(
                            children: [
                              Expanded(
                                child: TextFormField(
                                  controller: _firstName,
                                  textCapitalization: TextCapitalization.words,
                                  decoration: InputDecoration(
                                    labelText: 'First name',
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: TextFormField(
                                  controller: _lastName,
                                  textCapitalization: TextCapitalization.words,
                                  decoration: InputDecoration(
                                    labelText: 'Last name',
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            decoration: InputDecoration(
                              labelText: 'Email (optional)',
                              hintText: 'you@example.com',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            validator: _optionalEmailValidator,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _about,
                            minLines: 3,
                            maxLines: 6,
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
                            decoration: InputDecoration(
                              labelText: 'About',
                              alignLabelWithHint: true,
                              hintText: 'Short bio (max $_kAboutMaxLength characters)',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                          ),

                          const SizedBox(height: 24),
                          Text(
                            'Address (optional)',
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'If you add an address, City and State are required.',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _street,
                            decoration: InputDecoration(
                              labelText: 'Street',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                flex: 2,
                                child: TextFormField(
                                  controller: _city,
                                  textCapitalization: TextCapitalization.words,
                                  decoration: InputDecoration(
                                    labelText: 'City',
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: TextFormField(
                                  controller: _state,
                                  textCapitalization: TextCapitalization.characters,
                                  maxLength: 2,
                                  decoration: InputDecoration(
                                    labelText: 'State',
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _postal,
                            keyboardType: TextInputType.text,
                            decoration: InputDecoration(
                              labelText: 'ZIP code',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                          ),

                          const SizedBox(height: 24),
                          Text(
                            'Social links (optional)',
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 8),
                          TextFormField(
                            controller: _instagram,
                            keyboardType: TextInputType.url,
                            decoration: InputDecoration(
                              labelText: 'Instagram URL',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            validator: _optionalHttpUrlValidator,
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _facebook,
                            keyboardType: TextInputType.url,
                            decoration: InputDecoration(
                              labelText: 'Facebook URL',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            validator: _optionalHttpUrlValidator,
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _twitter,
                            keyboardType: TextInputType.url,
                            decoration: InputDecoration(
                              labelText: 'Twitter / X URL',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            validator: _optionalHttpUrlValidator,
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _tiktok,
                            keyboardType: TextInputType.url,
                            decoration: InputDecoration(
                              labelText: 'TikTok URL',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            validator: _optionalHttpUrlValidator,
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _youtube,
                            keyboardType: TextInputType.url,
                            decoration: InputDecoration(
                              labelText: 'YouTube URL',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            validator: _optionalHttpUrlValidator,
                          ),
                          const SizedBox(height: 12),
                          TextFormField(
                            controller: _website,
                            keyboardType: TextInputType.url,
                            decoration: InputDecoration(
                              labelText: 'Website URL',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            validator: _optionalHttpUrlValidator,
                          ),

                          const SizedBox(height: 24),
                          Text(
                            'Interests',
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall
                                ?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Type a tag and tap Add (or use #yoga). Saved with Save profile.',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: _interests
                                .map(
                                  (tag) => Chip(
                                    label: Text(tag,
                                        style: const TextStyle(fontSize: 12)),
                                    onDeleted: () => _removeInterest(tag),
                                    deleteIconColor: MojoColors.primaryOrange,
                                    backgroundColor: MojoColors.primaryOrange
                                        .withValues(alpha: 0.1),
                                    side: BorderSide.none,
                                  ),
                                )
                                .toList(),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _tagInput,
                                  decoration: InputDecoration(
                                    labelText: 'Add interest',
                                    hintText: 'e.g. yoga',
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(16),
                                    ),
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

                          if (snap.phoneNumber?.trim().isNotEmpty == true) ...[
                            const SizedBox(height: 24),
                            const Text('Phone',
                                style: TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 8),
                            _InfoRow(
                              icon: Icons.phone_outlined,
                              text: snap.phoneNumber!,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'To change your phone number, contact an administrator.',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],

                          const SizedBox(height: 24),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              onPressed: _saving
                                  ? null
                                  : () => _saveProfile(authUser.uid, profile),
                              style: FilledButton.styleFrom(
                                backgroundColor: MojoColors.primaryOrange,
                                padding:
                                    const EdgeInsets.symmetric(vertical: 16),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                              ),
                              child: _saving
                                  ? const SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : const Text('Save profile'),
                            ),
                          ),

                          if (eventCount != null) ...[
                            const SizedBox(height: 24),
                            _StatCard(
                              icon: Icons.event_available,
                              label: 'Events Attended',
                              value: '$eventCount',
                            ),
                          ],

                          const SizedBox(height: 24),

                          _ActionTile(
                            icon: Icons.event_outlined,
                            title: "I'm Going",
                            subtitle: 'Events where you are marked Going',
                            onTap: () async {
                              if (!await _confirmDiscardChanges()) return;
                              if (context.mounted) context.go('/events');
                            },
                          ),
                          const SizedBox(height: 12),
                          _ActionTile(
                            icon: Icons.chat_bubble_outline,
                            title: 'Community Chat',
                            subtitle: 'Join the conversation',
                            onTap: () async {
                              if (!await _confirmDiscardChanges()) return;
                              if (context.mounted) context.go('/chat');
                            },
                          ),
                          const SizedBox(height: 30),
                        ],
                      ),
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
}

class _AvatarWithEdit extends StatelessWidget {
  const _AvatarWithEdit({
    required this.photoUrl,
    required this.displayName,
    required this.uploading,
    required this.onEdit,
  });

  final String? photoUrl;
  final String displayName;
  final bool uploading;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        CircleAvatar(
          radius: 40,
          backgroundColor: Colors.white.withValues(alpha: 0.3),
          backgroundImage: photoUrl != null && photoUrl!.isNotEmpty
              ? CachedNetworkImageProvider(photoUrl!)
              : null,
          child: photoUrl == null || photoUrl!.isEmpty
              ? Text(
                  displayName.isNotEmpty
                      ? displayName[0].toUpperCase()
                      : '?',
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.bold),
                )
              : null,
        ),
        Positioned(
          right: -4,
          bottom: -4,
          child: Material(
            color: Colors.white,
            shape: const CircleBorder(),
            elevation: 2,
            child: IconButton(
              tooltip: 'Change photo',
              iconSize: 20,
              padding: const EdgeInsets.all(6),
              constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
              onPressed: uploading ? null : onEdit,
              icon: uploading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Icon(Icons.camera_alt, color: MojoColors.primaryOrange),
            ),
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard(
      {required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.04), blurRadius: 8),
        ],
      ),
      child: Row(
        children: [
          Icon(icon, color: MojoColors.primaryOrange),
          const SizedBox(width: 12),
          Text(label,
              style: const TextStyle(fontSize: 14, color: Colors.black54)),
          const Spacer(),
          Text(value,
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.04), blurRadius: 6),
        ],
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.black54),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: const TextStyle(fontSize: 14, color: Colors.black87)),
          ),
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile(
      {required this.icon,
      required this.title,
      required this.subtitle,
      required this.onTap});

  final IconData icon;
  final String title;
  final String subtitle;
  final Future<void> Function() onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: () async => onTap(),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Icon(icon, color: MojoColors.primaryOrange),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(subtitle,
                        style: const TextStyle(
                            fontSize: 12, color: Colors.black54)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Colors.black38),
            ],
          ),
        ),
      ),
    );
  }
}
