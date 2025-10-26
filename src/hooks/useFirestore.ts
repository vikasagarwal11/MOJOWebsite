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
import { sanitizeFirebaseData } from '../utils/dataSanitizer';

/** Remove undefined so Firestore doesn’t throw on writes. */
function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Convert common timestamp fields (if present) to Date for UI convenience. */
function normalizeDoc(docData: any) {
  console.log('🔍 [useFirestore] normalizeDoc START:', { type: typeof docData, hasId: !!docData?.id });
  try {
    const sanitized = sanitizeFirebaseData(docData);
    console.log('✅ [useFirestore] normalizeDoc sanitized:', { keys: Object.keys(sanitized), id: sanitized.id });
    const out = { id: sanitized.id, ...sanitized };
    const tsFields = ['createdAt', 'updatedAt', 'date', 'validUntil', 'startAt'];
    for (const f of tsFields) {
      const v = (out as any)[f];
      (out as any)[f] = v?.toDate?.() ? v.toDate() : v instanceof Date ? v : v;
    }
    console.log('✅ [useFirestore] normalizeDoc SUCCESS:', { id: out.id, timestampFields: tsFields.filter(f => (out as any)[f]) });
    return out;
  } catch (error) {
    console.error('❌ [useFirestore] normalizeDoc ERROR:', error, { docData });
    throw error;
  }
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
    // For events, we need to be more flexible with field types
    // Check if user has provided specific constraints
    const hasPublicField = hasWhereEquals(out, 'public', true);
    const hasVisibilityField = hasWhereEquals(out, 'visibility', 'public');
    
    if (!hasPublicField && !hasVisibilityField) {
      // For guests, only show public events
      // Try visibility field first (newer events), then fallback to public field (legacy)
      // Note: Firestore doesn't support OR queries easily, so we'll use visibility as primary
      out.unshift(where('visibility', '==', 'public'));
    }
    
    // Add default ordering if none provided
    if (!hasAnyOrderBy(out) && !hasOrderByField(out, 'startAt')) {
      out.push(orderBy('startAt', 'asc'));
    }
  } else if (collectionName === 'media') {
    // Remove the isPublic filter - show all media
    if (!hasAnyOrderBy(out) && !hasOrderByField(out, 'createdAt')) {
      out.push(orderBy('createdAt', 'desc'));
    }
  }

  return out;
}

