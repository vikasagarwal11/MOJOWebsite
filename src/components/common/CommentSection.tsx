import React, { useState, useEffect, useRef } from 'react';
import { Heart, MessageCircle, Reply, ChevronDown, ChevronRight, Image, X, Smile, MoreVertical, Trash2 } from 'lucide-react';
import { safeFormat } from '../../utils/dateUtils';
import { collection, addDoc, serverTimestamp, doc, setDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useThreadedComments, ThreadedComment } from '../../hooks/useThreadedComments';
import { useReactions } from '../../hooks/useReactions';
import { ReactionPicker } from './ReactionPicker';
import { CommentMediaLightbox } from './CommentMediaLightbox';
import AdminThreadDeletionModal from './AdminThreadDeletionModal';
import toast from 'react-hot-toast';

function usePopoverPosition(anchorRef: React.RefObject<HTMLElement>, open: boolean) {
  const [pos, setPos] = React.useState<{top:number; left:number}>({ top: 0, left: 0 });
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const gap = 8;
    // place above by default; fallback below if tight
    const top = Math.max(8, rect.top - 56 - gap);
    const center = rect.left + rect.width / 2;
    const left = Math.min(window.innerWidth - 8, Math.max(8, center));
    setPos({ top, left });
  }, [open, anchorRef]);
  return pos;
}

interface CommentSectionProps {
  collectionPath: string; // e.g., 'posts/{id}/comments' or 'media/{id}/comments'
  initialOpen?: boolean;
  pageSize?: number;
}

interface CommentItemProps {
  comment: ThreadedComment & { replies?: ThreadedComment[] };
  collectionPath: string;
  threadLevel: number;
  onReply: (commentId: string) => void;
  onToggleExpanded: (commentId: string) => void;
  isExpanded: boolean;
  replyingTo?: string | null;
  replyText?: string;
  setReplyText?: (text: string) => void;
  handleSubmitReply?: (e: React.FormEvent) => void;
  setReplyingTo?: (commentId: string | null) => void;
  replyFiles?: File[];
  setReplyFiles?: (files: File[]) => void;
  uploading?: boolean;
  openLightbox?: (mediaUrls: string[], startIndex: number) => void;
}

