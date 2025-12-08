import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Eye, Loader2, MessageSquare, Image as ImageIcon, Video, AlertCircle, History, Edit, Save, X } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, getDocs, doc, getDoc, limit, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { ModerationService } from '../../services/moderationService';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';

interface PendingContent {
  id: string;
  type: 'post' | 'media';
  title?: string;
  content?: string;
  description?: string;
  authorId?: string;
  uploadedBy?: string;
  authorName?: string;
  uploadedByName?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  url?: string;
  moderationStatus: 'pending' | 'approved' | 'rejected';
  moderationReason?: string;
  moderationDetectedIssues?: string[];
  createdAt: any;
}

export const ContentModerationPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [pendingPosts, setPendingPosts] = useState<PendingContent[]>([]);
  const [pendingMedia, setPendingMedia] = useState<PendingContent[]>([]);
  const [rejectedPosts, setRejectedPosts] = useState<PendingContent[]>([]);
  const [rejectedMedia, setRejectedMedia] = useState<PendingContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'media' | 'rejected' | 'history'>('posts');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<{ [key: string]: string }>({});
  const [moderationHistory, setModerationHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editContent, setEditContent] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');

  // Load pending posts
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    const postsQuery = query(
      collection(db, 'posts'),
      where('moderationStatus', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribePosts = onSnapshot(
      postsQuery,
      (snapshot) => {
        const posts = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'post' as const,
          ...doc.data(),
        })) as PendingContent[];
        setPendingPosts(posts);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading pending posts:', error);
        setLoading(false);
      }
    );

    return () => unsubscribePosts();
  }, [currentUser]);

  // Load pending media
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    const mediaQuery = query(
      collection(db, 'media'),
      where('moderationStatus', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeMedia = onSnapshot(
      mediaQuery,
      (snapshot) => {
        const media = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'media' as const,
          ...doc.data(),
        })) as PendingContent[];
        setPendingMedia(media);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading pending media:', error);
        setLoading(false);
      }
    );

    return () => unsubscribeMedia();
  }, [currentUser]);

  // Load rejected posts
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    const rejectedPostsQuery = query(
      collection(db, 'posts'),
      where('moderationStatus', '==', 'rejected'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeRejectedPosts = onSnapshot(
      rejectedPostsQuery,
      (snapshot) => {
        const posts = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'post' as const,
          ...doc.data(),
        })) as PendingContent[];
        setRejectedPosts(posts);
      },
      (error) => {
        console.error('Error loading rejected posts:', error);
      }
    );

    return () => unsubscribeRejectedPosts();
  }, [currentUser]);

  // Load rejected media
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    const rejectedMediaQuery = query(
      collection(db, 'media'),
      where('moderationStatus', '==', 'rejected'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeRejectedMedia = onSnapshot(
      rejectedMediaQuery,
      (snapshot) => {
        const media = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'media' as const,
          ...doc.data(),
        })) as PendingContent[];
        setRejectedMedia(media);
      },
      (error) => {
        console.error('Error loading rejected media:', error);
      }
    );

    return () => unsubscribeRejectedMedia();
  }, [currentUser]);

  // Load moderation history
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    const historyQuery = query(
      collection(db, 'moderationLog'),
      orderBy('createdAt', 'desc'),
      limit(100) // Last 100 actions
    );

    const unsubscribeHistory = onSnapshot(
      historyQuery,
      (snapshot) => {
        const history = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        setModerationHistory(history);
        setLoadingHistory(false);
      },
      (error) => {
        console.error('Error loading moderation history:', error);
        setLoadingHistory(false);
      }
    );

    return () => unsubscribeHistory();
  }, [currentUser]);

  const handleApprove = async (content: PendingContent) => {
    if (!currentUser) return;
    
    setProcessingIds(prev => new Set(prev).add(content.id));
    try {
      await ModerationService.approveContent(content.id, content.type, currentUser.id);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(content.id);
        return next;
      });
    }
  };

  const handleReject = async (content: PendingContent) => {
    if (!currentUser) return;
    
    const reason = rejectReason[content.id] || 'Content does not meet community guidelines';
    
    setProcessingIds(prev => new Set(prev).add(content.id));
    try {
      await ModerationService.rejectContent(content.id, content.type, currentUser.id, reason);
      setRejectReason(prev => {
        const next = { ...prev };
        delete next[content.id];
        return next;
      });
      setExpandedId(null);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(content.id);
        return next;
      });
    }
  };

  const getContentForTab = () => {
    if (activeTab === 'posts') return pendingPosts;
    if (activeTab === 'media') return pendingMedia;
    if (activeTab === 'rejected') return [...rejectedPosts, ...rejectedMedia];
    return [];
  };

  const pendingContent = getContentForTab();
  const totalPending = pendingPosts.length + pendingMedia.length;
  const totalRejected = rejectedPosts.length + rejectedMedia.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Content Moderation</h2>
          <p className="text-gray-600 mt-1">
            Review and approve pending posts and media
          </p>
        </div>
        {totalPending > 0 && (
          <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-full text-sm font-semibold">
            {totalPending} pending
          </div>
        )}
      </div>

      {/* Statistics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{totalPending}</p>
            </div>
            <Clock className="w-8 h-8 text-amber-500" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Rejected</p>
              <p className="text-2xl font-bold text-red-600">{totalRejected}</p>
            </div>
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Posts</p>
              <p className="text-2xl font-bold text-blue-600">{pendingPosts.length}</p>
            </div>
            <MessageSquare className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Media</p>
              <p className="text-2xl font-bold text-purple-600">{pendingMedia.length}</p>
            </div>
            <ImageIcon className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('posts')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'posts'
              ? 'text-[#F25129] border-b-2 border-[#F25129]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <MessageSquare className="w-4 h-4 inline mr-2" />
          Posts ({pendingPosts.length})
        </button>
        <button
          onClick={() => setActiveTab('media')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'media'
              ? 'text-[#F25129] border-b-2 border-[#F25129]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ImageIcon className="w-4 h-4 inline mr-2" />
          Media ({pendingMedia.length})
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'rejected'
              ? 'text-[#F25129] border-b-2 border-[#F25129]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <XCircle className="w-4 h-4 inline mr-2" />
          Rejected ({totalRejected})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-[#F25129] border-b-2 border-[#F25129]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <History className="w-4 h-4 inline mr-2" />
          History ({moderationHistory.length})
        </button>
      </div>

      {/* Moderation History */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {loadingHistory ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#F25129] mx-auto mb-4" />
              <p className="text-gray-600">Loading moderation history...</p>
            </div>
          ) : moderationHistory.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 font-medium">No moderation history yet</p>
              <p className="text-sm text-gray-500 mt-1">Moderation actions will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {moderationHistory.map((log) => {
                const createdAt = log.createdAt?.toDate?.() || new Date(log.createdAt);
                const isApproved = log.action === 'approved';
                
                return (
                  <div
                    key={log.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {isApproved ? (
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-1 text-xs font-semibold rounded ${
                              isApproved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {isApproved ? 'Approved' : 'Rejected'}
                            </span>
                            <span className="text-sm text-gray-500 flex items-center gap-1">
                              {log.contentType === 'post' ? (
                                <MessageSquare className="w-4 h-4" />
                              ) : (
                                <ImageIcon className="w-4 h-4" />
                              )}
                              {log.contentType}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-gray-900 mb-1">
                            {log.contentTitle || 'Untitled'}
                          </p>
                          <p className="text-xs text-gray-500 mb-2">
                            {format(createdAt, 'MMM d, yyyy h:mm a')}
                          </p>
                          {log.reason && (
                            <p className="text-sm text-gray-600 mt-2">
                              <strong>Reason:</strong> {log.reason}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-2">
                            Admin: {log.adminId?.substring(0, 8)}... • Author: {log.authorId?.substring(0, 8)}...
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Content List */}
      {activeTab !== 'history' && loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#F25129] mx-auto mb-4" />
          <p className="text-gray-600">Loading pending content...</p>
        </div>
      ) : pendingContent.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">
            {activeTab === 'rejected' ? 'No rejected content' : `No pending ${activeTab}`}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {activeTab === 'rejected' ? 'All content has been approved' : 'All content has been reviewed'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Bulk Actions */}
          {pendingContent.length > 0 && activeTab !== 'rejected' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.size === pendingContent.length && pendingContent.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(pendingContent.map(c => c.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                  className="w-4 h-4 text-[#F25129] rounded focus:ring-[#F25129]"
                />
                <span className="text-sm text-gray-700">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                </span>
              </div>
              {selectedIds.size > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!currentUser) return;
                      const selected = pendingContent.filter(c => selectedIds.has(c.id));
                      setProcessingIds(new Set(selected.map(c => c.id)));
                      try {
                        await Promise.all(selected.map(content => 
                          ModerationService.approveContent(content.id, content.type, currentUser.id)
                        ));
                        toast.success(`Approved ${selected.length} item(s)`);
                        setSelectedIds(new Set());
                      } catch (error: any) {
                        toast.error(error?.message || 'Failed to approve some items');
                      } finally {
                        setProcessingIds(new Set());
                      }
                    }}
                    disabled={processingIds.size > 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve Selected ({selectedIds.size})
                  </button>
                  <button
                    onClick={async () => {
                      if (!currentUser) return;
                      const reason = prompt('Enter rejection reason (optional):') || 'Content does not meet community guidelines';
                      if (!reason) return;
                      const selected = pendingContent.filter(c => selectedIds.has(c.id));
                      setProcessingIds(new Set(selected.map(c => c.id)));
                      try {
                        await Promise.all(selected.map(content => 
                          ModerationService.rejectContent(content.id, content.type, currentUser.id, reason)
                        ));
                        toast.success(`Rejected ${selected.length} item(s)`);
                        setSelectedIds(new Set());
                      } catch (error: any) {
                        toast.error(error?.message || 'Failed to reject some items');
                      } finally {
                        setProcessingIds(new Set());
                      }
                    }}
                    disabled={processingIds.size > 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject Selected ({selectedIds.size})
                  </button>
                </div>
              )}
            </div>
          )}

          {pendingContent.map((content) => {
            const isProcessing = processingIds.has(content.id);
            const isExpanded = expandedId === content.id;
            const authorId = content.type === 'post' ? content.authorId : content.uploadedBy;
            const authorName = content.type === 'post' ? content.authorName : content.uploadedByName;

            return (
              <div
                key={content.id}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    {activeTab !== 'rejected' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(content.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(prev => new Set(prev).add(content.id));
                          } else {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              next.delete(content.id);
                              return next;
                            });
                          }
                        }}
                        className="w-4 h-4 text-[#F25129] rounded focus:ring-[#F25129] mt-1"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {content.type === 'post' ? (
                          <MessageSquare className="w-5 h-5 text-[#F25129]" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-[#F25129]" />
                        )}
                        <h3 className="font-semibold text-gray-900">
                          {content.type === 'post' 
                            ? content.title || 'Untitled Post'
                            : 'Media Upload'}
                        </h3>
                        {content.moderationStatus === 'rejected' ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded">
                            Rejected
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded">
                            Pending Review
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        By {authorName || 'Unknown'} • {new Date(content.createdAt?.toDate?.() || content.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Content Preview/Edit */}
                <div className="mb-4">
                  {editingId === content.id ? (
                    // Edit Mode
                    <div className="space-y-4">
                      {content.type === 'post' ? (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                              placeholder="Post title"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                              rows={6}
                              placeholder="Post content"
                            />
                          </div>
                        </>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                          <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                            rows={4}
                            placeholder="Media description"
                          />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!currentUser) return;
                            setProcessingIds(prev => new Set(prev).add(content.id));
                            try {
                              const contentRef = doc(db, content.type, content.id);
                              const updates: any = {
                                updatedAt: serverTimestamp(),
                              };
                              
                              if (content.type === 'post') {
                                if (editTitle) updates.title = editTitle;
                                if (editContent) updates.content = editContent;
                              } else {
                                if (editDescription) updates.description = editDescription;
                              }
                              
                              await updateDoc(contentRef, updates);
                              toast.success('Content updated successfully');
                              setEditingId(null);
                              setEditTitle('');
                              setEditContent('');
                              setEditDescription('');
                            } catch (error: any) {
                              console.error('Error updating content:', error);
                              toast.error(error?.message || 'Failed to update content');
                            } finally {
                              setProcessingIds(prev => {
                                const next = new Set(prev);
                                next.delete(content.id);
                                return next;
                              });
                            }
                          }}
                          disabled={processingIds.has(content.id)}
                          className="px-4 py-2 text-sm font-medium text-white bg-[#F25129] rounded-lg hover:bg-[#E0451F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <Save className="w-4 h-4" />
                          Save Changes
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditTitle('');
                            setEditContent('');
                            setEditDescription('');
                          }}
                          disabled={processingIds.has(content.id)}
                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          <X className="w-4 h-4" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <>
                      {content.type === 'post' ? (
                        <div>
                          {content.imageUrl && (
                            <img
                              src={content.imageUrl}
                              alt="Post"
                              className="w-full max-w-md rounded-lg mb-3"
                            />
                          )}
                          <p className="text-gray-700 whitespace-pre-wrap line-clamp-3">
                            {content.content}
                          </p>
                        </div>
                      ) : (
                        <div>
                          {content.thumbnailUrl && (
                            <img
                              src={content.thumbnailUrl}
                              alt="Media"
                              className="w-full max-w-md rounded-lg mb-3"
                            />
                          )}
                          {content.description && (
                            <p className="text-gray-700">{content.description}</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Rejection Reason */}
                {content.moderationStatus === 'rejected' && content.moderationReason && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-900 mb-1">Rejection Reason:</p>
                        <p className="text-sm text-red-800">{content.moderationReason}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Moderation Issues */}
                {content.moderationDetectedIssues && content.moderationDetectedIssues.length > 0 && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900 mb-1">Detected Issues:</p>
                        <ul className="text-sm text-amber-800 list-disc list-inside">
                          {content.moderationDetectedIssues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3">
                  {editingId !== content.id && (
                    <>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : content.id)}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        <Eye className="w-4 h-4 inline mr-2" />
                        {isExpanded ? 'Hide' : 'View'} Details
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(content.id);
                          setEditTitle(content.title || '');
                          setEditContent(content.content || '');
                          setEditDescription(content.description || '');
                        }}
                        disabled={isProcessing}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                    </>
                  )}
                  
                  {content.moderationStatus === 'rejected' ? (
                    // For rejected content, only show re-approve button
                    <button
                      onClick={() => handleApprove(content)}
                      disabled={isProcessing}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Re-approve
                    </button>
                  ) : (
                    // For pending content, show both approve and reject
                    <>
                      <button
                        onClick={() => handleApprove(content)}
                        disabled={isProcessing}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        Approve
                      </button>
                      
                      <button
                        onClick={() => handleReject(content)}
                        disabled={isProcessing}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        Reject
                      </button>
                    </>
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Rejection Reason (optional)
                        </label>
                        <textarea
                          value={rejectReason[content.id] || ''}
                          onChange={(e) => setRejectReason(prev => ({ ...prev, [content.id]: e.target.value }))}
                          placeholder="Explain why this content is being rejected..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                          rows={3}
                        />
                      </div>
                      {content.moderationReason && (
                        <div className="text-sm text-gray-600">
                          <strong>Original Moderation Reason:</strong> {content.moderationReason}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

