import React from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { useAdminThreadDeletion } from '../../services/adminThreadDeletionService';
import { ThreadedComment } from '../../hooks/useThreadedComments';
import { useAuth } from '../../contexts/AuthContext';

interface AdminThreadDeletionModalProps {
  comment: ThreadedComment;
  collectionPath: string;
  isOpen: boolean;
  onClose: () => void;
  onThreadDeleted: () => void;
}

const AdminThreadDeletionModal: React.FC<AdminThreadDeletionModalProps> = ({
  comment,
  collectionPath,
  isOpen,
  onClose,
  onThreadDeleted
}) => {
  const { currentUser } = useAuth();
  const { deleteCommentThread, isDeleting } = useAdminThreadDeletion();
  const isAdmin = currentUser?.role === 'admin';
  const replyCount = comment.replyCount ?? 0;

  const handleDelete = async () => {
    if (!currentUser) return;

    try {
      const result = await deleteCommentThread(comment.id, collectionPath, currentUser.id);
      
      if (result.success) {
        onThreadDeleted();
        onClose();
      }
    } catch (error) {
      console.error('Error deleting thread:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-thread-title"
        aria-describedby="delete-thread-description"
      >
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <Trash2 className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900" id="delete-thread-title">
                {isAdmin ? 'Delete this thread?' : 'Delete this comment?'}
              </h2>
            </div>
          </div>
          <p className="text-sm text-gray-600 ml-[60px]" id="delete-thread-description">
            This will permanently delete the comment{replyCount > 0 ? ' and its replies' : ''}.
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
              isAdmin ? 'Delete thread' : 'Delete comment'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminThreadDeletionModal;

