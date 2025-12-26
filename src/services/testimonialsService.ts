import {
  addDoc,
  collection,
  serverTimestamp,
  updateDoc,
  doc,
  deleteDoc,
  deleteField,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { TestimonialStatus } from '../types';
import { classifyTestimonialTone } from './testimonialAIService';

/**
 * Light, deterministic keyword extraction to power:
 * - theme chips
 * - smarter ranking
 * - chatbot context retrieval
 *
 * IMPORTANT: This is not "AI"; it's a safe fallback that works offline.
 * The AI piece remains tone classification (and any future LLM enrichment you add).
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'so', 'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'mine', 'we', 'our', 'ours', 'you', 'your', 'yours', 'she', 'her', 'hers', 'he', 'him', 'his', 'they', 'them', 'their',
  'as', 'not', 'no', 'yes', 'just', 'very', 'really', 'too', 'also', 'about', 'into', 'over', 'under', 'up', 'down', 'out', 'more', 'most',
  'moms', 'mom', 'mfm', 'mojo', 'fitness',
]);

function normalizeText(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTags(text: string, max = 8) {
  const t = normalizeText(text);
  if (!t) return [];
  const tokens = t.split(' ').filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  const freq = new Map<string, number>();
  for (const w of tokens) freq.set(w, (freq.get(w) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

function buildSearchText(parts: Array<string | undefined | null>) {
  return normalizeText(parts.filter(Boolean).join(' '));
}

function deriveHighlight(quote: string) {
  // Safe, deterministic "highlight" fallback if user didn't provide one.
  // Pull first sentence-ish and cap length.
  const q = (quote || '').trim();
  if (!q) return undefined;
  const first = q.split(/(?<=[.!?])\s+/)[0] || q;
  const clipped = first.length > 120 ? first.slice(0, 117).trimEnd() + '…' : first;
  return clipped;
}

export interface SubmitTestimonialInput {
  userId: string;
  displayName: string;
  quote: string;
  rating: number;
  highlight?: string;
  avatarUrl?: string;
}

export async function submitTestimonial(input: SubmitTestimonialInput) {
  const { userId, displayName, quote, rating, highlight, avatarUrl } = input;

  // Defensive trimming with validation
  const safeDisplayName = (displayName || '').trim();
  const safeQuote = (quote || '').trim();

  if (!safeQuote || safeQuote.length < 20) {
    throw new Error('Testimonial quote must be at least 20 characters long.');
  }

  const sanitizedRating = Math.min(5, Math.max(1, Math.round(rating)));

  const payload: Record<string, any> = {
    userId,
    displayName: safeDisplayName,
    quote: safeQuote,
    rating: sanitizedRating,
    status: 'pending',
    featured: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Highlight: keep user provided, else safe derive (does not require AI/API)
  const finalHighlight =
    highlight && highlight.trim().length > 0 ? highlight.trim() : deriveHighlight(safeQuote);

  if (finalHighlight) payload.highlight = finalHighlight;
  if (avatarUrl) payload.avatarUrl = avatarUrl;

  // === AI step #1 (already exists): tone classification
  try {
    const toneResult = await classifyTestimonialTone(safeQuote);
    if (toneResult.success && toneResult.label) {
      payload.toneLabel = toneResult.label;
      if (typeof toneResult.confidence === 'number') {
        payload.toneConfidence = Math.max(0, Math.min(1, toneResult.confidence));
      }
      if (toneResult.keywords && toneResult.keywords.length > 0) {
        payload.toneKeywords = toneResult.keywords.slice(0, 8);
      }
    }
  } catch (error) {
    console.warn(
      '[testimonialsService] Tone classification failed, continuing without tone label.',
      error
    );
  }

  // === Smart metadata (deterministic): tags + searchable text
  const tags = extractTags(`${safeQuote} ${finalHighlight || ''}`);
  if (tags.length) payload.tags = tags;

  payload.searchText = buildSearchText([
    safeDisplayName,
    safeQuote,
    finalHighlight,
    ...(payload.toneKeywords || []),
    payload.toneLabel,
    ...(tags || []),
  ]);

  // Moderation pipeline (your current behavior)
  payload.status = 'pending';
  payload.moderationStatus = 'pending';
  payload.requiresApproval = true;
  payload.moderationReason = 'Awaiting automated moderation review';
  payload.moderationDetectedIssues = [];
  payload.moderationPipeline = 'auto_pending';

  await addDoc(collection(db, 'testimonials'), payload);
}

export interface AdminUpdateTestimonialInput {
  status?: TestimonialStatus;
  featured?: boolean;
  quote?: string;
  rating?: number;
  displayName?: string;
  highlight?: string | null;
  avatarUrl?: string | null;
  reviewerId?: string | null;

  // Admin overrides for AI/search metadata if needed
  tags?: string[] | null;
  toneLabel?: string | null;
  toneKeywords?: string[] | null;
}

export async function adminUpdateTestimonial(
  testimonialId: string,
  updates: AdminUpdateTestimonialInput
) {
  const testimonialRef = doc(db, 'testimonials', testimonialId);
  const payload: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.status) {
    payload.status = updates.status;
    payload.reviewedBy = updates.reviewerId ?? null;
    payload.reviewedAt = serverTimestamp();
    payload.publishedAt = updates.status === 'published' ? serverTimestamp() : null;

    if (updates.status === 'published') {
      payload.moderationStatus = 'approved';
      payload.requiresApproval = false;
      payload.moderationReason = null;
    } else if (updates.status === 'rejected') {
      payload.moderationStatus = 'rejected';
      payload.requiresApproval = false;
      if (!('moderationReason' in payload)) {
        payload.moderationReason = 'Testimonial rejected by admin review';
      }
    } else if (updates.status === 'pending') {
      payload.moderationStatus = 'pending';
      payload.requiresApproval = true;
    }
  }

  if (typeof updates.featured === 'boolean') payload.featured = updates.featured;
  if (updates.quote !== undefined) payload.quote = updates.quote;
  if (updates.rating !== undefined) payload.rating = updates.rating;
  if (updates.displayName !== undefined) payload.displayName = updates.displayName;

  if (updates.highlight !== undefined) {
    payload.highlight = updates.highlight === null ? deleteField() : updates.highlight;
  }
  if (updates.avatarUrl !== undefined) {
    payload.avatarUrl = updates.avatarUrl === null ? deleteField() : updates.avatarUrl;
  }

  if (updates.tags !== undefined) {
    payload.tags = updates.tags === null ? deleteField() : updates.tags;
  }
  if (updates.toneLabel !== undefined) {
    payload.toneLabel = updates.toneLabel === null ? deleteField() : updates.toneLabel;
  }
  if (updates.toneKeywords !== undefined) {
    payload.toneKeywords = updates.toneKeywords === null ? deleteField() : updates.toneKeywords;
  }

  // Rebuild smart metadata when key fields change
  // We need to fetch current values for fields that weren't updated
  const shouldRebuildMetadata =
    updates.quote !== undefined ||
    updates.displayName !== undefined ||
    updates.highlight !== undefined ||
    updates.tags !== undefined ||
    updates.toneLabel !== undefined ||
    updates.toneKeywords !== undefined;

  if (shouldRebuildMetadata) {
    // Fetch current testimonial to get values for fields not being updated
    const currentDoc = await getDoc(testimonialRef);
    const currentData = currentDoc.exists() ? currentDoc.data() : {};

    // Use updated values if provided, otherwise fall back to current values
    const quote = (updates.quote !== undefined ? updates.quote : currentData.quote || '').trim();
    const displayName = (updates.displayName !== undefined ? updates.displayName : currentData.displayName || '').trim();
    
    // Handle highlight: if explicitly set to null, use empty; if not provided, derive from quote if quote changed
    let effectiveHighlight: string | undefined;
    if (updates.highlight !== undefined) {
      effectiveHighlight = updates.highlight === null ? undefined : updates.highlight.trim() || undefined;
    } else if (updates.quote !== undefined && quote) {
      // Quote changed but highlight wasn't explicitly set - derive it
      effectiveHighlight = deriveHighlight(quote);
    } else {
      effectiveHighlight = currentData.highlight || undefined;
    }

    // Handle tags: if explicitly provided, use them; otherwise re-extract if quote/highlight changed
    let effectiveTags: string[] = [];
    if (updates.tags !== undefined) {
      effectiveTags = updates.tags === null ? [] : (Array.isArray(updates.tags) ? updates.tags : []);
    } else if (updates.quote !== undefined || updates.highlight !== undefined) {
      // Quote or highlight changed - re-extract tags
      effectiveTags = extractTags(`${quote} ${effectiveHighlight || ''}`);
    } else {
      effectiveTags = Array.isArray(currentData.tags) ? currentData.tags : [];
    }

    // Use updated tone fields if provided, otherwise current values
    const toneKeywords = Array.isArray(updates.toneKeywords)
      ? updates.toneKeywords
      : updates.toneKeywords === null
      ? []
      : Array.isArray(currentData.toneKeywords)
      ? currentData.toneKeywords
      : [];
    const toneLabel = typeof updates.toneLabel === 'string'
      ? updates.toneLabel
      : updates.toneLabel === null
      ? ''
      : currentData.toneLabel || '';

    // Update tags if they were re-extracted or explicitly set
    if (updates.tags !== undefined || updates.quote !== undefined || updates.highlight !== undefined) {
      payload.tags = effectiveTags.length > 0 ? effectiveTags : deleteField();
    }

    // Update highlight if it was derived or explicitly set
    if (updates.highlight !== undefined || (updates.quote !== undefined && effectiveHighlight)) {
      payload.highlight = effectiveHighlight || deleteField();
    }

    // Rebuild searchText from all effective values
    payload.searchText = buildSearchText([
      displayName,
      quote,
      effectiveHighlight,
      ...toneKeywords,
      toneLabel,
      ...effectiveTags,
    ]);
  }

  await updateDoc(testimonialRef, payload);
}

export async function deleteTestimonial(testimonialId: string) {
  await deleteDoc(doc(db, 'testimonials', testimonialId));
}
