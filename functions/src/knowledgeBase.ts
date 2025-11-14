import { onDocumentWritten, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

const db = getFirestore();

type VisibilityLevel = 'public' | 'members' | 'private';

interface ChunkSource {
  sourceId: string;
  sourceType: string;
  title: string;
  summary?: string;
  body?: string;
  tags?: string[];
  url?: string;
  visibility: VisibilityLevel;
  updatedAt?: Date;
  metadata?: Record<string, unknown>;
}

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 200;

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function chunkText(rawText: string): string[] {
  const text = normalizeWhitespace(rawText);
  if (!text) return [];

  const chunks: string[] = [];
  let start = 0;
  const step = Math.max(1, CHUNK_SIZE - CHUNK_OVERLAP);

  while (start < text.length) {
    const end = Math.min(text.length, start + CHUNK_SIZE);
    chunks.push(text.slice(start, end));
    start += step;
  }

  return chunks;
}

function hashContent(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function removeExistingChunks(sourceKey: string) {
  const sourceRef = db.collection('kb_sources').doc(sourceKey);
  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) return;

  const data = sourceSnap.data() ?? {};
  const chunkIds: string[] = Array.isArray(data.chunkIds) ? data.chunkIds : [];
  const batch = db.batch();

  for (const chunkId of chunkIds) {
    batch.delete(db.collection('kb_chunks').doc(chunkId));
  }

  batch.delete(sourceRef);
  await batch.commit();
}

async function upsertChunks(sourceKey: string, payload: ChunkSource) {
  const { title, summary = '', body = '', visibility, sourceId, sourceType } = payload;
  const baseText = [title, summary, body].filter(Boolean).join(' — ');
  if (!baseText.trim()) {
    await removeExistingChunks(sourceKey);
    return;
  }

  const contentHash = hashContent(baseText);
  const sourceRef = db.collection('kb_sources').doc(sourceKey);
  const sourceSnap = await sourceRef.get();

  if (sourceSnap.exists) {
    const previousHash = sourceSnap.get('contentHash');
    if (previousHash === contentHash) {
      const existingChunk = await db.collection('kb_chunks').where('sourceKey', '==', sourceKey).limit(1).get();
      if (!existingChunk.empty) {
        return;
      }
      await removeExistingChunks(sourceKey);
    } else {
      await removeExistingChunks(sourceKey);
    }
  }

  const textChunks = chunkText(baseText);
  if (!textChunks.length) return;

  const batch = db.batch();
  const chunkIds: string[] = [];
  const now = FieldValue.serverTimestamp();

  textChunks.forEach((text, index) => {
    const chunkRef = db.collection('kb_chunks').doc();
    chunkIds.push(chunkRef.id);
    batch.set(chunkRef, {
      text,
      sourceId,
      sourceType,
      sourceKey,
      title,
      summary,
      url: payload.url ?? null,
      tags: payload.tags ?? [],
      visibility,
      chunkIndex: index,
      createdAt: now,
      updatedAt: now,
      embeddingStatus: 'pending',
      metadata: payload.metadata ?? {},
    });
  });

  batch.set(sourceRef, {
    sourceId,
    sourceType,
    visibility,
    title,
    summary,
    body,
    url: payload.url ?? null,
    contentHash,
    chunkIds,
    updatedAt: now,
    tags: payload.tags ?? [],
    metadata: payload.metadata ?? {},
  });

  await batch.commit();
}

function getPostVisibility(data: any): VisibilityLevel {
  if (data?.isPublic === true) return 'public';
  return 'members';
}

function getEventVisibility(data: any): VisibilityLevel {
  const visibility = (data?.visibility || '').toString().toLowerCase();
  if (visibility === 'public') return 'public';
  if (visibility === 'private') return 'private';
  return 'members';
}

export const syncPostToKnowledgeBase = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'posts/{postId}',
    retry: false,
  },
  async event => {
    const { postId } = event.params;
    const sourceKey = `post_${postId}`;

    if (!event.data) {
      await removeExistingChunks(sourceKey);
      return;
    }

    if (!event.data.after.exists) {
      await removeExistingChunks(sourceKey);
      return;
    }

    const data = event.data.after.data() || {};
    const title = data.title || 'Community Post';
    const body = data.content || '';
    const author = data.authorName || 'Member';
    const visibility = getPostVisibility(data);

    await upsertChunks(sourceKey, {
      sourceId: postId,
      sourceType: 'post',
      title,
      body,
      visibility,
      summary: `Community post from ${author}`,
      tags: ['community', 'post'],
      url: `/posts#${postId}`,
      updatedAt: data.updatedAt?.toDate?.() ?? undefined,
      metadata: {
        authorId: data.authorId ?? null,
        authorName: author ?? null,
      },
    });
  }
);

