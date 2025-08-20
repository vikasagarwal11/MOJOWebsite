// src/components/media/MediaCard.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, Tag, Play } from 'lucide-react';
import { format } from 'date-fns';
import { MediaFile } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { analytics } from '../../config/firebase';
import { logEvent } from 'firebase/analytics';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import toast from 'react-hot-toast';
import { trace, getPerformance } from 'firebase/performance';

// ---- Analytics helper -------------------------------------------------------
function log(name: string, params?: Record<string, any>) {
  try { if (analytics) logEvent(analytics, name, params); } catch {}
}

// ---- Perf: mark "first media tile painted" ----------------------------------
export function markMediaFirstPaint() {
  try {
    // lazily get Performance (your firebase.ts exports analytics; perf via getPerformance)
    const perf = getPerformance();
    const t = trace(perf, 'media_first_paint');
    t.start();
    // caller should stop when the image/video poster is fully loaded
    return () => { try { t.stop(); } catch {} };
  } catch { return () => {}; }
}

// ---- HLS helper (lazy import) -----------------------------------------------
async function ensureHls(video: HTMLVideoElement, src: string) {
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src;
    return;
  }
  const Hls = (await import('hls.js')).default;
  const hls = new Hls();
  hls.loadSource(src);
  hls.attachMedia(video);
}

// -----------------------------------------------------------------------------
interface MediaCardProps {
  media: MediaFile; // must include id, type, url, thumbnailUrl?, eventTitle?, uploaderName, createdAt, likesCount?, commentsCount?
}

