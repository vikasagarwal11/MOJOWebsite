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

const ENABLE_FIRESTORE_DEBUG = import.meta.env.DEV && false;
const debugLog = (...args: any[]) => {
  if (ENABLE_FIRESTORE_DEBUG) {
    console.log(...args);
  }
};
const debugWarn = (...args: any[]) => {
  if (ENABLE_FIRESTORE_DEBUG) {
    console.warn(...args);
  }
};

/** Remove undefined so Firestore doesn’t throw on writes. */
function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Reconstruct nested objects from flattened dotted keys.
 * Firestore updates using dot notation (e.g., 'sources.hls') result in flattened keys
 * that need to be reconstructed into nested objects.
 */
function reconstructNestedObjects(data: any): any {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }

  const reconstructed: any = { ...data };
  const keysToDelete: string[] = [];

  // Reconstruct sources object from flattened keys
  const hls = data['sources.hls'];
  const hlsMaster = data['sources.hlsMaster'];
  if (!data.sources && (hls || hlsMaster)) {
    reconstructed.sources = {};
    if (hls) {
      reconstructed.sources.hls = hls;
      keysToDelete.push('sources.hls');
    }
    if (hlsMaster) {
      reconstructed.sources.hlsMaster = hlsMaster;
      keysToDelete.push('sources.hlsMaster');
    }
    debugLog('🔧 [normalizeDoc] Reconstructed sources object from flattened keys:', {
      hasHls: !!hls,
      hasHlsMaster: !!hlsMaster,
      reconstructedSources: reconstructed.sources
    });
  }

  // Reconstruct qualityLevels object from flattened keys (e.g., 'qualityLevels.720p')
  const qualityLevelKeys = Object.keys(data).filter(key => key.startsWith('qualityLevels.'));
  if (qualityLevelKeys.length > 0 && !data.qualityLevels) {
    reconstructed.qualityLevels = {};
    for (const key of qualityLevelKeys) {
      const qualityName = key.replace('qualityLevels.', '');
      reconstructed.qualityLevels[qualityName] = data[key];
      keysToDelete.push(key);
    }
    debugLog('🔧 [normalizeDoc] Reconstructed qualityLevels object from flattened keys:', {
      qualityCount: qualityLevelKeys.length,
      qualities: Object.keys(reconstructed.qualityLevels)
    });
  }

  // Delete flattened keys to prevent leaks
  for (const key of keysToDelete) {
    delete reconstructed[key];
  }

  return reconstructed;
}

