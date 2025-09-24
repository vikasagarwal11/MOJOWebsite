import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db } from '../config/firebase';

export type ThreadedComment = { 
  id: string; 
  text: string; 
  authorName?: string; 
  authorId?: string; 
  createdAt?: any;
  parentCommentId?: string;
  threadLevel: number;
  replyCount: number;
  isExpanded?: boolean;
  mediaUrls?: string[]; // Added for media files
};

export function useThreadedComments(
  collectionPath: string, // e.g., 'posts/{id}/comments' or 'media/{id}/comments'
  pageSize = 10, 
  opts?: { initialOpen?: boolean }
) {
  const [comments, setComments] = useState<ThreadedComment[]>([]);
  const [lastDoc, setLastDoc] = useState<any | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [open, setOpen] = useState(!!opts?.initialOpen);
  const [commentsCount, setCommentsCount] = useState<number>(0);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // Global comment count listener - always active for real-time updates
  useEffect(() => {
    if (!collectionPath) return;
    console.log('🔍 [useThreadedComments] Setting up global comment count listener for:', collectionPath);
    const q = query(collection(db, collectionPath), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      console.log('📊 [useThreadedComments] Global comment count updated:', snap.docs.length);
      setCommentsCount(snap.docs.length);
    }, (error) => {
      console.error('❌ [useThreadedComments] Global comment count listener error:', error);
    });
    return () => {
      console.log('🔍 [useThreadedComments] Cleaning up global comment count listener');
      unsub();
    };
  }, [collectionPath]);

  // Load detailed comments when panel opens
  useEffect(() => {
    if (!open || !collectionPath) return;
    
    console.log('🔍 [useThreadedComments] Setting up detailed comments listener for:', collectionPath, 'open:', open);
    
    // Load top-level comments first - simplified query while index builds
    const q = query(
      collection(db, collectionPath), 
      where('threadLevel', '==', 0),
      limit(pageSize)
    );
    
    const unsub = onSnapshot(q, async (snap) => {
      console.log('📊 [useThreadedComments] Top-level comments snapshot received:', snap.docs.length, 'docs');
      
      const topLevelComments = snap.docs
        .map(d => ({ 
          id: d.id, 
          ...(d.data() as any),
          isExpanded: expandedComments.has(d.id)
        }))
        .sort((a, b) => {
          // Client-side sorting by createdAt (newest first)
          const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        });
      
      console.log('📊 [useThreadedComments] Top-level comments processed:', topLevelComments.length);
      
      // Load replies for all comments (not just expanded ones)
      const commentsWithReplies = await Promise.all(
        topLevelComments.map(async (comment) => {
          const repliesQuery = query(
            collection(db, collectionPath),
            where('parentCommentId', '==', comment.id)
          );
          const repliesSnap = await getDocs(repliesQuery);
          const replies = repliesSnap.docs
            .map(d => ({ 
              id: d.id, 
              ...(d.data() as any) 
            }))
            .sort((a, b) => {
              // Client-side sorting by createdAt (oldest first for replies)
              const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
              const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
              return aTime - bTime;
            });
          
          console.log(`📊 [useThreadedComments] Comment ${comment.id} has ${replies.length} replies`);
          return { ...comment, replies, replyCount: replies.length };
        })
      );
      
      console.log('📊 [useThreadedComments] Setting comments with replies:', commentsWithReplies.length);
      setComments(commentsWithReplies);
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === pageSize);
    }, (error) => {
      console.error('❌ [useThreadedComments] Detailed comments listener error:', error);
    });
    
    return () => {
      console.log('🔍 [useThreadedComments] Cleaning up detailed comments listener');
      unsub();
    };
  }, [open, collectionPath, pageSize, expandedComments]);

  // Real-time listener for all comments (including replies) - this ensures real-time updates
  useEffect(() => {
    if (!open || !collectionPath) return;
    
    console.log('🔍 [useThreadedComments] Setting up real-time listener for:', collectionPath);
    const q = query(collection(db, collectionPath), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, async (snap) => {
      console.log('📊 [useThreadedComments] Real-time snapshot received:', snap.docs.length, 'total docs');
      
      // Update comment count in real-time
      setCommentsCount(snap.docs.length);
      
      // Force refresh of comments to get latest data
      const topLevelComments = snap.docs
        .filter(doc => doc.data().threadLevel === 0)
        .map(d => ({ 
          id: d.id, 
          ...(d.data() as any),
          isExpanded: expandedComments.has(d.id)
        }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        });
      
      console.log('📊 [useThreadedComments] Real-time top-level comments:', topLevelComments.length);
      
      // Load replies for all comments
      const commentsWithReplies = await Promise.all(
        topLevelComments.map(async (comment) => {
          const repliesQuery = query(
            collection(db, collectionPath),
            where('parentCommentId', '==', comment.id)
          );
          const repliesSnap = await getDocs(repliesQuery);
          const replies = repliesSnap.docs
            .map(d => ({ 
              id: d.id, 
              ...(d.data() as any) 
            }))
            .sort((a, b) => {
              const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
              const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
              return aTime - bTime;
            });
          
          console.log(`📊 [useThreadedComments] Real-time comment ${comment.id} has ${replies.length} replies`);
          return { ...comment, replies, replyCount: replies.length };
        })
      );
      
      console.log('📊 [useThreadedComments] Real-time setting comments:', commentsWithReplies.length);
      setComments(commentsWithReplies);
    }, (error) => {
      console.error('❌ [useThreadedComments] Real-time listener error:', error);
    });
    
    return () => {
      console.log('🔍 [useThreadedComments] Cleaning up real-time listener');
      unsub();
    };
  }, [open, collectionPath, expandedComments]);

  const loadMore = useCallback(async () => {
    if (!collectionPath || !lastDoc) return;
    const q = query(
      collection(db, collectionPath), 
      where('threadLevel', '==', 0),
      startAfter(lastDoc), 
      limit(pageSize)
    );
    const snap = await getDocs(q);
    setComments(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))]);
    setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === pageSize);
  }, [collectionPath, lastDoc, pageSize]);

  const toggleExpanded = useCallback((commentId: string) => {
    setExpandedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  }, []);

  const loadReplies = useCallback(async (commentId: string) => {
    if (!collectionPath) return;
    
    const repliesQuery = query(
      collection(db, collectionPath),
      where('parentCommentId', '==', commentId)
    );
    
    const repliesSnap = await getDocs(repliesQuery);
    const replies = repliesSnap.docs
      .map(d => ({ 
        id: d.id, 
        ...(d.data() as any) 
      }))
      .sort((a, b) => {
        // Client-side sorting by createdAt (oldest first for replies)
        const aTime = a.createdAt?.toDate?.()?.getTime() || 0;
        const bTime = b.createdAt?.toDate?.()?.getTime() || 0;
        return aTime - bTime;
      });
    
    setComments(prev => prev.map(comment => 
      comment.id === commentId 
        ? { ...comment, replies, isExpanded: true }
        : comment
    ));
  }, [collectionPath]);

  return { 
    open, 
    setOpen, 
    comments, 
    hasMore, 
    loadMore, 
    commentsCount, 
    expandedComments,
    toggleExpanded,
    loadReplies
  };
}