const CommentItem: React.FC<CommentItemProps> = ({ 
  comment, 
  collectionPath, 
  threadLevel, 
  onReply, 
  onToggleExpanded,
  isExpanded,
  replyingTo,
  replyText,
  setReplyText,
  handleSubmitReply,
  setReplyingTo,
  replyFiles,
  setReplyFiles,
  uploading,
  openLightbox
}) => {
  const { currentUser } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  // Check if current user is admin
  const isAdmin = currentUser?.role === 'admin';
  
  // Use the new reactions hook
  const { reactionCounts, userReactions, toggleReaction } = useReactions(comment.id, collectionPath);

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

  // Check if user has liked this comment
  useEffect(() => {
    if (!currentUser || !comment.id) return;
    
    const likeRef = doc(db, collectionPath, comment.id, 'likes', currentUser.id);
    const unsub = onSnapshot(likeRef, (snap) => {
      setIsLiked(snap.exists());
    });
    
    return () => unsub();
  }, [currentUser, comment.id, collectionPath]);

  // Listen to likes count
  useEffect(() => {
    if (!comment.id) return;
    
    const likesQuery = query(collection(db, collectionPath, comment.id, 'likes'));
    const unsub = onSnapshot(likesQuery, (snap) => {
      setLikesCount(snap.docs.length);
    });
    
    return () => unsub();
  }, [comment.id, collectionPath]);

  // Click outside to close reactions picker
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!showReactions) return;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setShowReactions(false);
      }
    };

    if (showReactions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showReactions]);

  const createdAt = comment.createdAt?.toDate?.() 
    ? comment.createdAt instanceof Date 
      ? comment.createdAt 
      : comment.createdAt?.toDate?.() || new Date() 
    : comment.createdAt instanceof Date 
    ? comment.createdAt 
    : undefined;

  const isMyComment = comment.authorId && currentUser?.id === comment.authorId;

  const handleLike = async () => {
    if (!currentUser) {
      toast.error('Please log in to like comments');
      return;
    }

    try {
      const likeRef = doc(db, collectionPath, comment.id, 'likes', currentUser.id);
      
      if (isLiked) {
        // Unlike the comment
        await deleteDoc(likeRef);
      } else {
        // Like the comment
        await setDoc(likeRef, {
          userId: currentUser.id,
          createdAt: serverTimestamp()
        });
      }
    } catch (error: any) {
      toast.error('Failed to update like: ' + error.message);
    }
  };


  const marginLeft = threadLevel * 20; // 20px per thread level

  return (
    <div 
      className="relative"
      style={{ marginLeft: `${marginLeft}px` }}
    >
      <div className="bg-gray-50 rounded-lg p-3 mb-2 border-l-2 border-[#F25129]/30">
        {/* Comment Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-gray-900 text-sm">
              {comment.authorName || 'Member'}
            </span>
            {isMyComment && (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-[#F25129]/20 text-[#F25129]">
                You
              </span>
            )}
            {createdAt && (
              <span className="text-xs text-gray-400">
                {safeFormat(createdAt, 'MMM d, yyyy • h:mm a', '')}
              </span>
            )}
          </div>

          {/* Debug logging */}
          {(() => {
            console.log('🔍 Comment Delete Debug:', {
              commentId: comment.id,
              commentAuthorId: comment.authorId,
              commentAuthorName: comment.authorName,
              currentUserId: currentUser?.id,
              currentUserName: currentUser?.displayName,
              currentUserRole: currentUser?.role,
              isEqual: currentUser?.id === comment.authorId,
              isAdmin: isAdmin,
              shouldShowDelete: (currentUser?.id === comment.authorId || isAdmin)
            });
            return null;
          })()}

          
          {/* Comment Actions */}
          <div className="flex items-center space-x-2">
            {/* Emoji Reactions */}
            <div className="relative">
              <button
                ref={triggerRef}
                onClick={() => {
                  console.log('🎭 [CommentSection] React button clicked!', {
                    commentId: comment.id,
                    currentUser: currentUser?.id,
                    showReactions: showReactions
                  });
                  const newShowReactions = !showReactions;
                  console.log('🎭 [CommentSection] Setting showReactions to:', newShowReactions);
                  setShowReactions(newShowReactions);
                }}
                className="flex items-center space-x-1 text-xs text-gray-500 hover:text-[#F25129] transition-colors"
                aria-haspopup="menu"
                aria-expanded={showReactions}
                disabled={!currentUser}
                title="Add reaction"
              >
                <Smile className="w-3 h-3" />
                <span>React</span>
              </button>
              
              {/* Reaction Picker - Production Version */}
              <ReactionPicker
                isOpen={showReactions}
                onClose={() => {
                  console.log('🎨 [CommentSection] Closing reaction picker');
                  setShowReactions(false);
                }}
                onReaction={toggleReaction}
                userReactions={userReactions}
                triggerRef={triggerRef}
                disabled={!currentUser}
              />
            </div>

            {/* Like Button (Legacy) */}
            <button
              onClick={handleLike}
              className={`flex items-center space-x-1 text-xs transition-colors ${
                isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              }`}
            >
              <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
              <span>{likesCount}</span>
            </button>

            {/* Reply Button */}
            {threadLevel === 0 && ( // Only allow replies to top-level comments
              <button
                onClick={() => onReply(comment.id)}
                className="flex items-center space-x-1 text-xs text-gray-500 hover:text-[#F25129] transition-colors"
              >
                <Reply className="w-3 h-3" />
                <span>Reply</span>
              </button>
            )}

            {/* Delete Button - Icon only */}
            {(currentUser?.id === comment.authorId || isAdmin) && (
              <button
                onClick={() => {
                  console.log('🗑️ Delete button clicked!', {
                    currentUserId: currentUser?.id,
                    commentAuthorId: comment.authorId,
                    isEqual: currentUser?.id === comment.authorId,
                    isAdmin: isAdmin
                  });
                  setShowDeleteModal(true);
                }}
                className="flex items-center text-gray-500 hover:text-red-500 transition-colors"
                title={isAdmin ? "Delete thread (Admin)" : "Delete comment"}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Comment Text */}
        <div className="text-sm text-gray-700 mb-2">
          {comment.text}
        </div>
        
        {/* Comment Media */}
        {comment.mediaUrls && comment.mediaUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {comment.mediaUrls.map((url: string, index: number) => {
              // console.log('🖼️ [CommentSection] Rendering media:', url, 'for comment:', comment.id);
              return (
                <div key={index} className="relative group">
                  {url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ? (
                    <div className="relative">
                      <img
                        src={url}
                        alt={`Media ${index + 1}`}
                        className="w-24 h-24 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => {
                          console.log('🖼️ [CommentSection] Opening image in lightbox:', url);
                          openLightbox?.(comment.mediaUrls || [], index);
                        }}
                        onLoad={() => {
                          console.log('✅ [CommentSection] Image loaded successfully:', url);
                        }}
                        onError={(e) => {
                          console.error('❌ [CommentSection] Failed to load image:', url, e);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  ) : url.match(/\.(mp4|webm|ogg|mov|avi)(\?|$)/i) ? (
                    <div 
                      className="relative group cursor-pointer"
                      onClick={() => {
                        console.log('🎥 [CommentSection] Opening video in lightbox:', url);
                        openLightbox?.(comment.mediaUrls || [], index);
                      }}
                    >
                      <video
                        src={url}
                        className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                        onLoadedData={() => {
                          console.log('✅ [CommentSection] Video loaded successfully:', url);
                        }}
                        onError={(e) => {
                          console.error('❌ [CommentSection] Failed to load video:', url, e);
                          e.currentTarget.style.display = 'none';
                        }}
                        preload="metadata"
                        muted
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center pointer-events-none">
                        <div className="opacity-70 group-hover:opacity-100 transition-opacity">
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-24 h-24 flex items-center justify-center bg-gray-200 rounded-lg text-xs text-gray-500 cursor-pointer hover:bg-gray-300 transition-colors"
                         onClick={() => {
                           console.log('📁 [CommentSection] Opening generic file:', url);
                           window.open(url, '_blank');
                         }}>
                      File
                      <span className="ml-1 text-[#F25129] hover:underline">Open</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Reactions Display - Teams/WhatsApp Style */}
        {Object.keys(reactionCounts).length > 0 && (
          <div className="mb-2 w-full">
            <div className="flex flex-wrap gap-1 w-full overflow-hidden">
              {Object.entries(reactionCounts).slice(0, 3).map(([emoji, count]) => (
                <div
                  key={emoji}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-all duration-200 hover:scale-105 cursor-pointer flex-shrink-0 ${
                    userReactions[emoji]
                      ? 'bg-blue-100 border border-blue-300 text-blue-800 shadow-sm'
                      : 'bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() => {
                    console.log('🎯 [CommentSection] Reaction chip clicked!', {
                      emoji: emoji,
                      commentId: comment.id,
                      currentUser: currentUser?.id,
                      currentCount: count,
                      userHasReacted: userReactions[emoji]
                    });
                    toggleReaction(emoji);
                  }}
                  title={`${count} reaction${count > 1 ? 's' : ''}`}
                  style={{ maxWidth: 'calc(33.333% - 2px)', minWidth: 'fit-content' }}
                >
                  <span className="text-sm">{emoji}</span>
                  <span className="font-medium text-xs min-w-[16px] text-center">{count}</span>
                </div>
              ))}
              {Object.keys(reactionCounts).length > 3 && (
                <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-gray-100 border border-gray-200 text-gray-700 flex-shrink-0">
                  <span className="text-sm">+{Object.keys(reactionCounts).length - 3}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Replies Toggle */}
        {(comment.replyCount > 0 || (comment.replies && comment.replies.length > 0)) && (
          <button
            onClick={() => onToggleExpanded(comment.id)}
            className="flex items-center space-x-1 text-xs text-[#F25129] hover:text-[#E0451F] transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
            <span>
              {isExpanded ? 'Hide' : 'Show'} {comment.replies?.length || comment.replyCount || 0} repl{(comment.replies?.length || comment.replyCount || 0) === 1 ? 'y' : 'ies'}
            </span>
          </button>
        )}

        {/* Inline Reply Form */}
        {replyingTo === comment.id && (
          <div className="mt-2 ml-4 space-y-2">
            {/* Reply File Preview */}
            {replyFiles && replyFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {replyFiles.map((file: File, index: number) => (
                  <div key={index} className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
                    <Image className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700 truncate max-w-32">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (setReplyFiles) {
                          setReplyFiles((prev: File[]) => prev.filter((_: File, i: number) => i !== index));
                        }
                      }}
                      className="text-gray-500 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <form onSubmit={handleSubmitReply} className="flex space-x-2">
              <input
                type="text"
                value={replyText || ''}
                onChange={(e) => {
                  setReplyText?.(e.target.value);
                  // handleTyping(e.target.value, true);
                }}
                placeholder="Write a reply..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent text-sm"
                autoFocus
              />
              <input
                type="file"
                id={`reply-file-${comment.id}`}
                multiple
                accept="image/*,video/*"
                onChange={(e) => setReplyFiles?.(Array.from(e.target.files || []))}
                className="hidden"
              />
              <label
                htmlFor={`reply-file-${comment.id}`}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer flex items-center"
              >
                <Image className="w-4 h-4 text-gray-600" />
              </label>
              <button
                type="submit"
                disabled={(!replyText?.trim() && (!replyFiles || replyFiles.length === 0)) || uploading}
                className="px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {uploading ? 'Posting...' : 'Reply'}
              </button>
              <button
                type="button"
                onClick={() => setReplyingTo?.(null)}
                className="px-3 py-2 text-gray-500 hover:text-gray-700 transition-colors text-sm"
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        {/* Replies */}
        {isExpanded && comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                collectionPath={collectionPath}
                threadLevel={threadLevel + 1}
                onReply={onReply}
                onToggleExpanded={onToggleExpanded}
                isExpanded={false}
                replyingTo={replyingTo}
                replyText={replyText}
                setReplyText={setReplyText}
                handleSubmitReply={handleSubmitReply}
                setReplyingTo={setReplyingTo}
                openLightbox={openLightbox}
              />
            ))}
          </div>
        )}
      </div>

      {/* Admin Thread Deletion Modal */}
      <AdminThreadDeletionModal
        comment={comment}
        collectionPath={collectionPath}
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onThreadDeleted={() => {
          setShowDeleteModal(false);
          // The comment will be automatically removed from the UI due to real-time updates
        }}
      />
    </div>
  );
};

const CommentSection: React.FC<CommentSectionProps> = ({ 
  collectionPath, 
  initialOpen = false, 
  pageSize = 10 
}) => {
  // console.log('🔍 [CommentSection] Initializing with:', { collectionPath, initialOpen, pageSize });
  
  // Add animations for Microsoft Teams-like experience
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInScale {
        0% {
          opacity: 0;
          transform: translateX(calc(-50% + 20px)) scale(0.9);
        }
        100% {
          opacity: 1;
          transform: translateX(calc(-50% + 20px)) scale(1);
        }
      }
      @keyframes slideInUp {
        0% {
          opacity: 0;
          transform: translateY(10px) scale(0.8);
        }
        100% {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .reactions-container {
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        contain: layout;
      }
      .reactions-wrapper {
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        contain: layout;
      }
      .reaction-button {
        flex-shrink: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: calc(100% - 8px);
        contain: layout;
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);
  
  const { currentUser } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxMediaUrls, setLightboxMediaUrls] = useState<string[]>([]);
  const [lightboxCurrentIndex, setLightboxCurrentIndex] = useState(0);

  const comments = useThreadedComments(collectionPath, pageSize, { initialOpen });
  
  // console.log('🔍 [CommentSection] Comments hook result:', {
  //   open: comments.open,
  //   commentsCount: comments.commentsCount,
  //   commentsLength: comments.comments.length
  // });

  // Debug: Log when comments change (removed to prevent infinite re-renders)
  // useEffect(() => {
  //   console.log('📊 [CommentSection] Comments updated:', {
  //     count: comments.comments.length,
  //     comments: comments.comments.map(c => ({ id: c.id, text: c.text, mediaUrls: c.mediaUrls?.length || 0 }))
  //   });
  // }, [comments.comments]);

  // Typing indicator functionality (commented out for now)
  // const handleTyping = (text: string, isReply: boolean = false) => {
  //   if (!currentUser) return;
  //   
  //   const inputText = isReply ? text : newComment;
  //   
  //   if (inputText.length > 0 && !isTyping) {
  //     setIsTyping(true);
  //     // In a real app, you'd send this to a real-time service
  //     // For now, we'll simulate it locally
  //   }
  //   
  //   // Clear existing timeout
  //   if (typingTimeoutRef.current) {
  //     clearTimeout(typingTimeoutRef.current);
  //   }
  //   
  //   // Set new timeout to stop typing indicator
  //   typingTimeoutRef.current = setTimeout(() => {
  //     setIsTyping(false);
  //   }, 1000);
  // };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) {
      console.log('📁 [CommentSection] No files to upload');
      return [];
    }
    
    console.log('📁 [CommentSection] Starting file upload for', files.length, 'files:', files.map(f => f.name));
    
    const uploadPromises = files.map(async (file) => {
      try {
        const fileName = `${Date.now()}_${file.name}`;
        console.log('📁 [CommentSection] Uploading file:', fileName);
        const storageRef = ref(storage, `comments/${fileName}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log('📁 [CommentSection] File uploaded successfully:', fileName, 'URL:', downloadURL);
        return downloadURL;
      } catch (error) {
        console.error('❌ [CommentSection] File upload failed:', file.name, error);
        throw error;
      }
    });
    
    try {
      const urls = await Promise.all(uploadPromises);
      console.log('📁 [CommentSection] All files uploaded successfully:', urls);
      return urls;
    } catch (error) {
      console.error('❌ [CommentSection] File upload batch failed:', error);
      throw error;
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('💬 [CommentSection] Comment submission started');
    
    if (!currentUser) {
      console.log('❌ [CommentSection] No current user');
      toast.error('Please log in to comment');
      return;
    }

    const text = newComment.trim();
    const files = replyingTo ? replyFiles : selectedFiles;
    
    console.log('💬 [CommentSection] Comment data:', {
      text: text,
      files: files.length,
      replyingTo: replyingTo,
      threadLevel: replyingTo ? 1 : 0
    });
    
    if (!text && files.length === 0) {
      console.log('❌ [CommentSection] No text or files provided');
      toast.error('Please enter a comment or select a file');
      return;
    }

    if (text && text.length > 500) {
      console.log('❌ [CommentSection] Comment too long');
      toast.error('Comment must be 500 characters or less');
      return;
    }

    setUploading(true);
    try {
      console.log('💬 [CommentSection] Starting comment submission...');
      const mediaUrls = await uploadFiles(files);
      
      const commentData = {
        text,
        mediaUrls: mediaUrls,
        authorId: currentUser.id,
        authorName: currentUser.displayName || 'Member',
        createdAt: serverTimestamp(),
        parentCommentId: replyingTo || null,
        threadLevel: replyingTo ? 1 : 0,
        replyCount: 0,
      };
      
      console.log('💬 [CommentSection] Submitting comment to Firestore:', commentData);
      const docRef = await addDoc(collection(db, collectionPath), commentData);
      console.log('✅ [CommentSection] Comment submitted successfully with ID:', docRef.id);

      setNewComment('');
      setSelectedFiles([]);
      setReplyFiles([]);
      setReplyingTo(null);
      setReplyText('');
      toast.success('Comment posted!');
    } catch (error: any) {
      console.error('❌ [CommentSection] Comment submission failed:', error);
      toast.error('Failed to post comment: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('💬 [CommentSection] Reply submission started');
    
    if (!currentUser || !replyingTo) {
      console.log('❌ [CommentSection] No current user or replyingTo');
      toast.error('Please log in to reply');
      return;
    }

    const text = replyText?.trim() || '';
    const files = replyFiles || [];
    
    console.log('💬 [CommentSection] Reply data:', {
      text: text,
      files: files.length,
      replyingTo: replyingTo,
      threadLevel: 1
    });
    
    if (!text && files.length === 0) {
      console.log('❌ [CommentSection] No text or files provided for reply');
      toast.error('Please enter a reply or select a file');
      return;
    }

    if (text && text.length > 500) {
      console.log('❌ [CommentSection] Reply too long');
      toast.error('Reply must be 500 characters or less');
      return;
    }

    setUploading(true);
    try {
      console.log('💬 [CommentSection] Starting reply submission...');
      const mediaUrls = await uploadFiles(files);
      
      const replyData = {
        text,
        mediaUrls: mediaUrls,
        authorId: currentUser.id,
        authorName: currentUser.displayName || 'Member',
        createdAt: serverTimestamp(),
        parentCommentId: replyingTo,
        threadLevel: 1,
        replyCount: 0,
      };
      
      console.log('💬 [CommentSection] Submitting reply to Firestore:', replyData);
      const docRef = await addDoc(collection(db, collectionPath), replyData);
      console.log('✅ [CommentSection] Reply submitted successfully with ID:', docRef.id);

      setReplyText('');
      setReplyFiles([]);
      setReplyingTo(null);
      toast.success('Reply posted!');
    } catch (error: any) {
      console.error('❌ [CommentSection] Reply submission failed:', error);
      toast.error('Failed to post reply: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleReply = (commentId: string) => {
    setReplyingTo(commentId);
    setReplyText('');
  };

  const openLightbox = (mediaUrls: string[], startIndex: number = 0) => {
    setLightboxMediaUrls(mediaUrls);
    setLightboxCurrentIndex(startIndex);
    setLightboxOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Comments Toggle */}
      <button
        onClick={() => comments.setOpen(!comments.open)}
        className="flex items-center space-x-2 text-gray-500 hover:text-[#F25129] transition-colors"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm font-medium">{comments.commentsCount} comments</span>
      </button>

      {/* Comments Section */}
      {comments.open && (
        <div className="space-y-4">
          {/* Comments List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {comments.comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                collectionPath={collectionPath}
                threadLevel={0}
                onReply={handleReply}
                onToggleExpanded={comments.toggleExpanded}
                isExpanded={comments.expandedComments.has(comment.id)}
                replyingTo={replyingTo}
                replyText={replyText}
                setReplyText={setReplyText}
                handleSubmitReply={handleSubmitReply}
                setReplyingTo={setReplyingTo}
                replyFiles={replyFiles}
                setReplyFiles={setReplyFiles}
                uploading={uploading}
                openLightbox={openLightbox}
              />
            ))}
          </div>

          {/* Load More */}
          {comments.hasMore && (
            <button
              onClick={comments.loadMore}
              className="text-sm text-[#F25129] hover:text-[#E0451F] transition-colors"
            >
              Load more comments
            </button>
          )}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-center space-x-2 text-sm text-gray-500 py-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <span>{currentUser?.displayName || 'Someone'} is typing...</span>
            </div>
          )}

          {/* Main Comment Form */}
          <div className="space-y-2">
            {/* File Preview */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
                    <Image className="w-4 h-4 text-gray-600" />
                    <span className="text-sm text-gray-700 truncate max-w-32">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                      className="text-gray-500 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <form onSubmit={handleSubmitComment} className="space-y-2">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => {
                    setNewComment(e.target.value);
                    // handleTyping(e.target.value, false);
                  }}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent text-sm"
                />
                <input
                  type="file"
                  id="comment-file"
                  multiple
                  accept="image/*,video/*"
                  onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
                  className="hidden"
                />
                <label
                  htmlFor="comment-file"
                  className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer flex items-center"
                >
                  <Image className="w-4 h-4 text-gray-600" />
                </label>
                <button
                  type="submit"
                  disabled={(!newComment.trim() && selectedFiles.length === 0) || uploading}
                  className="px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {uploading ? 'Posting...' : 'Post'}
                </button>
              </div>
              {newComment.trim().length > 0 && (
                <div className="text-xs text-gray-500 text-right">
                  <span className={newComment.trim().length > 500 ? 'text-red-600' : ''}>
                    {newComment.trim().length}/500 chars
                  </span>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Media Lightbox */}
        <CommentMediaLightbox
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          mediaUrls={lightboxMediaUrls}
          currentIndex={lightboxCurrentIndex}
          onIndexChange={setLightboxCurrentIndex}
        />
    </div>
  );
};

export default CommentSection;