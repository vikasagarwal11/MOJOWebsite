import { collection, query, orderBy, where, getDocs, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface KBGap {
  id: string;
  question: string;
  sessionId: string;
  userId: string | null;
  detectedAt: Timestamp | Date;
  kbChunksFound: number;
  bestDistance: number | null;
  status: 'pending' | 'resolved' | 'wont_fix';
  resolvedAt?: Timestamp | Date;
  resolvedBy?: string;
  notes?: string;
}

export type KBGapStatus = 'pending' | 'resolved' | 'wont_fix';

/**
 * Fetch all KB gaps, optionally filtered by status
 */
export async function getKBGaps(status?: KBGapStatus): Promise<KBGap[]> {
  try {
    let gapsQuery = query(
      collection(db, 'kb_gaps'),
      orderBy('detectedAt', 'desc')
    );

    if (status) {
      gapsQuery = query(gapsQuery, where('status', '==', status));
    }

    const snapshot = await getDocs(gapsQuery);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        question: data.question || '',
        sessionId: data.sessionId || '',
        userId: data.userId || null,
        detectedAt: data.detectedAt?.toDate?.() || new Date(),
        kbChunksFound: data.kbChunksFound || 0,
        bestDistance: data.bestDistance ?? null,
        status: (data.status || 'pending') as KBGapStatus,
        resolvedAt: data.resolvedAt?.toDate?.() || undefined,
        resolvedBy: data.resolvedBy || undefined,
        notes: data.notes || undefined,
      };
    });
  } catch (error: any) {
    console.error('[kbGapsService] Error fetching KB gaps:', error);
    throw error;
  }
}

/**
 * Update KB gap status
 */
export async function updateKBGapStatus(
  gapId: string,
  status: KBGapStatus,
  userId: string,
  notes?: string
): Promise<void> {
  try {
    const gapRef = doc(db, 'kb_gaps', gapId);
    await updateDoc(gapRef, {
      status,
      resolvedBy: userId,
      resolvedAt: serverTimestamp(),
      notes: notes || undefined,
      updatedAt: serverTimestamp(),
    });
  } catch (error: any) {
    console.error('[kbGapsService] Error updating KB gap:', error);
    throw error;
  }
}

/**
 * Get KB gap statistics
 */
export async function getKBGapStats(): Promise<{
  pending: number;
  resolved: number;
  wont_fix: number;
  total: number;
}> {
  try {
    const [pendingSnap, resolvedSnap, wontFixSnap, totalSnap] = await Promise.all([
      getDocs(query(collection(db, 'kb_gaps'), where('status', '==', 'pending'))),
      getDocs(query(collection(db, 'kb_gaps'), where('status', '==', 'resolved'))),
      getDocs(query(collection(db, 'kb_gaps'), where('status', '==', 'wont_fix'))),
      getDocs(collection(db, 'kb_gaps')),
    ]);

    return {
      pending: pendingSnap.size,
      resolved: resolvedSnap.size,
      wont_fix: wontFixSnap.size,
      total: totalSnap.size,
    };
  } catch (error: any) {
    console.error('[kbGapsService] Error fetching KB gap stats:', error);
    return { pending: 0, resolved: 0, wont_fix: 0, total: 0 };
  }
}

