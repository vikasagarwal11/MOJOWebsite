import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, collectionGroup } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { MessageSquare, Image as ImageIcon, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

interface UserContent {
  id: string;
  type: 'post' | 'media' | 'comment';
  title?: string;
  content?: string;
  description?: string;
  moderationStatus: 'pending' | 'approved' | 'rejected';
  moderationReason?: string;
  createdAt: any;
  collectionPath?: string; // For comments
}

export const ProfileContentTab: React.FC = () => {
  const { currentUser } = useAuth();
  const [pendingContent, setPendingContent] = useState<UserContent[]>([]);
  const [rejectedContent, setRejectedContent] = useState<UserContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'rejected'>('all');

  useEffect(() => {
    if (!currentUser) return;

    // Load pending posts
    const pendingPostsQuery = query(
      collection(db, 'posts'),
      where('authorId', '==', currentUser.id),
      where('moderationStatus', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    // Load rejected posts
    const rejectedPostsQuery = query(
      collection(db, 'posts'),
      where('authorId', '==', currentUser.id),
      where('moderationStatus', '==', 'rejected'),
      orderBy('createdAt', 'desc')
    );

    // Load pending media
    const pendingMediaQuery = query(
      collection(db, 'media'),
      where('uploadedBy', '==', currentUser.id),
      where('moderationStatus', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    // Load rejected media
    const rejectedMediaQuery = query(
      collection(db, 'media'),
      where('uploadedBy', '==', currentUser.id),
      where('moderationStatus', '==', 'rejected'),
      orderBy('createdAt', 'desc')
    );

    // Load pending comments (using collectionGroup)
    const pendingCommentsQuery = query(
      collectionGroup(db, 'comments'),
      where('authorId', '==', currentUser.id),
      where('moderationStatus', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    // Load rejected comments
    const rejectedCommentsQuery = query(
      collectionGroup(db, 'comments'),
      where('authorId', '==', currentUser.id),
      where('moderationStatus', '==', 'rejected'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribers: (() => void)[] = [];

    // Subscribe to pending posts
    const unsubPendingPosts = onSnapshot(
      pendingPostsQuery,
      (snapshot) => {
        const posts = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'post' as const,
          title: doc.data().title,
          content: doc.data().content,
          moderationStatus: doc.data().moderationStatus,
          moderationReason: doc.data().moderationReason,
          createdAt: doc.data().createdAt,
        }));
        updateContent('pending', 'post', posts);
      },
      (error) => {
        console.error('Error loading pending posts:', error);
      }
    );
    unsubscribers.push(unsubPendingPosts);

    // Subscribe to rejected posts
    const unsubRejectedPosts = onSnapshot(
      rejectedPostsQuery,
      (snapshot) => {
        const posts = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'post' as const,
          title: doc.data().title,
          content: doc.data().content,
          moderationStatus: doc.data().moderationStatus,
          moderationReason: doc.data().moderationReason,
          createdAt: doc.data().createdAt,
        }));
        updateContent('rejected', 'post', posts);
      },
      (error) => {
        console.error('Error loading rejected posts:', error);
      }
    );
    unsubscribers.push(unsubRejectedPosts);

    // Subscribe to pending media
    const unsubPendingMedia = onSnapshot(
      pendingMediaQuery,
      (snapshot) => {
        const media = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'media' as const,
          description: doc.data().description,
          moderationStatus: doc.data().moderationStatus,
          moderationReason: doc.data().moderationReason,
          createdAt: doc.data().createdAt,
        }));
        updateContent('pending', 'media', media);
      },
      (error) => {
        console.error('Error loading pending media:', error);
      }
    );
    unsubscribers.push(unsubPendingMedia);

    // Subscribe to rejected media
    const unsubRejectedMedia = onSnapshot(
      rejectedMediaQuery,
      (snapshot) => {
        const media = snapshot.docs.map(doc => ({
          id: doc.id,
          type: 'media' as const,
          description: doc.data().description,
          moderationStatus: doc.data().moderationStatus,
          moderationReason: doc.data().moderationReason,
          createdAt: doc.data().createdAt,
        }));
        updateContent('rejected', 'media', media);
      },
      (error) => {
        console.error('Error loading rejected media:', error);
      }
    );
    unsubscribers.push(unsubRejectedMedia);

    // Subscribe to pending comments
    const unsubPendingComments = onSnapshot(
      pendingCommentsQuery,
      (snapshot) => {
        const comments = snapshot.docs.map(doc => {
          const pathParts = doc.ref.path.split('/');
          return {
            id: doc.id,
            type: 'comment' as const,
            content: doc.data().text,
            moderationStatus: doc.data().moderationStatus,
            moderationReason: doc.data().moderationReason,
            createdAt: doc.data().createdAt,
            collectionPath: pathParts.slice(0, -1).join('/'), // e.g., 'posts/{postId}/comments'
          };
        });
        updateContent('pending', 'comment', comments);
      },
      (error) => {
        console.error('Error loading pending comments:', error);
      }
    );
    unsubscribers.push(unsubPendingComments);

    // Subscribe to rejected comments
    const unsubRejectedComments = onSnapshot(
      rejectedCommentsQuery,
      (snapshot) => {
        const comments = snapshot.docs.map(doc => {
          const pathParts = doc.ref.path.split('/');
          return {
            id: doc.id,
            type: 'comment' as const,
            content: doc.data().text,
            moderationStatus: doc.data().moderationStatus,
            moderationReason: doc.data().moderationReason,
            createdAt: doc.data().createdAt,
            collectionPath: pathParts.slice(0, -1).join('/'),
          };
        });
        updateContent('rejected', 'comment', comments);
      },
      (error) => {
        console.error('Error loading rejected comments:', error);
      }
    );
    unsubscribers.push(unsubRejectedComments);

    setLoading(false);

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [currentUser]);

  const updateContent = (status: 'pending' | 'rejected', contentType: 'post' | 'media' | 'comment', items: UserContent[]) => {
    if (status === 'pending') {
      setPendingContent(prev => {
        const filtered = prev.filter(item => !(item.type === contentType));
        return [...filtered, ...items];
      });
    } else {
      setRejectedContent(prev => {
        const filtered = prev.filter(item => !(item.type === contentType));
        return [...filtered, ...items];
      });
    }
  };

  const allContent = [...pendingContent, ...rejectedContent].sort((a, b) => {
    const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
    const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
    return bTime - aTime;
  });

  const filteredContent = activeFilter === 'all' 
    ? allContent 
    : activeFilter === 'pending' 
      ? pendingContent 
      : rejectedContent;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-amber-500" />;
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'post':
        return <MessageSquare className="w-4 h-4 text-[#F25129]" />;
      case 'media':
        return <ImageIcon className="w-4 h-4 text-[#F25129]" />;
      case 'comment':
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">My Content</h2>
        <p className="text-gray-600">View the moderation status of your posts, media, and comments</p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeFilter === 'all'
              ? 'text-[#F25129] border-b-2 border-[#F25129]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All ({allContent.length})
        </button>
        <button
          onClick={() => setActiveFilter('pending')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeFilter === 'pending'
              ? 'text-[#F25129] border-b-2 border-[#F25129]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Clock className="w-4 h-4 inline mr-2" />
          Pending ({pendingContent.length})
        </button>
        <button
          onClick={() => setActiveFilter('rejected')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeFilter === 'rejected'
              ? 'text-[#F25129] border-b-2 border-[#F25129]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <XCircle className="w-4 h-4 inline mr-2" />
          Rejected ({rejectedContent.length})
        </button>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F25129] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your content...</p>
        </div>
      ) : filteredContent.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">
            {activeFilter === 'all' 
              ? 'No content submitted yet' 
              : activeFilter === 'pending' 
                ? 'No pending content' 
                : 'No rejected content'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {activeFilter === 'all' 
              ? 'Your approved content is visible on the site' 
              : activeFilter === 'pending' 
                ? 'All your content has been reviewed' 
                : 'All your content has been approved'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredContent.map((item) => {
            const createdAt = item.createdAt?.toDate?.() || new Date(item.createdAt);
            
            return (
              <div
                key={`${item.type}-${item.id}`}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    {getTypeIcon(item.type)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900">
                          {item.type === 'post' 
                            ? item.title || 'Untitled Post'
                            : item.type === 'media'
                              ? 'Media Upload'
                              : 'Comment'}
                        </h3>
                        {getStatusIcon(item.moderationStatus)}
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${
                          item.moderationStatus === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : item.moderationStatus === 'rejected'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                        }`}>
                          {item.moderationStatus === 'pending' ? 'Pending Review' : 
                           item.moderationStatus === 'rejected' ? 'Rejected' : 'Approved'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {format(createdAt, 'MMM d, yyyy h:mm a')}
                      </p>
                      {(item.content || item.description) && (
                        <p className="text-gray-700 text-sm line-clamp-2">
                          {item.content || item.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rejection Reason */}
                {item.moderationStatus === 'rejected' && item.moderationReason && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-900 mb-1">Rejection Reason:</p>
                        <p className="text-sm text-red-800">{item.moderationReason}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pending Status Message */}
                {item.moderationStatus === 'pending' && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-900 mb-1">Under Review</p>
                        <p className="text-sm text-amber-800">
                          Your {item.type} is being reviewed by our moderation team. You'll be notified once it's been reviewed.
                        </p>
                      </div>
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

