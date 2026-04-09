import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/providers/core_providers.dart';
import 'package:mojo_mobile/core/widgets/app_loading_indicator.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  static String _stringOf(dynamic v) {
    if (v == null) return '';
    if (v is String) return v;
    return v.toString();
  }

  static String _timeAgo(Timestamp? ts) {
    if (ts == null) return '';
    final t = ts.toDate();
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('MMM d, y').format(t);
  }

  static IconData _iconForType(String type) {
    if (type.contains('event')) return Icons.celebration_rounded;
    if (type.contains('approved')) return Icons.verified_rounded;
    if (type.contains('rejected')) return Icons.gpp_bad_rounded;
    if (type.contains('payment')) return Icons.payments_rounded;
    if (type.contains('chat') || type.contains('message')) {
      return Icons.forum_rounded;
    }
    return Icons.notifications_active_rounded;
  }

  static List<Color> _gradientForType(String type, ColorScheme scheme) {
    if (type.contains('approved')) {
      return const [Color(0xFF16A34A), Color(0xFF22C55E)];
    }
    if (type.contains('rejected')) {
      return const [Color(0xFFDC2626), Color(0xFFFB7185)];
    }
    if (type.contains('event')) {
      return const [Color(0xFFF97316), Color(0xFFEC4899)];
    }
    if (type.contains('chat') || type.contains('message')) {
      return const [Color(0xFF0EA5E9), Color(0xFF6366F1)];
    }
    return [scheme.primary, scheme.secondary];
  }

  Future<void> _markRead(FirebaseFirestore fs, String id) async {
    try {
      await fs.collection('notifications').doc(id).update({
        'read': true,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (e, st) {
      appLogger.w('mark notification read failed', error: e, stackTrace: st);
    }
  }

  Future<void> _markAllRead(WidgetRef ref, BuildContext context) async {
    try {
      final callable = ref
          .read(firebaseFunctionsProvider)
          .httpsCallable('markAllNotificationsAsRead');
      final res = await callable.call();
      final raw = res.data;
      final map =
          raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
      final msg = map['message'] as String? ?? 'Done';
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    } on FirebaseFunctionsException catch (e, st) {
      appLogger.w('markAllNotificationsAsRead failed',
          error: e, stackTrace: st);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message ?? 'Could not mark all as read')),
        );
      }
    } catch (e, st) {
      appLogger.w('markAllNotificationsAsRead failed',
          error: e, stackTrace: st);
    }
  }

  void _onTap(
    BuildContext context,
    WidgetRef ref,
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
    FirebaseFirestore fs,
  ) {
    final data = doc.data();
    final id = doc.id;
    unawaited(_markRead(fs, id));

    final eventId = _stringOf(data['eventId']);
    if (eventId.isNotEmpty) {
      context.go('/event/$eventId');
      return;
    }

    final meta = data['metadata'];
    final approvalId = meta is Map ? _stringOf(meta['relatedId']) : '';
    final type = _stringOf(data['type']);
    if (approvalId.isNotEmpty &&
        (type == 'general' || type.contains('approval'))) {
      context.go('/profile');
      return;
    }

    if (type == 'account_approved' || type == 'account_rejected') {
      context.go('/');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final async = ref.watch(notificationsStreamProvider);
    final fs = ref.watch(firestoreProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: TextButton.icon(
              onPressed: () => _markAllRead(ref, context),
              icon: const Icon(Icons.done_all_rounded, size: 18),
              label: const Text('Mark all read'),
            ),
          ),
        ],
      ),
      body: async.when(
        data: (docs) {
          final unread = docs.where((d) => d.data()['read'] != true).length;
          if (docs.isEmpty) {
            return Center(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 24),
                padding:
                    const EdgeInsets.symmetric(horizontal: 22, vertical: 28),
                decoration: BoxDecoration(
                  color: scheme.surface,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: scheme.outlineVariant),
                  boxShadow: [
                    BoxShadow(
                      color: scheme.shadow.withOpacity(0.08),
                      blurRadius: 22,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(
                          colors: [
                            scheme.primary.withOpacity(0.85),
                            scheme.secondary.withOpacity(0.85),
                          ],
                        ),
                      ),
                      child: const Icon(
                        Icons.notifications_none_rounded,
                        color: Colors.white,
                        size: 30,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'No notifications yet',
                      style: textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'We will notify you here when something important happens.',
                      textAlign: TextAlign.center,
                      style: textTheme.bodyMedium?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
            itemCount: docs.length + 1,
            itemBuilder: (context, i) {
              if (i == 0) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(20),
                    gradient: LinearGradient(
                      colors: [
                        scheme.primary.withOpacity(0.12),
                        scheme.secondary.withOpacity(0.12),
                      ],
                    ),
                    border: Border.all(color: scheme.primary.withOpacity(0.22)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: scheme.primary.withOpacity(0.16),
                        ),
                        child: Icon(
                          Icons.notifications_active_rounded,
                          color: scheme.primary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Your updates',
                              style: textTheme.titleSmall?.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              '$unread unread of ${docs.length} total',
                              style: textTheme.bodySmall?.copyWith(
                                color: scheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }

              final doc = docs[i - 1];
              final data = doc.data();
              final read = data['read'] == true;
              final type = _stringOf(data['type']).toLowerCase();
              final title = _stringOf(data['title']).isEmpty
                  ? _stringOf(data['type']).replaceAll('_', ' ')
                  : _stringOf(data['title']);
              final message = _stringOf(data['message']);
              final created = data['createdAt'] is Timestamp
                  ? data['createdAt'] as Timestamp
                  : null;
              final timeAgo = _timeAgo(created);
              final icon = _iconForType(type);
              final iconGradient = _gradientForType(type, scheme);

              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: InkWell(
                  borderRadius: BorderRadius.circular(20),
                  onTap: () => _onTap(context, ref, doc, fs),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                    decoration: BoxDecoration(
                      color: read
                          ? scheme.surface
                          : scheme.primaryContainer.withOpacity(0.28),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: read
                            ? scheme.outlineVariant.withOpacity(0.7)
                            : scheme.primary.withOpacity(0.34),
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: scheme.shadow.withOpacity(read ? 0.05 : 0.09),
                          blurRadius: read ? 10 : 16,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(14),
                            gradient: LinearGradient(colors: iconGradient),
                          ),
                          child: Icon(icon, color: Colors.white, size: 24),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: textTheme.titleSmall?.copyWith(
                                        fontWeight: read
                                            ? FontWeight.w600
                                            : FontWeight.w800,
                                      ),
                                    ),
                                  ),
                                  if (!read)
                                    Container(
                                      width: 8,
                                      height: 8,
                                      margin: const EdgeInsets.only(left: 6),
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: scheme.primary,
                                      ),
                                    ),
                                ],
                              ),
                              if (message.isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text(
                                  message,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: textTheme.bodyMedium?.copyWith(
                                    color: scheme.onSurfaceVariant,
                                    height: 1.35,
                                  ),
                                ),
                              ],
                              if (timeAgo.isNotEmpty) ...[
                                const SizedBox(height: 10),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: scheme.surfaceVariant.withOpacity(
                                      read ? 0.85 : 0.6,
                                    ),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    timeAgo,
                                    style: textTheme.labelSmall?.copyWith(
                                      color: scheme.onSurfaceVariant,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: AppLoadingIndicator()),
        error: (e, _) => Center(
          child: Text(
            'Could not load notifications: $e',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}

