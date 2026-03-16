// src/components/posts/PostCard.tsx
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { Heart, Lock, MessageCircle, Trash2, User } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Post } from '../../types';
import { safeFormat } from '../../utils/dateUtils';
import { isUserApproved } from '../../utils/userUtils';
import CommentSection from '../common/CommentSection';
import { ReactionPicker } from '../common/ReactionPicker';
import AdminPostDeletionModal from './AdminPostDeletionModal';

interface PostCardProps {
  post: Post;
  onPostDeleted?: () => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, onPostDeleted }) => {
  const { currentUser } = useAuth();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const REACTIONS = useMemo(
    () => [
      { type: 'heart', emoji: '❤️', label: 'Heart' },
      { type: 'like', emoji: '👍', label: 'Like' },
      { type: 'celebrate', emoji: '🎉', label: 'Celebrate' },
      { type: 'appreciate', emoji: '🙌', label: 'Support' },
      { type: 'funny', emoji: '😂', label: 'Funny' },
      { type: 'wow', emoji: '😮', label: 'Wow' },
      { type: 'sad', emoji: '😢', label: 'Sad' },
    ],
    []
  );
  const DEFAULT_REACTION = 'heart';
  const emojiToType = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of REACTIONS) m[r.emoji] = r.type;
    return m;
  }, [REACTIONS]);

  // Check if current user is admin
  const isAdmin = currentUser?.role === 'admin';

  const [commentsCount, setCommentsCount] = useState<number>(
    (post as any).commentsCount ?? (post as any).comments?.length ?? 0
  );

  // Post reactions
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const reactionTriggerRef = useRef<HTMLButtonElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOpenedRef = useRef(false);
  const hoverCloseTimerRef = useRef<number | null>(null);

  const reactionsCountFromPost = ((post as any).reactionsCount ?? {}) as Record<string, number>;
  const totalReactionsFromPost =
    (post as any).totalReactions ??
    Object.values(reactionsCountFromPost).reduce((acc, n) => acc + (typeof n === 'number' ? n : 0), 0);

  // Optimistic UI for counts so the user sees feedback instantly.
  const [liveReactionsCount, setLiveReactionsCount] = useState<Record<string, number>>(reactionsCountFromPost);
  const [liveTotalReactions, setLiveTotalReactions] = useState<number>(totalReactionsFromPost ?? 0);

  // If the post document doesn't have aggregated counters (or they aren't updating),
  // fall back to aggregating from the reactions subcollection in real time.
  const [needsReactionsFallback, setNeedsReactionsFallback] = useState(false);

  useEffect(() => {
    setLiveReactionsCount(reactionsCountFromPost);
    setLiveTotalReactions(totalReactionsFromPost ?? 0);
    // Only depend on the Firestore-provided objects/fields; they should change when backend updates.
  }, [(post as any).reactionsCount, (post as any).totalReactions]);

  // Keep reaction counts in sync for *all viewers*.
  // This avoids relying solely on the posts list snapshot shape/timing.
  useEffect(() => {
    const postRef = doc(db, 'posts', post.id);
    const unsub = onSnapshot(
      postRef,
      (snap) => {
        const data = (snap.data() as any) || {};
        const counts = (data.reactionsCount ?? null) as Record<string, number> | null;
        const total = typeof data.totalReactions === 'number' ? (data.totalReactions as number) : null;

        const hasServerCounts = !!counts && typeof counts === 'object' && Object.keys(counts).length > 0;
        const hasServerTotal = typeof total === 'number' && !Number.isNaN(total);

        if (hasServerCounts || hasServerTotal) {
          const computedTotal =
            total ??
            Object.values(counts ?? {}).reduce((acc, n) => acc + (typeof n === 'number' ? n : 0), 0);
          setLiveReactionsCount(counts ?? {});
          setLiveTotalReactions(computedTotal);
          setNeedsReactionsFallback(false);
        } else {
          setNeedsReactionsFallback(true);
        }
      },
      () => {
        // If we can't read the post doc for any reason, fall back to the subcollection.
        setNeedsReactionsFallback(true);
      }
    );
    return () => unsub();
  }, [post.id]);

  useEffect(() => {
    if (!needsReactionsFallback) return;
    const reactionsRef = collection(db, 'posts', post.id, 'reactions');
    const unsub = onSnapshot(reactionsRef, (snap) => {
      // Dedupe by userId so legacy docs (e.g. uid_emoji) can't create ghost counts.
      // Latest timestamp (updatedAt/createdAt) wins per user.
      const allowed = new Set(REACTIONS.map((r) => r.type));
      const latestByUser = new Map<string, { reaction: string; ts: number }>();

      for (const d of snap.docs) {
        const data = d.data() as any;
        const userId = typeof data?.userId === 'string' ? (data.userId as string) : null;
        const reaction = typeof data?.reaction === 'string' ? (data.reaction as string) : null;
        if (!userId || !reaction || !allowed.has(reaction)) continue;

        const updatedAt = data?.updatedAt?.toMillis?.() ? data.updatedAt.toMillis() : null;
        const createdAt = data?.createdAt?.toMillis?.() ? data.createdAt.toMillis() : null;
        const ts = (updatedAt ?? createdAt ?? 0) as number;

        const prev = latestByUser.get(userId);
        if (!prev || ts >= prev.ts) {
          latestByUser.set(userId, { reaction, ts });
        }
      }

      const counts: Record<string, number> = {};
      for (const v of latestByUser.values()) {
        counts[v.reaction] = (counts[v.reaction] ?? 0) + 1;
      }

      const total = Object.values(counts).reduce((acc, n) => acc + (typeof n === 'number' ? n : 0), 0);
      setLiveReactionsCount(counts);
      setLiveTotalReactions(total);
    });
    return () => unsub();
  }, [post.id, needsReactionsFallback, REACTIONS]);

  const myEmoji = myReaction ? REACTIONS.find((r) => r.type === myReaction)?.emoji : null;

  const reactionUserMap = useMemo(() => {
    const out: Record<string, boolean> = {};
    if (myEmoji) out[myEmoji] = true;
    return out;
  }, [myEmoji]);

  // Comment functionality now handled by CommentSection component

  // Keep my reaction state in sync
  useEffect(() => {
    if (!currentUser) {
      setMyReaction(null);
      return;
    }
    const reactionRef = doc(db, 'posts', post.id, 'reactions', currentUser.id);
    const unsub = onSnapshot(reactionRef, (snap) => {
      const data = snap.data() as any;
      setMyReaction((data?.reaction as string | undefined) ?? null);
    });
    return () => unsub();
  }, [post.id, currentUser?.id]);

  // Comment count listener - always active for real-time updates
  useEffect(() => {
    const q = query(
      collection(db, 'posts', post.id, 'comments'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      // Update comment count in real-time
      setCommentsCount(snap.docs.length);
    });
    return () => unsub();
  }, [post.id]);

  const canReact = !!currentUser && isUserApproved(currentUser);

  const closeReactionPicker = () => setShowReactionPicker(false);

  const clearHoverCloseTimer = () => {
    if (hoverCloseTimerRef.current) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  };

  const scheduleHoverClose = () => {
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setShowReactionPicker(false);
    }, 160);
  };

  // Close reaction picker on outside click
  useEffect(() => {
    if (!showReactionPicker) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const trigger = reactionTriggerRef.current;
      if (trigger && trigger.contains(t)) return;
      if (t.closest('[data-reaction-picker="true"]')) return;
      setShowReactionPicker(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showReactionPicker]);

  const setReactionType = async (type: string) => {
    if (!currentUser) return;
    if (!isUserApproved(currentUser)) {
      toast.error('Your account is pending approval. You cannot react yet.');
      return;
    }

    // Optimistic update
    const prev = myReaction;
    const prevCountsSnapshot = liveReactionsCount;
    const prevTotalSnapshot = liveTotalReactions;
    const next = prev === type ? null : type;
    setMyReaction(next);
    setLiveReactionsCount((prevCounts) => {
      const updated = { ...prevCounts };
      if (prev) updated[prev] = Math.max(0, (updated[prev] ?? 0) - 1);
      if (next) updated[next] = (updated[next] ?? 0) + 1;
      return updated;
    });
    setLiveTotalReactions((prevTotal) => {
      if (prev && !next) return Math.max(0, prevTotal - 1);
      if (!prev && next) return prevTotal + 1;
      return prevTotal;
    });

    try {
      const reactionRef = doc(db, 'posts', post.id, 'reactions', currentUser.id);
      if (prev && prev === type) {
        await deleteDoc(reactionRef);
        return;
      }
      await setDoc(
        reactionRef,
        {
          userId: currentUser.id,
          reaction: type,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e: any) {
      // Revert optimistic UI on failure
      setMyReaction(prev ?? null);
      setLiveReactionsCount(prevCountsSnapshot);
      setLiveTotalReactions(prevTotalSnapshot);
      toast.error(e?.message || 'Failed to update reaction.');
    }
  };

  const handleToggleReact = async () => {
    // Professional UX: click toggles reaction on/off.
    // If already reacted with any type, clicking removes it.
    if (myReaction) {
      await setReactionType(myReaction);
      return;
    }
    await setReactionType(DEFAULT_REACTION);
  };

  // Comment handling now done by CommentSection component

  const createdAt =
    (post as any).createdAt?.toDate?.()
      ? (post as any).createdAt instanceof Date 
        ? (post as any).createdAt 
        : (post as any).createdAt?.toDate?.() || new Date()
      : (post as any).createdAt instanceof Date
      ? (post as any).createdAt
      : undefined;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-[#F25129]/20 overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[#F25129] to-[#FFC107] rounded-full flex items-center justify-center">
              {post.authorPhoto ? (
                <img
                  src={post.authorPhoto}
                  alt={post.authorName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-white" />
              )}
            </div>
            <div>
              <div className="font-semibold text-gray-900">{post.authorName}</div>
              <div className="text-sm text-gray-500">
                {createdAt ? safeFormat(createdAt, 'MMMM d, yyyy • h:mm a', '') : null}
              </div>
            </div>
          </div>

          {/* Admin Delete Button - Direct trash can icon */}
          {isAdmin && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50"
              title="Delete Post (Admin)"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-3">{post.title}</h2>
        <p className="text-gray-700 leading-relaxed mb-4">{post.content}</p>
      </div>

      {/* Post image */}
      {post.imageUrl && (
        <div className="px-6 pb-4">
          <img
            src={post.imageUrl}
            alt={post.title}
            className="w-full rounded-xl object-contain max-h-96"
          />
        </div>
      )}

      {/* Actions */}
      <div className="px-6 py-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-6">
            <div className="relative" data-reaction-container>
              <button
                ref={reactionTriggerRef}
                onClick={(e) => {
                  e.preventDefault();
                  // If long-press opened picker, do not apply default
                  if (longPressOpenedRef.current) {
                    longPressOpenedRef.current = false;
                    return;
                  }
                  handleToggleReact();
                }}
                onMouseEnter={() => {
                  if (!canReact) return;
                  // hover reactions on desktop
                  if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                    clearHoverCloseTimer();
                    setShowReactionPicker(true);
                  }
                }}
                onMouseLeave={() => {
                  if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                    scheduleHoverClose();
                  }
                }}
                onTouchStart={() => {
                  if (!canReact) return;
                  if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
                  longPressOpenedRef.current = false;
                  longPressTimerRef.current = window.setTimeout(() => {
                    longPressOpenedRef.current = true;
                    setShowReactionPicker(true);
                  }, 420);
                }}
                onTouchEnd={() => {
                  if (longPressTimerRef.current) {
                    window.clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onTouchMove={() => {
                  if (longPressTimerRef.current) {
                    window.clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                disabled={!currentUser || !isUserApproved(currentUser)}
                title={currentUser && !isUserApproved(currentUser) ? 'Account pending approval - cannot react yet' : 'React'}
                className={`flex items-center space-x-2 rounded-full px-2 py-1 transition-all duration-200 ${
                  !currentUser || !isUserApproved(currentUser)
                    ? 'text-gray-600 cursor-not-allowed'
                    : myReaction
                    ? 'text-[#F25129] bg-[#F25129]/5'
                    : 'text-gray-600 hover:text-[#F25129] hover:bg-[#F25129]/5'
                }`}
              >
                {currentUser && !isUserApproved(currentUser) ? (
                  <Lock className="w-5 h-5" />
                ) : myEmoji ? (
                  <span className="text-lg leading-none">{myEmoji}</span>
                ) : (
                  <Heart className="w-5 h-5" />
                )}
                <span className="text-sm font-semibold tabular-nums">{liveTotalReactions || 0}</span>
              </button>

              <ReactionPicker
                isOpen={showReactionPicker}
                onClose={closeReactionPicker}
                onReaction={(emoji) => {
                  const type = emojiToType[emoji];
                  if (!type) return;
                  setReactionType(type);
                }}
                userReactions={reactionUserMap}
                triggerRef={reactionTriggerRef}
                disabled={!canReact}
                onPointerEnter={clearHoverCloseTimer}
                onPointerLeave={scheduleHoverClose}
              />

              {/* Optional breakdown (only show when there are reactions) */}
              {liveTotalReactions > 0 && (
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                  {REACTIONS.filter((r) => (liveReactionsCount[r.type] ?? 0) > 0)
                    .map((r) => (
                      <span key={r.type} className="inline-flex items-center gap-1">
                        <span>{r.emoji}</span>
                        <span className="tabular-nums">{liveReactionsCount[r.type] ?? 0}</span>
                      </span>
                    ))}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2 text-gray-500">
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{commentsCount}</span>
            </div>
          </div>

          {/* Delete Button - Only for author (admins use the header button) */}
          {currentUser?.id === post.authorId && !isAdmin && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-full hover:bg-red-50"
              title="Delete Post"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Threaded Comments */}
        <CommentSection 
          collectionPath={`posts/${post.id}/comments`}
          initialOpen={false}
          pageSize={10}
        />
      </div>

      {/* Admin Post Deletion Modal - Portal to avoid z-index issues */}
      {createPortal(
        <AdminPostDeletionModal
          post={post}
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onPostDeleted={() => {
            setShowDeleteModal(false);
            onPostDeleted?.();
          }}
        />,
        document.body
      )}
    </div>
  );
};

export default PostCard;
