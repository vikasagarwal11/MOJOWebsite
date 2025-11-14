import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { embedText } from './utils/embeddings';
import { ensureAdmin } from './utils/admin';

const db = getFirestore();

type NormalizedStatus = 'pending' | 'processing' | 'ready' | 'error' | 'skipped' | 'unknown';

function normalizeEmbeddingStatus(raw: unknown): NormalizedStatus {
  if (typeof raw === 'string') {
    const value = raw.toLowerCase();
    if (value === 'pending' || value === 'processing' || value === 'ready' || value === 'error' || value === 'skipped') {
      return value;
    }
    if (value === 'processed' || value === 'complete' || value === 'completed') {
      return 'ready';
    }
    return 'unknown';
  }

  if (raw && typeof raw === 'object') {
    const object = raw as Record<string, unknown>;
    const stateValue = object.state ?? object.status ?? object.result;
    if (typeof stateValue === 'string') {
      const value = stateValue.toLowerCase();
      if (value === 'pending' || value === 'processing' || value === 'ready' || value === 'error') {
        return value;
      }
      if (value === 'processed' || value === 'complete' || value === 'completed') {
        return 'ready';
      }
    }
  }

  return 'pending';
}

function isFirestoreVector(value: unknown): boolean {
  if (!value) return false;
  if (Array.isArray(value)) return false;
  if (typeof value === 'object') {
    const maybeVector = value as Record<string, unknown>;
    if (typeof (maybeVector as any).toArray === 'function' || typeof (maybeVector as any).toProto === 'function') {
      return true;
    }
  }
  return false;
}

function isVectorReady(data: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!data) return false;
  const status = normalizeEmbeddingStatus(data.embeddingStatus);
  if (status !== 'ready') return false;
  const embedding = data.embedding;
  return isFirestoreVector(embedding);
}

function needsEmbedding(data: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!data) return false;
  const embedding = data.embedding;
  if (!isFirestoreVector(embedding)) {
    return true;
  }
  const status = normalizeEmbeddingStatus(data.embeddingStatus);
  return status === 'pending' || status === 'error' || status === 'processing' || status === 'unknown';
}

async function processChunkDoc(
  ref: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.DocumentData
): Promise<'ready' | 'skipped' | 'error'> {
  const text = (data.text as string)?.trim();
  if (!text) {
    await ref.update({
      embeddingStatus: 'skipped',
      embeddingError: 'No text to embed',
      embeddingUpdatedAt: FieldValue.serverTimestamp(),
    });
    return 'skipped';
  }

  try {
    const embedding = await embedText(text);
    await ref.update({
      embedding: FieldValue.vector(embedding),
      embeddingStatus: 'ready',
      embeddingProvider: 'gemini-text-embedding-004',
      embeddingUpdatedAt: FieldValue.serverTimestamp(),
      embeddingError: FieldValue.delete(),
    });
    return 'ready';
  } catch (error: any) {
    console.error('[kbEmbeddingWorker] Failed to embed chunk', ref.path, error);
    await ref.update({
      embeddingStatus: 'error',
      embeddingError: error?.message || 'Unknown embedding error',
      embeddingUpdatedAt: FieldValue.serverTimestamp(),
    });
    return 'error';
  }
}

export const ensureChunkEmbedding = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'kb_chunks/{chunkId}',
    retry: false,
  },
  async event => {
    const after = event.data?.after;
    if (!after?.exists) {
      return;
    }

    const data = after.data();
    if (!data) {
      return;
    }
    if (isVectorReady(data)) {
      return;
    }

    const status = normalizeEmbeddingStatus(data.embeddingStatus);
    if (status === 'processing') {
      return;
    }

    await after.ref.update({
      embeddingStatus: 'processing',
      embeddingUpdatedAt: FieldValue.serverTimestamp(),
      embeddingError: FieldValue.delete(),
    });
    await processChunkDoc(after.ref, data);
  }
);