const MediaCard: React.FC<MediaCardProps> = ({ media }) => {
  const { currentUser } = useAuth();
  const canEngage = !!currentUser && (currentUser.role === 'member' || currentUser.role === 'admin');

  // optimistic counts; will be refreshed by list re-render when doc updates
  const [likesCount, setLikesCount] = useState<number>(media.likesCount ?? 0);
  const [commentsCount, setCommentsCount] = useState<number>(media.commentsCount ?? 0);
  const [liked, setLiked] = useState<boolean>(false);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');

  // video controls
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const firstPaintStopRef = useRef<() => void>(() => {});

  // subscribe to my like doc to reflect like state
  useEffect(() => {
    if (!currentUser) { setLiked(false); return; }
    const likeRef = doc(db, 'media', media.id, 'likes', currentUser.id);
    const unsub = onSnapshot(likeRef, (snap) => setLiked(snap.exists()));
    return () => unsub();
  }, [media.id, currentUser?.id]);

  // perf mark: stop when the media preview has loaded
  useEffect(() => {
    firstPaintStopRef.current = markMediaFirstPaint();
    return () => firstPaintStopRef.current?.();
  }, []);

  // Auto-pause videos when off-screen
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (e.intersectionRatio < 0.2 && !v.paused) v.pause();
      },
      { threshold: [0, 0.2, 1] }
    );
    obs.observe(v);
    return () => obs.disconnect();
  }, [videoRef.current]);

  // If this media has an HLS source, lazy-load it only when we render the card
  useEffect(() => {
    const v = videoRef.current;
    if (!v || media.type !== 'video') return;
    const hlsUrl = (media as any).sources?.hls; // optional field
    if (!hlsUrl) return; // fall back to mp4 in render
    ensureHls(v, hlsUrl).catch(() => {/* ignore */});
  }, [media.id, media.type]);

  const handleLikeToggle = async () => {
    if (!canEngage || !currentUser) {
      toast.error('Only members can like media.');
      return;
    }
    try {
      const likeRef = doc(db, 'media', media.id, 'likes', currentUser.id);
      if (liked) {
        setLiked(false); setLikesCount((c) => Math.max(0, c - 1));
        await deleteDoc(likeRef);
        log('media_unlike', { media_id: media.id });
      } else {
        setLiked(true); setLikesCount((c) => c + 1);
        await addDoc(collection(db, 'media', media.id, 'likes'), {
          // we store as auto-id docs; a second write ensures uniqueness by uid:
          // alternatively: setDoc(doc(..., currentUser.id), {...})
        });
        // Prefer a deterministic doc id to prevent dups:
        // await setDoc(likeRef, { userId: currentUser.id, createdAt: serverTimestamp() });
        await (async () => {
          // deterministic doc version
          await import('firebase/firestore').then(async ({ setDoc }) => {
            await setDoc(likeRef, { userId: currentUser.id, createdAt: serverTimestamp() });
          });
        })();
        log('media_like', { media_id: media.id });
      }
    } catch (e: any) {
      // roll back optimistic change
      setLiked((v) => !v);
      setLikesCount((c) => (liked ? c + 1 : Math.max(0, c - 1)));
      toast.error(e?.message || 'Failed to update like.');
    }
  };

  // Load latest 10 comments only when panel open
  const [comments, setComments] = useState<Array<{ id: string; authorName: string; text: string }>>([]);
  useEffect(() => {
    if (!showComments) return;
    const q = query(
      collection(db, 'media', media.id, 'comments'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [showComments, media.id]);

  const handleAddComment = async () => {
    if (!canEngage || !currentUser) {
      toast.error('Only members can comment.');
      return;
    }
    const text = newComment.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, 'media', media.id, 'comments'), {
        authorId: currentUser.id,
        authorName: currentUser.displayName || 'Member',
        text,
        createdAt: serverTimestamp(),
      });
      setNewComment('');
      setCommentsCount((c) => c + 1); // optimistic
      log('media_comment', { media_id: media.id });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add comment.');
    }
  };

  // Simple media preview (image or video poster)
  const mediaPreview = useMemo(() => {
    if (media.type === 'video') {
      const poster = media.thumbnailUrl || media.url;
      return (
        <div className="relative">
          <video
            ref={videoRef}
            poster={poster}
            playsInline
            controls
            preload="metadata"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onLoadedData={() => firstPaintStopRef.current?.()}
          >
            {/* fallback mp4/webm if no HLS */}
            <source src={media.url} />
          </video>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 bg-white/80 rounded-full flex items-center justify-center">
              <Play className="w-6 h-6 text-purple-600 ml-0.5" />
            </div>
          </div>
        </div>
      );
    }
    return (
      <img
        src={media.thumbnailUrl || media.url}
        alt={media.title}
        loading="lazy"
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        onLoad={() => firstPaintStopRef.current?.()}
      />
    );
  }, [media.id, media.type, media.url, media.thumbnailUrl, media.title]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-purple-100 group">
      {/* Media Content */}
      <div className="relative aspect-square overflow-hidden">{mediaPreview}
        {/* Event Tag */}
        {media.eventTitle && (
          <div className="absolute top-3 left-3">
            <div className="flex items-center px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-sm font-medium text-purple-600 border border-purple-200">
              <Tag className="w-3 h-3 mr-1" />
              {media.eventTitle}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{media.title}</h3>

        {media.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">{media.description}</p>
        )}

        {/* Meta Info */}
        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
          <span>By {media.uploaderName}</span>
          <span>{format(media.createdAt, 'MMM d, yyyy')}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLikeToggle}
              disabled={!canEngage}
              className={`flex items-center space-x-1 transition-colors ${
                liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              } ${!canEngage ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={canEngage ? '' : 'Members only'}
            >
              <Heart className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
              <span className="text-sm">{likesCount}</span>
            </button>

            <button
              onClick={() => setShowComments((v) => !v)}
              className="flex items-center space-x-1 text-gray-500 hover:text-purple-600 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm">{commentsCount}</span>
            </button>
          </div>
        </div>

        {/* Comments Section */}
        {showComments && (
          <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="text-sm">
                <span className="font-medium text-gray-900">{c.authorName}</span>
                <span className="text-gray-600 ml-2">{c.text}</span>
              </div>
            ))}
            {canEngage ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment…"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                />
                <button
                  onClick={handleAddComment}
                  className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Post
                </button>
              </div>
            ) : (
              <div className="text-xs text-gray-500">Sign in as a member to comment.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaCard;