/** Convert common timestamp fields (if present) to Date for UI convenience. */
function normalizeDoc(docData: any) {
  try {
    const sanitized = sanitizeFirebaseData(docData);
    
    // Reconstruct nested objects from flattened dotted keys (fix for Firestore dot notation)
    const reconstructed = reconstructNestedObjects(sanitized);
    
    const out = { id: reconstructed.id, ...reconstructed };
    const tsFields = ['createdAt', 'updatedAt', 'date', 'validUntil', 'startAt', 'endAt', 'joinedAt'];
    for (const f of tsFields) {
      const v = (out as any)[f];
      (out as any)[f] = v?.toDate?.() ? v.toDate() : v instanceof Date ? v : v;
    }
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
 * 
 * Non-approved users (pending/rejected) are treated like logged-out users and only see public content
 */
function enforceGuestPolicy(
  collectionName: string,
  isApproved: boolean,
  userConstraints: QueryConstraint[]
): QueryConstraint[] {
  // Only approved users bypass guest filtering - pending/rejected users are treated like guests
  if (isApproved) return userConstraints;

  const out = [...userConstraints];

  if (collectionName === 'posts') {
    if (!hasWhereEquals(out, 'isPublic', true)) out.unshift(where('isPublic', '==', true));
    // Filter out pending posts (only show approved or no moderation status)
    // Note: Admins and authors can see their own pending posts via Firestore rules
    if (!hasWhereEquals(out, 'moderationStatus', 'approved') && 
        !hasWhereEquals(out, 'moderationStatus', null)) {
      // Add filter to only show approved posts or posts without moderation status
      // We'll handle this in the client-side filter since Firestore doesn't support OR queries easily
    }
    if (!hasAnyOrderBy(out) && !hasOrderByField(out, 'createdAt')) {
      out.push(orderBy('createdAt', 'desc'));
    }
  } else if (collectionName === 'events') {
    // For events, we need to be more flexible with field types
    // Check if user has provided specific constraints
    const hasPublicField = hasWhereEquals(out, 'public', true);
    const hasVisibilityField = hasWhereEquals(out, 'visibility', 'public') || hasWhereEquals(out, 'visibility', 'members');
    const hasVisibilityIn = out.some((c: any) => 
      c?.type === 'where' && 
      c?.field?.toString?.() === 'visibility' && 
      c?.opStr === 'in'
    );
    
    if (!hasPublicField && !hasVisibilityField && !hasVisibilityIn) {
      // For guests, show both public and members-only events (members-only events are visible to everyone)
      // Members-only events are visible to everyone, but only members can RSVP
      out.unshift(where('visibility', 'in', ['public', 'members']));
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
    debugLog('🔍 [useFirestore] getCollection START:', collectionName);
    try {
      const snap = await getDocs(collection(db, collectionName));
      const result = snap.docs.map(d => normalizeDoc({ id: d.id, ...d.data() }));
      debugLog('✅ [useFirestore] getCollection SUCCESS:', { collectionName, count: result.length });
      return result;
    } catch (error) {
      console.error('❌ [useFirestore] getCollection ERROR:', collectionName, error);
      toast.error(`Failed to load ${collectionName}`);
      return [];
    }
  };

  const addDocument = async (collectionName: string, data: any) => {
    debugLog('🔍 [useFirestore] addDocument START:', collectionName, { dataKeys: Object.keys(data || {}) });
    try {
      const cleaned = stripUndefined({
        ...sanitizeFirebaseData(data),
        createdAt: data?.createdAt ?? serverTimestamp(),
        updatedAt: data?.updatedAt ?? serverTimestamp(),
      });
      debugLog('🔍 [useFirestore] addDocument cleaned:', { cleanedKeys: Object.keys(cleaned) });
      const ref = await addDoc(collection(db, collectionName), cleaned);
      debugLog('✅ [useFirestore] addDocument SUCCESS:', { collectionName, docId: ref.id });
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

  const useRealtimeDoc = (docPath: string | undefined) => {
    const [data, setData] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
      if (!docPath) {
        setData(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      let unsubscribe = () => {};
      try {
        const ref = doc(db, docPath);
        unsubscribe = onSnapshot(
          ref,
          (snapshot) => {
            if (!snapshot.exists()) {
              setData(null);
            } else {
              const normalized = normalizeDoc({ id: snapshot.id, ...snapshot.data() });
              setData(normalized);
            }
            setLoading(false);
          },
          (err: any) => {
            console.error('❌ [useFirestore] useRealtimeDoc error:', { docPath, err });
            setError(err);
            setLoading(false);
            if (err?.code === 'permission-denied') {
              toast.error('You do not have permission to view this item.');
            } else {
              toast.error('Failed to load item.');
            }
          }
        );
      } catch (err: any) {
        console.error('❌ [useFirestore] useRealtimeDoc setup failed:', { docPath, err });
        setError(err);
        setLoading(false);
      }

      return () => {
        try {
          unsubscribe();
        } catch (cleanupError) {
          console.warn('⚠️ [useFirestore] Failed to cleanup doc listener:', cleanupError);
        }
      };
    }, [docPath]);

    return { data, loading, error };
  };

  const useRealtimeCollection = (
    collectionName: string,
    queryConstraints: QueryConstraint[] = []
  ) => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      if (!collectionName) {
        setData([]);
        setLoading(false);
        return;
      }

      debugLog('🔍 [useFirestore] useRealtimeCollection START:', { 
        collectionName, 
        constraintsCount: queryConstraints.length,
        isAuthed: !!currentUser,
        userId: currentUser?.id 
      });
      
      // Check if user is approved (approved users or legacy users without status field)
      const isApproved = currentUser && (currentUser.status === 'approved' || !currentUser.status);
      let safeConstraints = enforceGuestPolicy(collectionName, !!isApproved, queryConstraints);
      
      debugLog('🔍 [useFirestore] Guest policy enforced:', { 
        collectionName, 
        originalConstraints: queryConstraints.length,
        safeConstraints: safeConstraints.length 
      });
      
      // Special handling for events collection to ensure proper constraints
      // Only for approved users - non-approved users are already filtered by enforceGuestPolicy
      if (collectionName === 'events' && isApproved) {
        debugLog('🔍 [useFirestore] Processing events collection constraints:', { 
          collectionName, 
          userRole: currentUser?.role,
          isApproved 
        });
        
        // Simplified constraint logic to prevent Firebase assertion failures
        const hasVisibilityConstraint = queryConstraints.some((c: any) => 
          c?.type === 'where' && 
          (c?.field?.toString?.() === 'visibility' || c?.field?.toString?.() === 'public')
        );
        const hasCreatorConstraint = queryConstraints.some((c: any) => 
          c?.type === 'where' && c?.field?.toString?.() === 'createdBy'
        );
        
        debugLog('🔍 [useFirestore] Events constraint check:', { 
          hasVisibilityConstraint, 
          hasCreatorConstraint, 
          userRole: currentUser?.role 
        });
        
        // If no proper constraints, add simple ones based on user role
        if (!hasVisibilityConstraint && !hasCreatorConstraint) {
          if (currentUser?.role === 'admin') {
            debugLog('🔍 [useFirestore] Admin user - no additional constraints');
            // Admin can see all events - no additional constraints needed
          } else {
            debugLog('🔍 [useFirestore] Non-admin approved user - allowing public/members events');
            // Approved non-admin users can see public and members events
            // The enforceGuestPolicy already handled this, so no additional constraints needed
          }
        }
      }
      
      // Debug logging for events collection
      if (collectionName === 'events') {
        debugLog('🔍 Events query constraints:', {
          isAuthed: !!currentUser,
          isApproved: isApproved,
          originalConstraints: queryConstraints,
          safeConstraints: safeConstraints,
          userRole: currentUser?.role,
          enforcedConstraints: collectionName === 'events' && !!currentUser
        });
      }

      // Build query safely to prevent Firebase assertion failures
      debugLog('🔍 [useFirestore] Building query:', { 
        collectionName, 
        safeConstraintsCount: safeConstraints.length,
        constraints: safeConstraints.map(c => ({ type: c.type, field: c.field?.toString?.() || c._field?.toString?.() }))
      });
      
      let q;
      try {
        if (safeConstraints.length > 0) {
          debugLog('🔍 [useFirestore] Validating constraints...');
          
          // Validate constraints before building query
          const validConstraints = safeConstraints.filter(constraint => {
            debugLog('🔍 [useFirestore] Validating constraint:', { 
              type: constraint.type, 
              field: constraint.field?.toString?.() || constraint._field?.toString?.() 
            });
            
            try {
              // Basic validation - ensure constraint has required properties
              if (!constraint || typeof constraint !== 'object') {
                debugWarn('❌ [useFirestore] Constraint not an object:', constraint);
                return false;
              }
              
              // For where constraints, ensure field and value are valid
              if (constraint.type === 'where') {
                const field = constraint.field?.toString?.() || constraint._field?.toString?.();
                const value = constraint.value || constraint._value;
                const isValid = field && value !== undefined && value !== null;
                debugLog('🔍 [useFirestore] Where constraint validation:', { field, value, isValid });
                return isValid;
              }
              
              // For orderBy constraints, ensure field is valid
              if (constraint.type === 'orderBy') {
                const field = constraint.field?.toString?.() || constraint._field?.toString?.();
                const isValid = field && field.length > 0;
                debugLog('🔍 [useFirestore] OrderBy constraint validation:', { field, isValid });
                return isValid;
              }
              
              // For limit constraints, ensure value is a number
              if (constraint.type === 'limit') {
                const limit = constraint.limit || constraint._limit;
                const isValid = typeof limit === 'number' && limit > 0;
                debugLog('🔍 [useFirestore] Limit constraint validation:', { limit, isValid });
                return isValid;
              }
              
              debugLog('✅ [useFirestore] Constraint valid:', constraint.type);
              return true;
            } catch (error) {
              debugWarn('❌ [useFirestore] Invalid constraint filtered out:', constraint, error);
              return false;
            }
          });
          
          debugLog('🔍 [useFirestore] Constraint validation complete:', { 
            original: safeConstraints.length, 
            valid: validConstraints.length 
          });
          
          // Limit the number of constraints to prevent complex queries
          const limitedConstraints = validConstraints.slice(0, 5);
          debugLog('🔍 [useFirestore] Limited constraints:', { 
            count: limitedConstraints.length,
            constraints: limitedConstraints.map(c => ({ type: c.type, field: c.field?.toString?.() || c._field?.toString?.() }))
          });
          
          q = query(collection(db, collectionName), ...limitedConstraints);
          debugLog('✅ [useFirestore] Query built with constraints:', collectionName);
        } else {
          q = query(collection(db, collectionName));
          debugLog('✅ [useFirestore] Query built without constraints:', collectionName);
        }
      } catch (error) {
        console.error('❌ [useFirestore] Error building Firestore query:', error, { collectionName });
        // Fallback to simple query without constraints
        q = query(collection(db, collectionName));
        debugLog('🔄 [useFirestore] Using fallback query:', collectionName);
      }

      debugLog('🔍 [useFirestore] Setting up onSnapshot listener:', collectionName);
      
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          let rows = snapshot.docs.map(d => normalizeDoc({ id: d.id, ...d.data() }));
          
          // Filter out pending content (except for admins and authors)
          const isAdmin = currentUser?.role === 'admin';
          if (!isAdmin && (collectionName === 'posts' || collectionName === 'media')) {
            rows = rows.filter((doc: any) => {
              // Show if no moderation status (legacy content) or approved
              if (!doc.moderationStatus || doc.moderationStatus === 'approved') {
                return true;
              }
              // Show if user is the author
              if (currentUser) {
                if (collectionName === 'posts' && doc.authorId === currentUser.id) {
                  return true;
                }
                if (collectionName === 'media' && doc.uploadedBy === currentUser.id) {
                  return true;
                }
              }
              // Hide pending/rejected content from others
              return false;
            });
          }
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
            if (!currentUser) {
              toast.error('Sign in to view private items (or filter to public content).');
            } else {
              toast.error('You do not have permission to read these documents.');
            }
          } else {
            toast.error('Failed to load data.');
          }
        }
      );

      debugLog('✅ [useFirestore] onSnapshot listener set up:', collectionName);
      return () => {
        debugLog('🔄 [useFirestore] Cleaning up listener:', collectionName);
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
    useRealtimeDoc,
    useRealtimeCollection,
  };
};
