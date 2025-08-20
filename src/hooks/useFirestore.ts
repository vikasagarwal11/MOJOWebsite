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

/** Remove undefined so Firestore doesn’t throw on writes. */
function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Convert common timestamp fields (if present) to Date for UI convenience. */
function normalizeDoc(docData: any) {
  const out = { id: docData.id, ...docData };
  const tsFields = ['createdAt', 'updatedAt', 'date', 'validUntil', 'startAt'];
  for (const f of tsFields) {
    const v = (out as any)[f];
    (out as any)[f] = v?.toDate?.() ? v.toDate() : v instanceof Date ? v : v;
  }
  return out;
}

/* ---------- helpers to inspect/augment constraints (best-effort) ---------- */
function hasWhereEquals(constraints: QueryConstraint[], field: string, value: any) {
  return constraints.some((c: any) => {
    if (c?.type !== 'where') return false;
    const f =
      c?.field?.toString?.() ??
      c?._field?.toString?.() ??
      c?._field?.segments?.[0] ??
      c?._field?.canonicalString?.();
    return f === field && (c?.opStr === '==' || c?._op === '==') && (c?.value === value || c?._value === value);
  });
}

function hasAnyOrderBy(constraints: QueryConstraint[]) {
  return constraints.some((c: any) => c?.type === 'orderBy');
}

function hasOrderByField(constraints: QueryConstraint[], field: string) {
  return constraints.some((c: any) => {
    if (c?.type !== 'orderBy') return false;
    const f =
      c?.field?.toString?.() ??
      c?._field?.toString?.() ??
      c?._field?.segments?.[0] ??
      c?._field?.canonicalString?.();
    return f === field;
  });
}

/**
 * Enforce guest-readable queries:
 * - posts  : where(isPublic == true), default orderBy(createdAt desc)
 * - events : where(public == true),   default orderBy(startAt  asc)
 * - media  : where(isPublic == true), default orderBy(createdAt desc)
 */
function enforceGuestPolicy(
  collectionName: string,
  isAuthed: boolean,
  userConstraints: QueryConstraint[]
): QueryConstraint[] {
  if (isAuthed) return userConstraints;

  const out = [...userConstraints];

  if (collectionName === 'posts') {
    if (!hasWhereEquals(out, 'isPublic', true)) out.unshift(where('isPublic', '==', true));
    if (!hasAnyOrderBy(out) && !hasOrderByField(out, 'createdAt')) {
      out.push(orderBy('createdAt', 'desc'));
    }
  } else if (collectionName === 'events') {
    if (!hasWhereEquals(out, 'public', true)) out.unshift(where('public', '==', true));
    if (!hasAnyOrderBy(out) && !hasOrderByField(out, 'startAt')) {
      out.push(orderBy('startAt', 'asc'));
    }
  } else if (collectionName === 'media') {
    if (!hasWhereEquals(out, 'isPublic', true)) out.unshift(where('isPublic', '==', true));
    if (!hasAnyOrderBy(out) && !hasOrderByField(out, 'createdAt')) {
      out.push(orderBy('createdAt', 'desc'));
    }
  }

  return out;
}

export const useFirestore = () => {
  const { currentUser } = useAuth();

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

  const addDocument = async (collectionName: string, data: any) => {
    try {
      const cleaned = stripUndefined({
        ...data,
        createdAt: data?.createdAt ?? serverTimestamp(),
        updatedAt: data?.updatedAt ?? serverTimestamp(),
      });
      const ref = await addDoc(collection(db, collectionName), cleaned);
      toast.success('Document created successfully');
      return ref.id;
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

  const useRealtimeCollection = (
    collectionName: string,
    queryConstraints: QueryConstraint[] = []
  ) => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const authed = !!currentUser;
      const safeConstraints = enforceGuestPolicy(collectionName, authed, queryConstraints);

      const q =
        safeConstraints.length > 0
          ? query(collection(db, collectionName), ...safeConstraints)
          : query(collection(db, collectionName));

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const rows = snapshot.docs.map(d => normalizeDoc({ id: d.id, ...d.data() }));
          setData(rows);
          setLoading(false);
        },
        (error: any) => {
          console.error(`Error listening to ${collectionName}:`, error);
          setLoading(false);

          if (error?.code === 'failed-precondition') {
            toast.error('This query needs a Firestore composite index. Use the console link in devtools to create it.');
          } else if (error?.code === 'permission-denied') {
            if (!authed) {
              toast.error('Sign in to view private items (or filter to public content).');
            } else {
              toast.error('You do not have permission to read these documents.');
            }
          } else {
            toast.error('Failed to load data.');
          }
        }
      );

      return () => unsubscribe();
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
