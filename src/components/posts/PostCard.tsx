// src/components/posts/PostCard.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, MessageCircle, User } from 'lucide-react';
import { format } from 'date-fns';
import { Post } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { likePost, unlikePost, addPostComment } from '../../utils/postActions';

interface PostCardProps {
  post: Post & { likesCount?: number; commentsCount?: number };
}

const PostCard: React.FC<PostCardProps> = ({ post }) => {
  const { currentUser } = useAuth();
  const canEngage = !!currentUser && (currentUser.role === 'member' || currentUser.role === 'admin');

  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(post.likesCount ?? 0);
  const [commentsCount, setCommentsCount] = useState<number>(post.commentsCount ?? 0);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');

  // live “did I like” state
  useEffect(() => {
    if (!currentUser) { setLiked(false); return; }
    const likeRef = doc(db, 'posts', post.id, 'likes', currentUser.id);
    const unsub = onSnapshot(likeRef, (s) => setLiked(s.exists()));
    return () => unsub();
  }, [post.id, currentUser?.id]);

  const handleLike = async () => {
    if (!canEngage || !currentUser) {
      toast.error('Only members can like posts.');
      return;
    }
    try {
      if (liked) {
        setLiked(false);
        setLikesCount((c) => Math.max(0, c - 1));
        await unlikePost(post.id, currentUser.id);
      } else {
        setLiked(true);
        setLikesCount((c) => c + 1);
        await likePost(post.id, currentUser.id);
      }
    } catch (e: any) {
      setLiked((v) => !v);
      setLikesCount((c) => (liked ? c + 1 : Math.max(0, c - 1)));
      toast.error(e?.message || 'Failed to update like.');
    }
  };

  // live last 10 comments
  const [comments, setComments] = useState<Array<{ id: string; authorName: string; text: string; createdAt?: any }>>([]);
  useEffect(() => {
    if (!showComments) return;
    const q = query(
      collection(db, 'posts', post.id, 'comments'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [showComments, post.id]);

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEngage || !currentUser) {
      toast.error('Only members can comment.');
      return;
    }
    const text = newComment.trim();
    if (!text) return;
    try {
      await addPostComment(post.id, currentUser.id, currentUser.displayName || 'Member', text);
      setNewComment('');
      setCommentsCount((c) => c + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add comment.');
    }
  };

  const createdAt =
    post.createdAt instanceof Date ? post.createdAt : new Date((post as any).createdAt);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-purple-100 overflow-hidden">
      <div className="p-6 pb-4">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full overflow-hidden flex items-center justify-center">
            {post.authorPhoto ? (
              <img src={post.authorPhoto} alt={post.authorName} className="w-full h-full object-cover" />
            ) : <User className="w-6 h-6 text-white" />}
          </div>
          <div>
            <div className="font-semibold text-gray-900">{post.authorName}</div>
            <div className="text-sm text-gray-500">{format(createdAt, 'MMMM d, yyyy • h:mm a')}</div>
          </div>
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-3">{post.title}</h2>
        <p className="text-gray-700 leading-relaxed mb-4">{post.content}</p>
      </div>

      {post.imageUrl && (
        <div className="px-6 pb-4">
          <img src={post.imageUrl} alt={post.title} className="w-full rounded-xl object-cover max-h-96" />
        </div>
      )}

      <div className="px-6 py-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-6">
            <button
              onClick={handleLike}
              disabled={!canEngage}
              className={`flex items-center space-x-2 transition-colors ${
                liked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              } ${!canEngage ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={canEngage ? '' : 'Members only'}
            >
              <Heart className={`w-5 h-5 ${liked ? 'fill-current' : ''}`} />
              <span className="text-sm font-medium">{likesCount}</span>
            </button>

            <button
              onClick={() => setShowComments((v) => !v)}
              className="flex items-center space-x-2 text-gray-500 hover:text-purple-600 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{commentsCount}</span>
            </button>
          </div>
        </div>

        {showComments && (
          <div className="space-y-4">
            {comments.map((c) => (
              <div key={c.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                    <User className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-sm font-medium text-gray-900">{c.authorName}</span>
                  <span className="text-xs text-gray-500">
                    {c.createdAt?.toDate ? format(c.createdAt.toDate(), 'MMM d, h:mm a') : ''}
                  </span>
                </div>
                <p className="text-sm text-gray-700 ml-8">{c.text}</p>
              </div>
            ))}

            {canEngage && (
              <form onSubmit={submitComment} className="flex space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-white" />
                </div>
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
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  Post
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PostCard;