export const useFirestore = () => {
  const { currentUser } = useAuth();

  const getCollection = async (collectionName: string) => {
    console.log('🔍 [useFirestore] getCollection START:', collectionName);
    try {
      const snap = await getDocs(collection(db, collectionName));
      const result = snap.docs.map(d => normalizeDoc({ id: d.id, ...d.data() }));
      console.log('✅ [useFirestore] getCollection SUCCESS:', { collectionName, count: result.length });
      return result;
    } catch (error) {
      console.error('❌ [useFirestore] getCollection ERROR:', collectionName, error);
      toast.error(`Failed to load ${collectionName}`);
      return [];
    }
  };

  const addDocument = async (collectionName: string, data: any) => {
    console.log('🔍 [useFirestore] addDocument START:', collectionName, { dataKeys: Object.keys(data || {}) });
    try {
      const cleaned = stripUndefined({
        ...sanitizeFirebaseData(data),
        createdAt: data?.createdAt ?? serverTimestamp(),
        updatedAt: data?.updatedAt ?? serverTimestamp(),
      });
      console.log('🔍 [useFirestore] addDocument cleaned:', { cleanedKeys: Object.keys(cleaned) });
      const ref = await addDoc(collection(db, collectionName), cleaned);
      console.log('✅ [useFirestore] addDocument SUCCESS:', { collectionName, docId: ref.id });
      toast.success('Document created successfully');
      return ref.id;
    } catch (error) {
      console.error('❌ [useFirestore] addDocument ERROR:', collectionName, error);
      toast.error('Failed to create document');
      throw error;
    }
  };

  const updateDocument = async (collectionName: string, docId: string, data: any) => {
    try {
      const cleaned = stripUndefined({ ...sanitizeFirebaseData(data), updatedAt: serverTimestamp() });
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
      console.log('🔍 [useFirestore] useRealtimeCollection START:', { 
        collectionName, 
        constraintsCount: queryConstraints.length,
        isAuthed: !!currentUser,
        userId: currentUser?.id 
      });
      
      const authed = !!currentUser;
      let safeConstraints = enforceGuestPolicy(collectionName, authed, queryConstraints);
      
      console.log('🔍 [useFirestore] Guest policy enforced:', { 
        collectionName, 
        originalConstraints: queryConstraints.length,
        safeConstraints: safeConstraints.length 
      });
      
      // Special handling for events collection to ensure proper constraints
      if (collectionName === 'events' && authed) {
        console.log('🔍 [useFirestore] Processing events collection constraints:', { 
          collectionName, 
          userRole: currentUser?.role 
        });
        
        // Simplified constraint logic to prevent Firebase assertion failures
        const hasVisibilityConstraint = queryConstraints.some((c: any) => 
          c?.type === 'where' && 
          (c?.field?.toString?.() === 'visibility' || c?.field?.toString?.() === 'public')
        );
        const hasCreatorConstraint = queryConstraints.some((c: any) => 
          c?.type === 'where' && c?.field?.toString?.() === 'createdBy'
        );
        
        console.log('🔍 [useFirestore] Events constraint check:', { 
          hasVisibilityConstraint, 
          hasCreatorConstraint, 
          userRole: currentUser?.role 
        });
        
        // If no proper constraints, add simple ones based on user role
        if (!hasVisibilityConstraint && !hasCreatorConstraint) {
          if (currentUser?.role === 'admin') {
            console.log('🔍 [useFirestore] Admin user - no additional constraints');
            // Admin can see all events - no additional constraints needed
          } else {
            console.log('🔍 [useFirestore] Non-admin user - adding public visibility constraint');
            // For non-admin users, only show public events to prevent assertion failures
            safeConstraints = [
              ...safeConstraints,
              where('visibility', '==', 'public')
            ];
          }
        }
      }
      
      // Debug logging for events collection
      if (collectionName === 'events') {
        console.log('🔍 Events query constraints:', {
          isAuthed: authed,
          originalConstraints: queryConstraints,
          safeConstraints: safeConstraints,
          userRole: currentUser?.role,
          enforcedConstraints: collectionName === 'events' && authed
        });
      }

      // Build query safely to prevent Firebase assertion failures
      console.log('🔍 [useFirestore] Building query:', { 
        collectionName, 
        safeConstraintsCount: safeConstraints.length,
        constraints: safeConstraints.map(c => ({ type: c.type, field: c.field?.toString?.() || c._field?.toString?.() }))
      });
      
      let q;
      try {
        if (safeConstraints.length > 0) {
          console.log('🔍 [useFirestore] Validating constraints...');
          
          // Validate constraints before building query
          const validConstraints = safeConstraints.filter(constraint => {
            console.log('🔍 [useFirestore] Validating constraint:', { 
              type: constraint.type, 
              field: constraint.field?.toString?.() || constraint._field?.toString?.() 
            });
            
            try {
              // Basic validation - ensure constraint has required properties
              if (!constraint || typeof constraint !== 'object') {
                console.warn('❌ [useFirestore] Constraint not an object:', constraint);
                return false;
              }
              
              // For where constraints, ensure field and value are valid
              if (constraint.type === 'where') {
                const field = constraint.field?.toString?.() || constraint._field?.toString?.();
                const value = constraint.value || constraint._value;
                const isValid = field && value !== undefined && value !== null;
                console.log('🔍 [useFirestore] Where constraint validation:', { field, value, isValid });
                return isValid;
              }
              
              // For orderBy constraints, ensure field is valid
              if (constraint.type === 'orderBy') {
                const field = constraint.field?.toString?.() || constraint._field?.toString?.();
                const isValid = field && field.length > 0;
                console.log('🔍 [useFirestore] OrderBy constraint validation:', { field, isValid });
                return isValid;
              }
              
              // For limit constraints, ensure value is a number
              if (constraint.type === 'limit') {
                const limit = constraint.limit || constraint._limit;
                const isValid = typeof limit === 'number' && limit > 0;
                console.log('🔍 [useFirestore] Limit constraint validation:', { limit, isValid });
                return isValid;
              }
              
              console.log('✅ [useFirestore] Constraint valid:', constraint.type);
              return true;
            } catch (error) {
              console.warn('❌ [useFirestore] Invalid constraint filtered out:', constraint, error);
              return false;
            }
          });
          
          console.log('🔍 [useFirestore] Constraint validation complete:', { 
            original: safeConstraints.length, 
            valid: validConstraints.length 
          });
          
          // Limit the number of constraints to prevent complex queries
          const limitedConstraints = validConstraints.slice(0, 5);
          console.log('🔍 [useFirestore] Limited constraints:', { 
            count: limitedConstraints.length,
            constraints: limitedConstraints.map(c => ({ type: c.type, field: c.field?.toString?.() || c._field?.toString?.() }))
          });
          
          q = query(collection(db, collectionName), ...limitedConstraints);
          console.log('✅ [useFirestore] Query built with constraints:', collectionName);
        } else {
          q = query(collection(db, collectionName));
          console.log('✅ [useFirestore] Query built without constraints:', collectionName);
        }
      } catch (error) {
        console.error('❌ [useFirestore] Error building Firestore query:', error, { collectionName });
        // Fallback to simple query without constraints
        q = query(collection(db, collectionName));
        console.log('🔄 [useFirestore] Using fallback query:', collectionName);
      }

      console.log('🔍 [useFirestore] Setting up onSnapshot listener:', collectionName);
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          console.log('✅ [useFirestore] Snapshot received:', { 
            collectionName, 
            docCount: snapshot.docs.length,
            hasChanges: !snapshot.metadata.fromCache 
          });
          
          const rows = snapshot.docs.map(d => normalizeDoc({ id: d.id, ...d.data() }));
          console.log('✅ [useFirestore] Documents processed:', { 
            collectionName, 
            processedCount: rows.length 
          });
          
          setData(rows);
          setLoading(false);
        },
        (error: any) => {
          console.error('❌ [useFirestore] Snapshot error:', { 
            collectionName, 
            error: error.message,
            code: error.code,
            stack: error.stack 
          });
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

      console.log('✅ [useFirestore] onSnapshot listener set up:', collectionName);
      return () => {
        console.log('🔄 [useFirestore] Cleaning up listener:', collectionName);
        unsubscribe();
      };
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
