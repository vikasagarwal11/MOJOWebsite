import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers/core_providers.dart';

/// Aligns with website `media` docs: `type` (image | video | reel), optional `eventId`.
enum MediaGalleryFilter { all, images, videos, events }

// ---------------------------------------------------------------------------
// CommentData
// ---------------------------------------------------------------------------

class CommentData {
  final String userId;
  final String userName;
  final String text;
  final DateTime createdAt;

  const CommentData({
    required this.userId,
    required this.userName,
    required this.text,
    required this.createdAt,
  });

  factory CommentData.fromMap(Map<String, dynamic> map) {
    return CommentData(
      userId: (map['userId'] as String?) ?? '',
      userName: (map['userName'] as String?) ?? '',
      text: (map['text'] as String?) ?? '',
      createdAt: map['createdAt'] is Timestamp
          ? (map['createdAt'] as Timestamp).toDate()
          : DateTime.tryParse(map['createdAt']?.toString() ?? '') ??
              DateTime.now(),
    );
  }
}

// ---------------------------------------------------------------------------
// MediaItem
// ---------------------------------------------------------------------------

class MediaItem {
  final String id;
  final String url;
  final String thumbnailUrl;
  final String type; // 'image' | 'video'
  final String uploadedBy;
  final String uploaderName;
  final String caption;
  final DateTime createdAt;
  final int likesCount;
  final int commentsCount;
  final List<String> likes;
  final List<CommentData> comments;
  final String filePath;
  final String storageFolder;

  const MediaItem({
    required this.id,
    required this.url,
    required this.thumbnailUrl,
    required this.type,
    required this.uploadedBy,
    required this.uploaderName,
    required this.caption,
    required this.createdAt,
    required this.likesCount,
    required this.commentsCount,
    required this.likes,
    required this.comments,
    required this.filePath,
    required this.storageFolder,
  });

  bool isLikedBy(String uid) => likes.contains(uid);
  bool isOwnedBy(String uid) => uploadedBy == uid;

  factory MediaItem.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return MediaItem(
      id: doc.id,
      url: (data['url'] as String?) ?? '',
      thumbnailUrl:
          (data['thumbnailUrl'] as String?) ?? (data['url'] as String?) ?? '',
      type: (data['type'] as String?) ?? 'image',
      uploadedBy: (data['uploadedBy'] as String?) ?? '',
      uploaderName: (data['uploaderName'] as String?) ?? 'Unknown',
      caption: (data['caption'] as String?) ?? '',
      createdAt: data['createdAt'] is Timestamp
          ? (data['createdAt'] as Timestamp).toDate()
          : DateTime.now(),
      likesCount: (data['likesCount'] as num?)?.toInt() ?? 0,
      commentsCount: (data['commentsCount'] as num?)?.toInt() ?? 0,
      likes: (data['likes'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          const [],
      comments: (data['comments'] as List<dynamic>?)
              ?.map((e) => CommentData.fromMap(e as Map<String, dynamic>))
              .toList() ??
          const [],
      filePath: (data['filePath'] as String?) ?? '',
      storageFolder: (data['storageFolder'] as String?) ?? '',
    );
  }
}

// ---------------------------------------------------------------------------
// FeedState
// ---------------------------------------------------------------------------

class FeedState {
  final List<MediaItem> items;
  final bool isLoading;
  final bool hasMore;
  final Object? error;
  final MediaGalleryFilter filter;
  final DocumentSnapshot? lastDocument;

  const FeedState({
    this.items = const [],
    this.isLoading = false,
    this.hasMore = true,
    this.error,
    this.filter = MediaGalleryFilter.all,
    this.lastDocument,
  });

  FeedState copyWith({
    List<MediaItem>? items,
    bool? isLoading,
    bool? hasMore,
    Object? error,
    MediaGalleryFilter? filter,
    DocumentSnapshot? lastDocument,
    bool clearError = false,
    bool clearLastDocument = false,
  }) {
    return FeedState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      hasMore: hasMore ?? this.hasMore,
      error: clearError ? null : (error ?? this.error),
      filter: filter ?? this.filter,
      lastDocument:
          clearLastDocument ? null : (lastDocument ?? this.lastDocument),
    );
  }
}

// ---------------------------------------------------------------------------
// FeedPaginatorNotifier
// ---------------------------------------------------------------------------

class FeedPaginatorNotifier extends StateNotifier<FeedState> {
  final FirebaseFirestore _firestore;
  static const _pageSize = 10;

  FeedPaginatorNotifier(this._firestore) : super(const FeedState()) {
    loadNextPage();
  }

  Future<void> loadNextPage() async {
    if (state.isLoading || !state.hasMore) return;

    state = state.copyWith(isLoading: true, clearError: true);

    try {
      Query query = _firestore
          .collection('media')
          .orderBy('createdAt', descending: true)
          .limit(_pageSize);

      // Apply filter where clauses.
      query = _applyFilter(query, state.filter);

      // Cursor-based pagination.
      if (state.lastDocument != null) {
        query = query.startAfterDocument(state.lastDocument!);
      }

      final snapshot = await query.get();
      final newItems =
          snapshot.docs.map((doc) => MediaItem.fromFirestore(doc)).toList();

      state = state.copyWith(
        items: [...state.items, ...newItems],
        isLoading: false,
        hasMore: newItems.length >= _pageSize,
        lastDocument:
            snapshot.docs.isNotEmpty ? snapshot.docs.last : state.lastDocument,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e);
    }
  }

  Future<void> refresh() async {
    state = const FeedState().copyWith(filter: state.filter);
    await loadNextPage();
  }

  void setFilter(MediaGalleryFilter filter) {
    if (filter == state.filter) return;
    state = const FeedState().copyWith(filter: filter);
    loadNextPage();
  }

  void removeItem(String mediaId) {
    state = state.copyWith(
      items: state.items.where((item) => item.id != mediaId).toList(),
    );
  }

  void updateItem(MediaItem updated) {
    state = state.copyWith(
      items: state.items
          .map((item) => item.id == updated.id ? updated : item)
          .toList(),
    );
  }

  /// Applies Firestore `where` clauses based on the active filter.
  Query _applyFilter(Query query, MediaGalleryFilter filter) {
    switch (filter) {
      case MediaGalleryFilter.all:
        return query;
      case MediaGalleryFilter.images:
        return query.where('type', isEqualTo: 'image');
      case MediaGalleryFilter.videos:
        return query.where('type', whereIn: ['video', 'reel']);
      case MediaGalleryFilter.events:
        // Firestore doesn't support "field is non-empty string" natively.
        // Use isGreaterThan empty string to match docs with a non-empty eventId.
        return query.where('eventId', isGreaterThan: '');
    }
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

final feedPaginatorProvider =
    StateNotifierProvider<FeedPaginatorNotifier, FeedState>((ref) {
  return FeedPaginatorNotifier(ref.watch(firestoreProvider));
});
