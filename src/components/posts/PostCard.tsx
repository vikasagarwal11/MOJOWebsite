// src/components/posts/PostCard.tsx
import React, { useEffect, useState, useRef } from 'react';
import { Heart, MessageCircle, User, Trash2, MoreVertical } from 'lucide-react';
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
import CommentSection from '../common/CommentSection';
import AdminPostDeletionModal from './AdminPostDeletionModal';

interface PostCardProps {
  post: Post;
  onPostDeleted?: () => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, onPostDeleted }) => {
  const { currentUser } = useAuth();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  // Check if current user is admin
  const isAdmin = currentUser?.role === 'admin';

  // Close admin menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(event.target as Node)) {
        setShowAdminMenu(false);
      }
    };

    if (showAdminMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAdminMenu]);

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
      ? (post as any).createdAt.toDate()
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
                {createdAt ? format(createdAt, 'MMMM d, yyyy • h:mm a') : null}
              </div>
            </div>
          </div>

          {/* Admin Menu */}
          {isAdmin && (
            <div className="relative" ref={adminMenuRef}>
              <button
                onClick={() => setShowAdminMenu(!showAdminMenu)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <MoreVertical className="w-5 h-5 text-gray-500" />
              </button>

              {showAdminMenu && (
                <div className="absolute right-0 top-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[160px]">
                  <button
                    onClick={() => {
                      setShowAdminMenu(false);
                      setShowDeleteModal(true);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Post</span>
                  </button>
                </div>
              )}
            </div>
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
              className={`flex items-center space-x-2 transition-colors ${
                isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span className="text-sm font-medium">{likesCount}</span>
            </button>

            <div className="flex items-center space-x-2 text-gray-500">
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm font-medium">{commentsCount}</span>
            </div>
          </div>
        </div>

        {/* Threaded Comments */}
        <CommentSection 
          collectionPath={`posts/${post.id}/comments`}
          initialOpen={false}
          pageSize={10}
        />
      </div>

      {/* Admin Post Deletion Modal */}
      <AdminPostDeletionModal
        post={post}
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onPostDeleted={() => {
          setShowDeleteModal(false);
          onPostDeleted?.();
        }}
      />
    </div>
  );
};

export default PostCard;
