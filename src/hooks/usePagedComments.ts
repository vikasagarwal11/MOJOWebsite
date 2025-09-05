import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, startAfter } from 'firebase/firestore';
import { db } from '../config/firebase';

export type Comment = { id: string; text: string; authorName?: string; authorId?: string; createdAt?: any };

export function usePagedComments(
  mediaId: string | undefined, 
  pageSize = 10, 
  opts?: { initialOpen?: boolean }
) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [lastDoc, setLastDoc] = useState<any | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [open, setOpen] = useState(!!opts?.initialOpen); // default false
  const [commentsCount, setCommentsCount] = useState<number>(0);

  // Global comment count listener - always active for real-time updates
  useEffect(() => {
    if (!mediaId) return;
    const q = query(collection(db, 'media', mediaId, 'comments'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setCommentsCount(snap.docs.length);
    });
    return () => unsub();
  }, [mediaId]);

  // Load detailed comments when panel opens
  useEffect(() => {
    if (!open || !mediaId) return;
    const q = query(collection(db, 'media', mediaId, 'comments'), orderBy('createdAt', 'desc'), limit(pageSize));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.docs.length === pageSize);
    });
    return () => unsub();
  }, [open, mediaId, pageSize]);

  const loadMore = useCallback(async () => {
    if (!mediaId || !lastDoc) return;
    const q = query(collection(db, 'media', mediaId, 'comments'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(pageSize));
    const snap = await getDocs(q);
    setComments(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))]);
    setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === pageSize);
  }, [mediaId, lastDoc, pageSize]);

  return { open, setOpen, comments, hasMore, loadMore, commentsCount };
}