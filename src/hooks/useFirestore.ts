// src/hooks/useFirestore.ts
import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

/** Remove undefined so Firestore doesn’t throw (it rejects undefined field values). */
function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Convert common timestamp fields (if present) to Date for UI convenience. */
function normalizeDoc(docData: any) {
  const d = { id: docData.id, ...docData };
  const tsFields = ['createdAt', 'updatedAt', 'date', 'validUntil', 'startAt'];
  for (const f of tsFields) {
    // @ts-ignore
    const v = d[f];
    // Firestore Timestamp has toDate; keep JS Date as-is
    // @ts-ignore
    d[f] = v?.toDate?.() ? v.toDate() : v instanceof Date ? v : v;
  }
  return d;
}

/**
 * Policy-aware defaults:
 * - posts  : guests see only isPublic==true, newest first (requires composite index)
 * - events : guests see only public==true, soonest first (requires composite index)
 * If caller passes constraints, we respect them and DO NOT add defaults.
 */
function defaultConstraintsFor(collectionName: string, isAuthed: boolean): QueryConstraint[] {
  if (isAuthed) return [];
  if (collectionName === 'posts') {
    // Index: isPublic ASC, createdAt DESC
    return [where('isPublic', '==', true), orderBy('createdAt', 'desc')];
  }
  if (collectionName === 'events') {
    // Index: public ASC, startAt ASC
    return [where('public', '==', true), orderBy('startAt', 'asc')];
  }
  // For other collections, no default
  return [];
}

export const useFirestore = () => {
  const { currentUser } = useAuth();

  // ---------- Simple “get all” (no realtime) ----------
  // Keeps your original signature; if you want defaults here later, add an optional arg.
  const getCollection = async (collectionName: string) => {
    try {
      const snap = await getDocs(collection(db, collectionName));
      return snap.docs.map(d => normalizeDoc({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error(`Error getting ${collectionName}:`, error);
      toast.error(`Failed to load ${collectionName}`);
      return [];
    }
  };

  // ---------- Writes ----------
  const addDocument = async (collectionName: string, data: any) => {
    try {
      const cleaned = stripUndefined({
        ...data,
        // if caller already set createdAt/updatedAt, we leave them; otherwise set here
        createdAt: data?.createdAt ?? serverTimestamp(),
        updatedAt: data?.updatedAt ?? serverTimestamp(),
      });
      const docRef = await addDoc(collection(db, collectionName), cleaned);
      toast.success('Document created successfully');
      return docRef.id;
    } catch (error) {
      console.error(`Error adding to ${collectionName}:`, error);
      toast.error('Failed to create document');
      throw error;
    }
  };

  const updateDocument = async (collectionName: string, docId: string, data: any) => {
    try {
      const cleaned = stripUndefined({ ...data, updatedAt: serverTimestamp() });
      await updateDoc(doc(db, collectionName, docId), cleaned);
      toast.success('Document updated successfully');
    } catch (error) {
      console.error(`Error updating ${collectionName}:`, error);
      toast.error('Failed to update document');
      throw error;
    }
  };

  const deleteDocument = async (collectionName: string, docId: string) => {
    try {
      await deleteDoc(doc(db, collectionName, docId));
      toast.success('Document deleted successfully');
    } catch (error) {
      console.error(`Error deleting from ${collectionName}:`, error);
      toast.error('Failed to delete document');
      throw error;
    }
  };

  // ---------- Realtime ----------
  /**
   * Realtime listener with policy defaults.
   * If you pass `queryConstraints`, they are used as-is.
   * If you pass none, we apply safe defaults based on auth + collection.
   */
  const useRealtimeCollection = (
    collectionName: string,
    queryConstraints: QueryConstraint[] = []
  ) => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const baseRef = collection(db, collectionName);

      const constraints =
        queryConstraints.length > 0
          ? queryConstraints
          : defaultConstraintsFor(collectionName, !!currentUser);

      const q = constraints.length ? query(baseRef, ...constraints) : query(baseRef);

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const rows = snapshot.docs.map(d => normalizeDoc({ id: d.id, ...d.data() }));
          setData(rows);
          setLoading(false);
        },
        (error) => {
          console.error(`Error listening to ${collectionName}:`, error);
          setLoading(false);
          // Helpful hint for common case
          if ((error as any)?.code === 'permission-denied' && !currentUser) {
            toast.error('Sign in to see private items.');
          }
        }
      );

      return () => unsubscribe();
      // Re-subscribe when auth state, collection, or constraints change
    }, [collectionName, currentUser?.id, currentUser?.role, JSON.stringify(queryConstraints)]);

    return { data, loading };
  };

  return {
    getCollection,
    addDocument,
    updateDocument,
    deleteDocument,
    useRealtimeCollection,
  };
};