export const backfillKnowledgeBaseEmbeddings = onCall(
  { region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' },
  async (request: CallableRequest) => {
    await ensureAdmin(request.auth);

    const limit = Math.min(Number(request.data?.limit) || 50, 200);

    const snapshot = await db.collection('kb_chunks').limit(limit * 5).get();
    if (snapshot.empty) {
      return { processed: 0, totalChecked: 0, scanned: 0, message: 'No knowledge chunks found.' };
    }

    const candidates = snapshot.docs.filter(doc => needsEmbedding(doc.data())).slice(0, limit);

    if (!candidates.length) {
      return {
        processed: 0,
        totalChecked: 0,
        scanned: snapshot.docs.length,
        message: 'All chunks already have embeddings.',
      };
    }

    let processed = 0;
    for (const doc of candidates) {
      const data = doc.data();
      const status = await processChunkDoc(doc.ref, data);
      if (status === 'ready') {
        processed += 1;
      }
    }

    return {
      processed,
      totalChecked: candidates.length,
      scanned: snapshot.docs.length,
      message: `Processed ${processed} of ${candidates.length} chunks (scanned ${snapshot.docs.length}).`,
    };
  }
);

// Lightweight status overview for admin console
export const getKnowledgeEmbeddingStatus = onCall(
  { region: 'us-central1', timeoutSeconds: 60, memory: '256MiB' },
  async (request: CallableRequest) => {
    await ensureAdmin(request.auth);
    const c = db.collection('kb_chunks');
    const [readySnap, pendingSnap, processingSnap, errorSnap, totalChunksSnap] = await Promise.all([
      c.where('embeddingStatus', '==', 'ready').count().get(),
      c.where('embeddingStatus', '==', 'pending').count().get(),
      c.where('embeddingStatus', '==', 'processing').count().get(),
      c.where('embeddingStatus', '==', 'error').count().get(),
      c.count().get(),
    ]);
    const totalSourcesSnap = await db.collection('kb_sources').count().get();

    // Return a few recent errors to help diagnose
    const recentErrorsSnap = await c
      .where('embeddingStatus', '==', 'error')
      .orderBy('embeddingUpdatedAt', 'desc')
      .limit(5)
      .get();

    const recentErrors = recentErrorsSnap.docs.map(d => ({
      id: d.id,
      sourceKey: d.get('sourceKey') || null,
      title: d.get('title') || null,
      error: d.get('embeddingError') || null,
      updatedAt: d.get('embeddingUpdatedAt') || null,
    }));

    return {
      counts: {
        ready: readySnap.data().count || 0,
        pending: pendingSnap.data().count || 0,
        processing: processingSnap.data().count || 0,
        error: errorSnap.data().count || 0,
        chunks: totalChunksSnap.data().count || 0,
        sources: totalSourcesSnap.data().count || 0,
      },
      recentErrors,
    };
  }
);

// Retry failed (or pending) chunk embeddings in-place
export const retryFailedKnowledgeEmbeddings = onCall(
  { region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' },
  async (request: CallableRequest) => {
    await ensureAdmin(request.auth);
    const statuses = Array.isArray(request.data?.statuses)
      ? (request.data.statuses as string[]).filter(s => ['error', 'pending'].includes(String(s)))
      : ['error'];
    const limit = Math.min(Number(request.data?.limit) || 50, 200);

    let q = db.collection('kb_chunks') as FirebaseFirestore.Query;
    if (statuses.length === 1) {
      q = q.where('embeddingStatus', '==', statuses[0]);
    } else {
      q = q.where('embeddingStatus', 'in', statuses.slice(0, 10));
    }
    const snap = await q.limit(limit * 3).get();
    if (snap.empty) {
      return { processed: 0, scanned: 0, checked: 0, message: 'No chunks to retry.' };
    }
    const candidates = snap.docs.filter(d => needsEmbedding(d.data())).slice(0, limit);

    let processed = 0;
    let errors = 0;
    for (const doc of candidates) {
      try {
        await doc.ref.update({
          embeddingStatus: 'processing',
          embeddingUpdatedAt: FieldValue.serverTimestamp(),
          embeddingError: FieldValue.delete(),
        });
        const result = await processChunkDoc(doc.ref, doc.data());
        if (result === 'ready') processed += 1;
      } catch (e) {
        errors += 1;
      }
    }
    return {
      processed,
      errors,
      scanned: snap.docs.length,
      checked: candidates.length,
      message: `Retried ${processed} of ${candidates.length} chunks (scanned ${snap.docs.length}).`,
    };
  }
);

