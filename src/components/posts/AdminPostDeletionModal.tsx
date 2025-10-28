import React from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { useAdminPostDeletion } from '../../services/adminPostDeletionService';
import { Post } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

interface AdminPostDeletionModalProps {
  post: Post;
  isOpen: boolean;
  onClose: () => void;
  onPostDeleted: () => void;
}

const AdminPostDeletionModal: React.FC<AdminPostDeletionModalProps> = ({
  post,
  isOpen,
  onClose,
  onPostDeleted
}) => {
  const { currentUser } = useAuth();
  const { deletePost, isDeleting } = useAdminPostDeletion();

  const handleDelete = async () => {
    if (!currentUser) return;

    try {
      const result = await deletePost(post.id, currentUser.id);
      
      if (result.success) {
        onPostDeleted();
        onClose();
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-post-title"
        aria-describedby="delete-post-description"
      >
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <Trash2 className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900" id="delete-post-title">
                Delete this post?
              </h2>
            </div>
          </div>
          <p className="text-sm text-gray-600 ml-[60px]" id="delete-post-description">
            This will permanently delete the post and all its comments.
          </p>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-rose-500 disabled:cursor-not-allowed disabled:bg-rose-400"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete post'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminPostDeletionModal;




