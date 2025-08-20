// src/components/posts/PostCard.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, User, Crown } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { Post } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';

interface PostCardProps { post: Post; }

// deterministic color per user
function colorFor(id: string | undefined) {
  if (!id) return 'hsl(220 15% 80%)';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 80% 85%)`; // soft pastel bg
}

const PostCard: React.FC<PostCardProps> = ({ post }) => {
  const { currentUser } = useAuth();
  const canEngage = !!currentUser && (currentUser.role === 'member' || currentUser.role === 'admin');

  // live like state & counts
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(post.likesCount ?? (post.likes?.length ?? 0));

  // comments
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Array<{ id: string; authorId: string; authorName: string; text: string; createdAt?: any }>>([]);
  const [newComment, setNewComment] = useState('');

  // subscribe to my like doc
  useEffect(() => {
    if (!currentUser) { setLiked(false); return; }
    const likeRef = doc(db, 'posts', post.id, 'likes', currentUser.id);
    const unsub = onSnapshot(likeRef, (snap) => setLiked(snap.exists()));
    return () => unsub();
  }, [post.id, currentUser?.id]);

  // live counts (optional; UI will also refresh from parent list)
  useEffect(() => setLikesCount(post.likesCount ?? likesCount), [post.likesCount]);

  // load comments when opened
  useEffect(() => {
    if (!showComments) return;
    const q = query(
      collection(db, 'posts', post.id, 'comments'),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    const unsub = onSnapshot(q, (snap) =>
      setComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );
    return () => unsub();
  }, [showComments, post.id]);

  const handleToggleLike = async () => {
    if (!canEngage || !currentUser) { toast.error('Members only.'); return; }
    const likeRef = doc(db, 'posts', post.id, 'likes', currentUser.id);
    try {
      if (liked) {
        setLiked(false); setLikesCount((c) => Math.max(0, c - 1));
        await deleteDoc(likeRef);
      } else {
        setLiked(true); setLikesCount((c) => c + 1);
        await setDoc(likeRef, { userId: currentUser.id, createdAt: serverTimestamp() });
      }
    } catch (e: any) {
      // rollback
      setLiked((v) => !v);
      setLikesCount((c) => (liked ? c + 1 : Math.max(0, c - 1)));
      toast.error(e?.message || 'Failed to update like.');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEngage || !currentUser) { toast.error('Members only.'); return; }
    const text = newComment.trim();
    if (!text) return;
    try {
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        authorId: currentUser.id,
        authorName: currentUser.displayName || 'Member',
        text,
        createdAt: serverTimestamp(),
      });
      setNewComment('');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to comment.');
    }
  };

  const createdAtLabel = useMemo(() => {
    const d = post.createdAt instanceof Date ? post.createdAt : (post.createdAt?.toDate?.() ?? null);
    if (!d) return '';
    return `${format(d, 'MMM d, yyyy • h:mm a')} • ${formatDistanceToNowStrict(d)} ago`;
  }, [post.createdAt]);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-purple-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center ring-2 ring-white shadow"
            style={{ background: colorFor(post.authorId) }}
            title={post.authorName}
          >
            {post.authorPhoto ? (
              <img src={post.authorPhoto} alt={post.authorName} className="w-full h-full rounded-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-gray-700" />
            )}
          </div>
          <div>
            <div className="font-semibold text-gray-900 flex items-center gap-2">
              {post.authorName}
              {post.authorId === currentUser?.id && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">You</span>
              )}
            </div>
            {/* Subtle timeline-like date pill */}
            <div className="mt-1 inline-flex items-center text-xs font-medium text-purple-800 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200/60 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-2" />
              {createdAtLabel}
            </div>
          </div>
        </div>

        {/* Title & Content */}
        <h2 className="text-xl font-bold text-gray-900 mb-3">{post.title}</h2>
        <p className="text-gray-700 leading-relaxed mb-4">{post.content}</p>
      </div>

      {/* Image */}
      {post.imageUrl && (
        <div className="px-6 pb-4">
          <img src={post.imageUrl} alt={post.title} className="w-full rounded-xl object-cover max-h-96" />
        </div>
      )}

      {/* Actions */}
      <div className="px-6 py-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-6">
            <button
              onClick={handleToggleLike}
              disabled={!canEngage}
              className={`flex items-center space-x-2 transition-colors ${liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'} ${!canEngage ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Heart className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
              <span className="text-sm font-medium">{likesCount}</span>
            </button>

            <button
              onClick={() => setShowComments((v) => !v)}
              className="flex items-center space-x-2 text-gray-500 hover:text-purple-600 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{post.commentsCount ?? 0}</span>
            </button>
          </div>
        </div>

        {/* Comments */}
        {showComments && (
          <div className="space-y-4">
            {comments.map((c) => {
  const isMe = c.authorId === currentUser?.id;
  const isAuthor = c.authorId === post.authorId;
  return (
    <div
      key={c.id}
      className={`relative pl-9 pr-2 py-2 border-l ${
        isMe ? 'border-purple-300' : 'border-gray-200'
      }`}
    >
      {/* tiny avatar dot */}
      <span
        className="absolute left-0 top-2 w-6 h-6 rounded-full ring-1 ring-white"
        style={{ background: colorFor(c.authorId) }}
        title={c.authorName}
      />
      <div className="text-[13px] leading-5">
        <span className="font-medium text-gray-900">{c.authorName}</span>
        {isAuthor && (
          <span className="inline-flex items-center gap-1 text-[10px] ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
            Author
          </span>
        )}
        {isMe && !isAuthor && (
          <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
            You
          </span>
        )}
        <span className="ml-2 text-gray-700 break-words">{c.text}</span>
      </div>
    </div>
  );
})}


            {canEngage ? (
              <form onSubmit={handleAddComment} className="flex gap-3">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment…"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                />
                <button
                  type="submit"
                  disabled={!newComment.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Post
                </button>
              </form>
            ) : (
              <div className="text-xs text-gray-500">Sign in as a member to comment.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PostCard;
