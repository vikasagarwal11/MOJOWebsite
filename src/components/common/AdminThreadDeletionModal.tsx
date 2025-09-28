import React, { useState } from 'react';
import { Trash2, AlertTriangle, X, MessageCircle } from 'lucide-react';
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
  const [confirmText, setConfirmText] = useState('');

  const expectedConfirmText = 'DELETE THREAD';

  const handleDelete = async () => {
    if (!currentUser) return;
    if (confirmText !== expectedConfirmText) {
      return;
    }

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

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-100 rounded-full">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Delete Thread
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            disabled={isDeleting}
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Warning */}
          <div className="flex items-start space-x-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-800">
              <p className="font-medium mb-1">This action cannot be undone!</p>
              <p>Deleting this thread will permanently remove:</p>
              <ul className="mt-2 list-disc list-inside space-y-1">
                <li>This comment and all its replies</li>
                <li>All reactions and likes in the thread</li>
                <li>Associated media files</li>
                <li>Nested conversation threads</li>
              </ul>
            </div>
          </div>

          {/* Comment Preview */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900">{comment.authorName || 'Anonymous'}</p>
                <p className="text-xs text-gray-500">
                  {comment.createdAt ? new Date(comment.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown date'}
                </p>
              </div>
              <div className="ml-auto">
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                  Level {comment.threadLevel}
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-3">{comment.text}</p>
            
            {/* Show reply count if this is a parent comment */}
            {comment.replyCount > 0 && (
              <div className="flex items-center space-x-2 text-xs text-gray-500">
                <MessageCircle className="w-3 h-3" />
                <span>{comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}</span>
              </div>
            )}

            {/* Show media files if any */}
            {comment.mediaUrls && comment.mediaUrls.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center space-x-2 text-xs text-gray-500 mb-2">
                  <span>{comment.mediaUrls.length} {comment.mediaUrls.length === 1 ? 'media file' : 'media files'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {comment.mediaUrls.slice(0, 4).map((url, index) => (
                    <img 
                      key={index}
                      src={url} 
                      alt={`Media ${index + 1}`} 
                      className="w-full h-16 object-cover rounded"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Confirmation Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              To confirm deletion, type <span className="font-mono bg-gray-100 px-2 py-1 rounded text-red-600">DELETE THREAD</span> below:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE THREAD to confirm"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              disabled={isDeleting}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 p-6 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={confirmText !== expectedConfirmText || isDeleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDeleting ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Deleting...</span>
              </div>
            ) : (
              'Delete Thread'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminThreadDeletionModal;
