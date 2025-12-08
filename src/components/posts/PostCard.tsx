// src/components/posts/PostCard.tsx
import React, { useEffect, useState } from 'react';
import { Heart, MessageCircle, User, Trash2 } from 'lucide-react';
import { safeFormat } from '../../utils/dateUtils';
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
import CommentSection from '../common/CommentSection';
import AdminPostDeletionModal from './AdminPostDeletionModal';
import { createPortal } from 'react-dom';
import { isUserApproved } from '../../utils/userUtils';
import { Lock } from 'lucide-react';

interface PostCardProps {
  post: Post;
  onPostDeleted?: () => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, onPostDeleted }) => {
  const { currentUser } = useAuth();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Check if current user is admin
  const isAdmin = currentUser?.role === 'admin';

  // counts fall back to arrays if you still have them on the doc
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(
    (post as any).likesCount ?? (post as any).likes?.length ?? 0
  );
  const [commentsCount, setCommentsCount] = useState<number>(
    (post as any).commentsCount ?? (post as any).comments?.length ?? 0
  );

  // Comment functionality now handled by CommentSection component

  // Keep my like state in sync
  useEffect(() => {
    if (!currentUser) { setIsLiked(false); return; }
    const likeRef = doc(db, 'posts', post.id, 'likes', currentUser.id);
    const unsub = onSnapshot(likeRef, (snap) => setIsLiked(snap.exists()));
    return () => unsub();
  }, [post.id, currentUser?.id]);

  // Global likes count listener - always active for real-time updates
  useEffect(() => {
    const q = query(collection(db, 'posts', post.id, 'likes'));
    const unsub = onSnapshot(q, (snap) => {
      // Update likes count in real-time
      setLikesCount(snap.docs.length);
    });
    return () => unsub();
  }, [post.id]);

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

  const handleLike = async () => {
    if (!currentUser) return;
    if (!isUserApproved(currentUser)) {
      toast.error('Your account is pending approval. You can browse posts but cannot like yet.');
      return;
    }
    try {
      const likeRef = doc(db, 'posts', post.id, 'likes', currentUser.id);
      if (isLiked) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, { userId: currentUser.id, createdAt: serverTimestamp() });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update like.');
    }
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
            <button
              onClick={handleLike}
              disabled={!currentUser || !isUserApproved(currentUser)}
              title={currentUser && !isUserApproved(currentUser) ? 'Account pending approval - cannot like yet' : undefined}
              className={`flex items-center space-x-2 transition-colors ${
                !currentUser || !isUserApproved(currentUser)
                  ? 'text-gray-300 cursor-not-allowed opacity-50'
                  : isLiked
                  ? 'text-red-500'
                  : 'text-gray-500 hover:text-red-500'
              }`}
            >
              {currentUser && !isUserApproved(currentUser) ? (
                <Lock className="w-5 h-5" />
              ) : (
                <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              )}
              <span className="text-sm font-medium">{likesCount}</span>
            </button>

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
