import { httpsCallable } from 'firebase/functions';
import { functions, functionsUsCentral1 } from '../config/firebase';

const kbFunctions = functionsUsCentral1 ?? functions;

export type KnowledgeVisibility = 'public' | 'members' | 'private';

export interface KnowledgeEntryPayload {
  id?: string;
  title: string;
  summary?: string;
  body?: string;
  visibility: KnowledgeVisibility;
  tags?: string[];
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeEntryResponse {
  success: boolean;
  id: string;
  sourceKey: string;
}

export async function saveKnowledgeEntry(payload: KnowledgeEntryPayload): Promise<KnowledgeEntryResponse> {
  const callable = httpsCallable(kbFunctions, 'saveManualKnowledgeEntry');
  const result = await callable(payload);
  return result.data as KnowledgeEntryResponse;
}

export async function deleteKnowledgeEntry(id: string): Promise<{ success: boolean; id: string }> {
  const callable = httpsCallable(kbFunctions, 'deleteManualKnowledgeEntry');
  const result = await callable({ id });
  return result.data as { success: boolean; id: string };
}

export async function syncSiteCopyToKnowledgeBase(): Promise<{ success: boolean; synced: number; removed: number }> {
  const callable = httpsCallable(kbFunctions, 'syncSiteCopyToKnowledgeBase');
  const result = await callable({});
  return result.data as { success: boolean; synced: number; removed: number };
}

export interface RebuildKnowledgeEmbeddingsResult {
  processed: number;
  totalChecked?: number;
  scanned?: number;
  message?: string;
}

export async function rebuildKnowledgeEmbeddings(limit?: number): Promise<RebuildKnowledgeEmbeddingsResult> {
  const callable = httpsCallable(kbFunctions, 'backfillKnowledgeBaseEmbeddings');
  const payload = typeof limit === 'number' ? { limit } : {};
  const result = await callable(payload);
  return result.data as RebuildKnowledgeEmbeddingsResult;
}

export interface EmbeddingStatusSummary {
  counts: { ready: number; pending: number; processing: number; error: number; chunks: number; sources: number };
  recentErrors: Array<{ id: string; sourceKey?: string | null; title?: string | null; error?: string | null; updatedAt?: any }>;
}

export async function getKnowledgeEmbeddingStatus(): Promise<EmbeddingStatusSummary> {
  const callable = httpsCallable(kbFunctions, 'getKnowledgeEmbeddingStatus');
  const result = await callable({});
  return result.data as EmbeddingStatusSummary;
}

export async function retryFailedKnowledgeEmbeddings(limit?: number, statuses?: Array<'error' | 'pending'>): Promise<RebuildKnowledgeEmbeddingsResult & { errors?: number }> {
  const callable = httpsCallable(kbFunctions, 'retryFailedKnowledgeEmbeddings');
  const payload: any = {};
  if (typeof limit === 'number') payload.limit = limit;
  if (Array.isArray(statuses) && statuses.length) payload.statuses = statuses;
  const result = await callable(payload);
  return result.data as any;
}

