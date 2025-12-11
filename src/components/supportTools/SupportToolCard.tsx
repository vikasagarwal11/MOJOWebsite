import React, { useEffect, useState } from 'react';
import { Heart, MessageCircle, Trash2, Clock, Users, Tag } from 'lucide-react';
import { safeFormat } from '../../utils/dateUtils';
import { SupportTool } from '../../types/supportTools';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../config/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import CommentSection from '../common/CommentSection';
import { isUserApproved } from '../../utils/userUtils';
import { Link } from 'react-router-dom';

interface SupportToolCardProps {
  tool: SupportTool;
  onToolDeleted?: () => void;
}

const SupportToolCard: React.FC<SupportToolCardProps> = ({ tool, onToolDeleted }) => {
  const { currentUser } = useAuth();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const isAdmin = currentUser?.role === 'admin';
  const isAuthor = currentUser?.id === tool.authorId;

  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(tool.likesCount ?? 0);
  const [commentsCount, setCommentsCount] = useState<number>(tool.commentsCount ?? 0);

  // Keep like state in sync
  useEffect(() => {
    if (!currentUser) { setIsLiked(false); return; }
    const likeRef = doc(db, 'supportTools', tool.id, 'likes', currentUser.id);
    const unsub = onSnapshot(likeRef, (snap) => setIsLiked(snap.exists()));
    return () => unsub();
  }, [tool.id, currentUser?.id]);

  // Global likes count listener
  useEffect(() => {
    const q = query(collection(db, 'supportTools', tool.id, 'likes'));
    const unsub = onSnapshot(q, (snap) => {
      setLikesCount(snap.docs.length);
    });
    return () => unsub();
  }, [tool.id]);

  // Comment count listener
  useEffect(() => {
    const q = query(
      collection(db, 'supportTools', tool.id, 'comments'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setCommentsCount(snap.docs.length);
    });
    return () => unsub();
  }, [tool.id]);

  const handleLike = async () => {
    if (!currentUser) return;
    if (!isUserApproved(currentUser)) {
      toast.error('Your account is pending approval. You can browse but cannot like yet.');
      return;
    }
    try {
      const likeRef = doc(db, 'supportTools', tool.id, 'likes', currentUser.id);
      if (isLiked) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(likeRef, { userId: currentUser.id, createdAt: serverTimestamp() });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update like.');
    }
  };

  const handleDelete = async () => {
    if (!isAuthor && !isAdmin) return;
    try {
      // Soft delete
      const toolRef = doc(db, 'supportTools', tool.id);
      await setDoc(toolRef, {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: currentUser?.id,
      }, { merge: true });
      toast.success('Tool deleted successfully');
      onToolDeleted?.();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete tool.');
    }
  };

  const createdAt = tool.createdAt?.toDate?.() || new Date(tool.createdAt);

  return (
    <article className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Link
                to={`/support-tools/${tool.categorySlug}`}
                className="text-sm font-semibold text-[#F25129] hover:underline"
              >
                {tool.categoryName}
              </Link>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{tool.title}</h2>
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{tool.authorName}</span>
              </div>
              <span>{safeFormat(createdAt, 'MMM d, yyyy')}</span>
            </div>
          </div>
          {(isAuthor || isAdmin) && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="text-gray-400 hover:text-red-500 transition-colors"
              aria-label="Delete tool"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Metadata */}
        {(tool.prepTime || tool.servings || tool.difficulty || tool.targetAudience) && (
          <div className="flex flex-wrap gap-3 mb-4 text-sm">
            {tool.prepTime && (
              <div className="flex items-center gap-1 text-gray-600">
                <Clock className="w-4 h-4" />
                <span>{tool.prepTime}</span>
              </div>
            )}
            {tool.servings && (
              <div className="flex items-center gap-1 text-gray-600">
                <Users className="w-4 h-4" />
                <span>{tool.servings} servings</span>
              </div>
            )}
            {tool.difficulty && (
              <span className="px-2 py-1 bg-gray-100 rounded text-gray-700 capitalize">
                {tool.difficulty}
              </span>
            )}
            {tool.targetAudience && (
              <span className="px-2 py-1 bg-blue-100 rounded text-blue-700">
                {tool.targetAudience}
              </span>
            )}
          </div>
        )}

        {/* Tags */}
        {tool.tags && tool.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {tool.tags.map((tag, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs text-gray-600"
              >
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Image */}
        {tool.imageUrl && (
          <div className="mb-4 rounded-lg overflow-hidden">
            <img
              src={tool.imageUrl}
              alt={tool.title}
              className="w-full h-auto object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="prose prose-sm max-w-none mb-4">
          <p className="text-gray-700 whitespace-pre-wrap">{tool.content}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-6 pt-4 border-t border-gray-200">
          <button
            onClick={handleLike}
            disabled={!currentUser || !isUserApproved(currentUser)}
            className={`flex items-center gap-2 transition-colors ${
              isLiked
                ? 'text-red-500'
                : 'text-gray-400 hover:text-red-500'
            } ${!currentUser || !isUserApproved(currentUser) ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
            <span>{likesCount}</span>
          </button>
          <div className="flex items-center gap-2 text-gray-400">
            <MessageCircle className="w-5 h-5" />
            <span>{commentsCount}</span>
          </div>
        </div>
      </div>

      {/* Comments Section */}
      <CommentSection
        collectionPath={`supportTools/${tool.id}/comments`}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">Delete Support Tool?</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete "{tool.title}"? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  handleDelete();
                }}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
};

export default SupportToolCard;

