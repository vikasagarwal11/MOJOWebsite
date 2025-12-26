import type { Testimonial } from '../types';

/**
 * Normalize text for search/ranking
 */
function norm(s?: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Smart relevance scoring for testimonials:
 * - exact match in quote/highlight/displayName gets strongest boost
 * - toneKeywords/tags get medium boost
 * - toneLabel gets smaller boost
 * - featured, rating, recency provide tie-breakers
 */
function scoreTestimonial(t: Testimonial, qRaw: string) {
  const q = norm(qRaw);
  if (!q) return 0;

  const hayQuote = norm(t.quote);
  const hayName = norm(t.displayName || '');
  const hayHighlight = norm(t.highlight || '');
  const tags = (t as any).tags as string[] | undefined;
  const toneKeywords = (t as any).toneKeywords as string[] | undefined;
  const toneLabel = norm((t as any).toneLabel || '');

  let score = 0;

  // Hard matches
  if (hayQuote.includes(q)) score += 50;
  if (hayHighlight.includes(q)) score += 35;
  if (hayName.includes(q)) score += 25;

  // Token-level boosting
  const qTokens = q.split(' ').filter((w) => w.length >= 3);
  for (const tok of qTokens) {
    if (hayQuote.includes(tok)) score += 8;
    if (hayHighlight.includes(tok)) score += 6;
    if (hayName.includes(tok)) score += 4;
    if (toneLabel && toneLabel.includes(tok)) score += 5;

    if (tags?.some((x) => norm(x) === tok || norm(x).includes(tok))) score += 7;
    if (toneKeywords?.some((x) => norm(x) === tok || norm(x).includes(tok))) score += 7;
  }

  // Tie-breakers
  if (t.featured) score += 4;
  if (typeof t.rating === 'number') score += Math.max(0, Math.min(5, t.rating)) * 0.5;

  const ts = t.createdAt instanceof Date ? t.createdAt.getTime() : 0;
  if (ts) score += Math.min(3, (Date.now() - ts) / (1000 * 60 * 60 * 24 * 120)); // small recency signal

  return score;
}

/**
 * Build testimonials context for AI chatbot
 * @param question - User's question
 * @param testimonials - Array of published testimonials
 * @param max - Maximum number of testimonials to include (default: 6)
 * @returns Formatted context string for chatbot prompt
 */
export function buildTestimonialsContext(question: string, testimonials: Testimonial[], max = 6) {
  const ranked = testimonials
    .map((t) => ({ t, s: scoreTestimonial(t, question) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.t);

  if (ranked.length === 0) return '';

  const lines = ranked.map((t, i) => {
    const who = t.displayName || 'MFM Member';
    const mood = (t as any).toneLabel ? ` (mood: ${(t as any).toneLabel})` : '';
    return `${i + 1}. "${t.quote}" — ${who}${mood}`;
  });

  return `Moms Fitness Mojo testimonials (most relevant):\n${lines.join('\n')}\n`;
}

