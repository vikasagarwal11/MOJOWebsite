import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Eye, Loader2, MessageSquare, Image as ImageIcon, Video, AlertCircle } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { ModerationService } from '../../services/moderationService';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'media'>('posts');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<{ [key: string]: string }>({});

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

  const pendingContent = activeTab === 'posts' ? pendingPosts : pendingMedia;
  const totalPending = pendingPosts.length + pendingMedia.length;

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
      </div>

      {/* Content List */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#F25129] mx-auto mb-4" />
          <p className="text-gray-600">Loading pending content...</p>
        </div>
      ) : pendingContent.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">No pending {activeTab}</p>
          <p className="text-sm text-gray-500 mt-1">All content has been reviewed</p>
        </div>
      ) : (
        <div className="space-y-4">
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
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded">
                        Pending Review
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      By {authorName || 'Unknown'} • {new Date(content.createdAt?.toDate?.() || content.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Content Preview */}
                <div className="mb-4">
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
                </div>

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
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : content.id)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Eye className="w-4 h-4 inline mr-2" />
                    {isExpanded ? 'Hide' : 'View'} Details
                  </button>
                  
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