export const syncEventToKnowledgeBase = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'events/{eventId}',
    retry: false,
  },
  async event => {
    const { eventId } = event.params;
    const sourceKey = `event_${eventId}`;

    if (!event.data) {
      await removeExistingChunks(sourceKey);
      return;
    }

    if (!event.data.after.exists) {
      await removeExistingChunks(sourceKey);
      return;
    }

    const data = event.data.after.data() || {};
    const visibility = getEventVisibility(data);
    const title = data.title || 'Community Event';
    const description = data.description || '';
    const location = data.venueName || data.location || 'See event details';
    const startAt = data.startAt?.toDate?.()?.toISOString?.() ?? data.startAt ?? '';
    const summaryLines = [
      location ? `Location: ${location}` : '',
      startAt ? `Starts: ${startAt}` : '',
      Array.isArray(data.tags) ? `Tags: ${data.tags.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    await upsertChunks(sourceKey, {
      sourceId: eventId,
      sourceType: 'event',
      title,
      summary: summaryLines,
      body: description,
      visibility,
      tags: Array.isArray(data.tags) ? data.tags : ['event'],
      url: `/events/${eventId}`,
      updatedAt: data.updatedAt?.toDate?.() ?? undefined,
      metadata: {
        startAt,
        endAt: data.endAt?.toDate?.()?.toISOString?.() ?? data.endAt ?? null,
      },
    });
  }
);

export const syncChallengeToKnowledgeBase = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'challenges/{challengeId}',
    retry: false,
  },
  async event => {
    const { challengeId } = event.params;
    const sourceKey = `challenge_${challengeId}`;

    if (!event.data) {
      await removeExistingChunks(sourceKey);
      return;
    }

    if (!event.data.after.exists) {
      await removeExistingChunks(sourceKey);
      return;
    }

    const data = event.data.after.data() || {};
    const visibility: VisibilityLevel = data.visibility === 'public' ? 'public' : 'members';
    const target = data.target ? `${data.target} target` : '';
    const goal = data.goal ? `Goal: ${data.goal}` : '';
    const summaryParts = [goal, target].filter(Boolean).join(' • ');

    const descriptionParts = [
      data.description || '',
      data.rules || '',
      data.notes || '',
    ]
      .filter(Boolean)
      .join('\n\n');

    await upsertChunks(sourceKey, {
      sourceId: challengeId,
      sourceType: 'challenge',
      title: data.title || 'Fitness Challenge',
      summary: summaryParts,
      body: descriptionParts,
      visibility,
      url: `/challenges/${challengeId}`,
      tags: ['challenge'],
      updatedAt: data.updatedAt?.toDate?.() ?? undefined,
    });
  }
);

export const removeKnowledgeChunksOnDelete = onDocumentDeleted(
  {
    region: 'us-central1',
    document: 'kb_sources/{sourceId}',
    retry: false,
  },
  async event => {
    if (!event.data?.id) return;
    const chunkIds: string[] = Array.isArray(event.data.get('chunkIds')) ? event.data.get('chunkIds') : [];
    const batch = db.batch();
    for (const chunkId of chunkIds) {
      batch.delete(db.collection('kb_chunks').doc(chunkId));
    }
    batch.delete(event.data.ref);
    await batch.commit();
  }
);

export type KnowledgeVisibilityLevel = VisibilityLevel;
export type KnowledgeChunkSource = ChunkSource;

export async function manualUpsertKnowledgeSource(sourceKey: string, payload: ChunkSource) {
  await upsertChunks(sourceKey, payload);
}

export async function manualDeleteKnowledgeSource(sourceKey: string) {
  await removeExistingChunks(sourceKey);
}

