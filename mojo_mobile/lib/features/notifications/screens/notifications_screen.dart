import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/logging/app_logger.dart';
import '../../../core/providers/core_providers.dart';

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
      final callable = ref.read(firebaseFunctionsProvider).httpsCallable('markAllNotificationsAsRead');
      final res = await callable.call();
      final raw = res.data;
      final map = raw is Map ? Map<String, dynamic>.from(raw) : <String, dynamic>{};
      final msg = map['message'] as String? ?? 'Done';
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } on FirebaseFunctionsException catch (e, st) {
      appLogger.w('markAllNotificationsAsRead failed', error: e, stackTrace: st);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message ?? 'Could not mark all as read')),
        );
      }
    } catch (e, st) {
      appLogger.w('markAllNotificationsAsRead failed', error: e, stackTrace: st);
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
    if (approvalId.isNotEmpty && (type == 'general' || type.contains('approval'))) {
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
    final async = ref.watch(notificationsStreamProvider);
    final fs = ref.watch(firestoreProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: () => _markAllRead(ref, context),
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: async.when(
        data: (docs) {
          if (docs.isEmpty) {
            return Center(
              child: Text(
                'No notifications yet.',
                style: TextStyle(color: scheme.onSurfaceVariant),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: docs.length,
            separatorBuilder: (_, __) => Divider(height: 1, color: scheme.outlineVariant),
            itemBuilder: (context, i) {
              final doc = docs[i];
              final data = doc.data();
              final read = data['read'] == true;
              final title = _stringOf(data['title']).isEmpty
                  ? _stringOf(data['type']).replaceAll('_', ' ')
                  : _stringOf(data['title']);
              final message = _stringOf(data['message']);
              final created = data['createdAt'] is Timestamp ? data['createdAt'] as Timestamp : null;

              return ListTile(
                title: Text(
                  title,
                  style: TextStyle(
                    fontWeight: read ? FontWeight.w500 : FontWeight.w700,
                  ),
                ),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (message.isNotEmpty) Text(message),
                    if (created != null)
                      Text(
                        _timeAgo(created),
                        style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant),
                      ),
                  ],
                ),
                trailing: read ? null : Icon(Icons.circle, size: 10, color: scheme.primary),
                onTap: () => _onTap(context, ref, doc, fs),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load notifications: $e')),
      ),
    );
  }
}
