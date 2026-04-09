import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/providers/core_providers.dart';
import '../../../core/theme/mojo_colors.dart';
import '../../../data/models/mojo_user_profile.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

/// DM picker: uses [searchMembers] Cloud Function (prefix search + phone digits server-side),
/// with Firestore client fallback if the callable is unavailable.
Future<void> showDirectMessageUserSheet(BuildContext context) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => const DirectMessageUserSheet(),
  );
}

class DirectMessageUserSheet extends ConsumerStatefulWidget {
  const DirectMessageUserSheet({super.key});

  @override
  ConsumerState<DirectMessageUserSheet> createState() =>
      _DirectMessageUserSheetState();
}

class _DirectMessageUserSheetState extends ConsumerState<DirectMessageUserSheet> {
  final _search = TextEditingController();
  Timer? _debounce;

  List<MojoUserProfile> _members = [];
  bool _loading = false;
  String? _poolError;
  bool _usedFallback = false;

  @override
  void initState() {
    super.initState();
    _search.addListener(_onSearchChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) => _fetchMembers());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.removeListener(_onSearchChanged);
    _search.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _fetchMembers);
  }

  Future<void> _fetchMembers() async {
    final q = _search.text.trim();
    setState(() {
      _loading = true;
      _poolError = null;
    });

    try {
      final callable =
          ref.read(firebaseFunctionsProvider).httpsCallable('searchMembers');
      final res = await callable.call(<String, dynamic>{
        'query': q,
        'limit': 50,
      });
      final data = Map<String, dynamic>.from(res.data as Map);
      final raw = data['members'] as List<dynamic>? ?? [];
      final list = raw
          .map(
            (e) => MojoUserProfile.fromMemberSearchJson(
              Map<String, dynamic>.from(e as Map),
            ),
          )
          .toList();
      if (!mounted) return;
      setState(() {
        _members = list;
        _loading = false;
        _usedFallback = false;
      });
    } catch (e, st) {
      appLogger.w(
        'searchMembers callable failed, using Firestore fallback',
        error: e,
        stackTrace: st,
      );
      await _loadMemberPoolFirestore(q);
    }
  }

  /// Offline / pre-deploy fallback (same as earlier client-only behavior).
  Future<void> _loadMemberPoolFirestore(String query) async {
    final fs = ref.read(firestoreProvider);
    final me = ref.read(firebaseAuthProvider).currentUser?.uid ?? '';
    final q = query.trim().toLowerCase();

    try {
      QuerySnapshot<Map<String, dynamic>> snap;
      try {
        snap = await fs
            .collection('users')
            .orderBy('displayNameLower')
            .limit(200)
            .get();
      } catch (e, st) {
        appLogger.w(
          'DM fallback: orderBy failed',
          error: e,
          stackTrace: st,
        );
        snap = await fs.collection('users').limit(200).get();
      }

      var list = <MojoUserProfile>[];
      for (final doc in snap.docs) {
        if (doc.id == me) continue;
        final p = MojoUserProfile.fromDoc(doc);
        if (!p.isApproved) continue;
        list.add(p);
      }
      if (q.isNotEmpty) {
        list = list.where((p) => p.matchesMemberSearch(q)).take(100).toList();
      }
      list.sort(
        (a, b) => (a.resolvedPublicName ?? a.uid)
            .toLowerCase()
            .compareTo((b.resolvedPublicName ?? b.uid).toLowerCase()),
      );
      if (!mounted) return;
      setState(() {
        _members = list;
        _loading = false;
        _usedFallback = true;
        _poolError = null;
      });
    } catch (e, st) {
      appLogger.e('DM fallback load failed', error: e, stackTrace: st);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _usedFallback = true;
        _poolError =
            'Could not load members. Deploy `searchMembers` function or check connection.';
      });
    }
  }

  Future<void> _openChat(MojoUserProfile peer) async {
    final nav = Navigator.of(context);
    final router = GoRouter.of(context);
    final title = peer.resolvedPublicName ?? 'Member';
    try {
      final roomId =
          await ref.read(chatServiceProvider).getOrCreateDirectRoom(peer.uid);
      if (!mounted) return;
      nav.pop();
      router.push(
        '/chat/$roomId?name=${Uri.encodeComponent(title)}',
      );
    } catch (e, st) {
      appLogger.e('getOrCreateDirectRoom failed', error: e, stackTrace: st);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open chat: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    final q = _search.text.trim();
    final sheetHeight = MediaQuery.of(context).size.height * 0.88;

    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: Container(
        height: sheetHeight,
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Message someone',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: MojoColors.textPrimary,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Text(
                _usedFallback
                    ? 'Using on-device list (deploy searchMembers for faster server search). Search by name, email, phone digits, or uid.'
                    : 'Server search by name & email prefix; phone numbers when you type 3+ digits. Clear the box to browse.',
                style: TextStyle(
                  fontSize: 13,
                  height: 1.35,
                  color: MojoColors.textSecondary.withValues(alpha: 0.9),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: TextField(
                controller: _search,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'Searchâ€¦',
                  filled: true,
                  fillColor: MojoColors.background,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: const Icon(Icons.search_rounded),
                ),
              ),
            ),
            const SizedBox(height: 8),
            if (_poolError != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  _poolError!,
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.red.shade700,
                  ),
                ),
              ),
            Expanded(
              child: _loading
                  ? const Center(child: AppLoadingIndicator())
                  : _members.isEmpty
                      ? Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(
                            q.isEmpty
                                ? 'No other approved members found yet.'
                                : 'No matching members. Try another search or clear to browse.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: MojoColors.textSecondary
                                  .withValues(alpha: 0.85),
                              height: 1.4,
                            ),
                          ),
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (q.isEmpty && _members.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.fromLTRB(20, 4, 20, 6),
                                child: Text(
                                  'Members (${_members.length})',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: 0.4,
                                    color: MojoColors.textSecondary
                                        .withValues(alpha: 0.7),
                                  ),
                                ),
                              ),
                            Expanded(
                              child: ListView.separated(
                                itemCount: _members.length,
                                separatorBuilder: (_, __) =>
                                    const Divider(height: 1),
                                itemBuilder: (context, i) {
                                  final p = _members[i];
                                  final name = p.resolvedPublicName ?? 'Member';
                                  final sub = _subtitleFor(p);
                                  return ListTile(
                                    leading: CircleAvatar(
                                      backgroundColor: MojoColors.primaryOrange
                                          .withValues(alpha: 0.2),
                                      child: Text(
                                        name.isNotEmpty
                                            ? name[0].toUpperCase()
                                            : '?',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w700,
                                          color: MojoColors.primaryOrange,
                                        ),
                                      ),
                                    ),
                                    title: Text(
                                      name,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    subtitle: sub != null
                                        ? Text(
                                            sub,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          )
                                        : null,
                                    onTap: () => _openChat(p),
                                  );
                                },
                              ),
                            ),
                          ],
                        ),
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom + 12),
          ],
        ),
      ),
    );
  }

  String? _subtitleFor(MojoUserProfile p) {
    if (p.email != null && p.email!.trim().isNotEmpty) return p.email;
    if (p.phoneNumber != null && p.phoneNumber!.trim().isNotEmpty) {
      return p.phoneNumber;
    }
    return null;
  }
}

