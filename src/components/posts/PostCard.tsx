// src/components/posts/PostCard.tsx
import React, { useEffect, useState } from 'react';
import { Heart, MessageCircle, User } from 'lucide-react';
import { format } from 'date-fns';
import { Post } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
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
import toast from 'react-hot-toast';

interface PostCardProps {
  post: Post;
}

const PostCard: React.FC<PostCardProps> = ({ post }) => {
  const { currentUser } = useAuth();

  // counts fall back to arrays if you still have them on the doc
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(
    (post as any).likesCount ?? (post as any).likes?.length ?? 0
  );
  const [commentsCount, setCommentsCount] = useState<number>(
    (post as any).commentsCount ?? (post as any).comments?.length ?? 0
  );

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<
    Array<{ id: string; authorId: string; authorName: string; text: string; createdAt?: any }>
  >([]);
  const [newComment, setNewComment] = useState('');

  // Keep my like state in sync
  useEffect(() => {
    if (!currentUser) { setIsLiked(false); return; }
    const likeRef = doc(db, 'posts', post.id, 'likes', currentUser.id);
    const unsub = onSnapshot(likeRef, (snap) => setIsLiked(snap.exists()));
    return () => unsub();
  }, [post.id, currentUser?.id]);

  // Load latest comments when panel opens
  useEffect(() => {
    if (!showComments) return;
    const q = query(
      collection(db, 'posts', post.id, 'comments'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => unsub();
  }, [showComments, post.id]);

  const handleLike = async () => {
    if (!currentUser) return;
    try {
      const likeRef = doc(db, 'posts', post.id, 'likes', currentUser.id);
      if (isLiked) {
        setIsLiked(false); setLikesCount((c) => Math.max(0, c - 1));
        await deleteDoc(likeRef);
      } else {
        setIsLiked(true); setLikesCount((c) => c + 1);
        await setDoc(likeRef, { userId: currentUser.id, createdAt: serverTimestamp() });
      }
    } catch (e: any) {
      setIsLiked((v) => !v);
      setLikesCount((c) => (isLiked ? c + 1 : Math.max(0, c - 1)));
      toast.error(e?.message || 'Failed to update like.');
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
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
      setCommentsCount((c) => c + 1); // optimistic; CF updates the doc too
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add comment.');
    }
  };

  const createdAt =
    (post as any).createdAt?.toDate?.()
      ? (post as any).createdAt.toDate()
      : (post as any).createdAt instanceof Date
      ? (post as any).createdAt
      : undefined;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-purple-100 overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
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
              {createdAt ? format(createdAt, 'MMMM d, yyyy • h:mm a') : null}
            </div>
          </div>
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
            className="w-full rounded-xl object-cover max-h-96"
          />
        </div>
      )}

      {/* Actions */}
      <div className="px-6 py-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-6">
            <button
              onClick={handleLike}
              className={`flex items-center space-x-2 transition-colors ${
                isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
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

        {/* Comments */}
        {showComments && (
          <div className="space-y-3">
            {comments.map((c) => {
              const created =
                (c as any)?.createdAt?.toDate?.()
                  ? (c as any).createdAt.toDate()
                  : (c as any).createdAt instanceof Date
                  ? (c as any).createdAt
                  : undefined;
              const mine = c.authorId && currentUser?.id === c.authorId;

              return (
                <div
                  key={c.id}
                  className="relative rounded-xl bg-purple-50/70 border border-purple-100 px-4 py-2 pl-10"
                >
                  {/* tiny bullet to keep the sub-bullet look */}
                  <span className="absolute left-3 top-3 inline-block w-2 h-2 rounded-full bg-amber-300" />

                  <div className="flex flex-col">
                    {/* line 1: name + comment (bold italic) */}
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="font-semibold text-gray-900">{c.authorName}</span>
                      {mine && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-200 text-purple-800">
                          You
                        </span>
                      )}
                      <span className="italic font-semibold text-gray-800 break-words">
                        {(c as any).text || (c as any).content}
                      </span>
                    </div>

                    {/* line 2: tiny timestamp under the name */}
                    {created && (
                      <div className="mt-0.5 pl-0.5 text-[11px] text-gray-400">
                        {format(created, 'MMM d, yyyy • h:mm a')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add comment */}
            {currentUser && (
              <form onSubmit={handleComment} className="flex space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newComment.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
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
