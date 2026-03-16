import { MessageSquare, Sparkles, Star, X, Search, Filter } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'use-debounce';

import { TestimonialCarousel } from '../components/home/TestimonialCarousel';
import { TestimonialSubmissionForm } from '../components/home/TestimonialSubmissionForm';
import { useAuth } from '../contexts/AuthContext';
import { useTestimonials } from '../hooks/useTestimonials';
import type { Testimonial } from '../types';

type SortMode = 'featured' | 'newest' | 'highest_rated';
type ViewMode = 'spotlight' | 'all' | 'moods';

const isBrowser = typeof window !== 'undefined';

const HelmetWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
  if (!isBrowser) return <>{children}</>;
  return <Helmet>{children}</Helmet>;
};

function initialsFromName(name?: string) {
  if (!name) return 'MM';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || 'MM';
}

function norm(s?: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Smart relevance scoring:
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
  const toneKeywords = (t as any).toneKeywords as string[] | undefined;
  const toneLabel = norm((t as any).toneLabel || '');

  let score = 0;
  let hasTextMatch = false;

  // Hard matches (exact phrase matches)
  if (hayQuote.includes(q)) { score += 50; hasTextMatch = true; }
  if (hayHighlight.includes(q)) { score += 35; hasTextMatch = true; }
  if (hayName.includes(q)) { score += 25; hasTextMatch = true; }

  // Token-level boosting (individual word matches)
  const qTokens = q.split(' ').filter((w) => w.length >= 3);
  for (const tok of qTokens) {
    if (hayQuote.includes(tok)) { score += 8; hasTextMatch = true; }
    if (hayHighlight.includes(tok)) { score += 6; hasTextMatch = true; }
    if (hayName.includes(tok)) { score += 4; hasTextMatch = true; }
    if (toneLabel && toneLabel.includes(tok)) { score += 5; hasTextMatch = true; }

    if (toneKeywords?.some((x) => norm(x) === tok || norm(x).includes(tok))) { score += 7; hasTextMatch = true; }
  }

  // Only add tie-breakers if there's at least one actual text match
  // This ensures we only show stories that actually match the search query
  if (hasTextMatch) {
    // Tie-breakers (only applied to matching stories)
    if (t.featured) score += 4;
    if (typeof t.rating === 'number') score += Math.max(0, Math.min(5, t.rating)) * 0.5;

    const ts = t.createdAt instanceof Date ? t.createdAt.getTime() : 0;
    if (ts) score += Math.min(3, (Date.now() - ts) / (1000 * 60 * 60 * 24 * 120));
  }

  return score;
}

const StatPill: React.FC<{ icon?: React.ReactNode; value: string; label: string }> = ({ icon, value, label }) => (
  <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 text-sm">
    <span className="text-[#F25129]">{icon}</span>
    <span className="font-semibold text-gray-900">{value}</span>
    <span className="text-gray-600">{label}</span>
  </div>
);

// Editorial-style row layout for testimonials
const TestimonialRow: React.FC<{ testimonial: Testimonial }> = ({ testimonial }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const displayName = testimonial.displayName || 'MFM Member';
  const date = testimonial.publishedAt || testimonial.createdAt;
  const dateLabel = date
    ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date)
    : '';

  const toneLabel = (testimonial as any).toneLabel as string | undefined;
  const quoteText = testimonial.quote;
  const shouldTruncate = quoteText.length > 200; // Show expand if quote is longer than ~200 chars
  const displayQuote = isExpanded || !shouldTruncate ? quoteText : quoteText.slice(0, 200) + '...';

  return (
    <div className="group rounded-2xl border border-gray-100 bg-white px-5 py-5 shadow-sm hover:shadow-md transition">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-start">
        {/* Meta column */}
        <div className="md:col-span-4 lg:col-span-3 flex items-start gap-3">
          <div className="h-11 w-11 rounded-full overflow-hidden ring-1 ring-[#F25129]/20 bg-gradient-to-br from-[#F25129] to-[#FFC107] flex items-center justify-center shrink-0">
            {testimonial.avatarUrl ? (
              <img src={testimonial.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-xs font-bold">{initialsFromName(displayName)}</span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-semibold text-gray-900 truncate">{displayName}</div>

              {testimonial.featured && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#F25129]/10 text-[#F25129] font-semibold">
                  Featured
                </span>
              )}

              {toneLabel && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  {toneLabel}
                </span>
              )}
            </div>

            <div className="text-xs text-gray-500 mt-0.5">{dateLabel}</div>

            {/* Rating */}
            {typeof testimonial.rating === 'number' && (
              <div className="mt-2 flex items-center gap-1 text-[#F25129]">
                <Star className="w-4 h-4 fill-current" />
                <span className="text-sm font-semibold">{Math.max(1, Math.min(5, Math.round(testimonial.rating)))}</span>
                <span className="text-xs text-gray-500">/ 5</span>
              </div>
            )}

          </div>
        </div>

        {/* Quote column */}
        <div className="md:col-span-8 lg:col-span-9">
          <p className="text-gray-800 leading-relaxed text-[15px] md:text-base">
            {displayQuote}
          </p>

          {/* Highlight callout - Option 5: Minimal No Border (cleanest) */}
          {testimonial.highlight && (
            <div className="mt-4 text-gray-600 italic text-[15px] leading-relaxed">
              {testimonial.highlight}
            </div>
          )}

          {/* Expand/Collapse button */}
          {shouldTruncate && (
            <div className="mt-3">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-sm font-semibold text-[#F25129] hover:underline flex items-center gap-1"
              >
                {isExpanded ? (
                  <>
                    Show less <span className="transform rotate-180 inline-block">→</span>
                  </>
                ) : (
                  <>
                    Read full story →
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


const Testimonials: React.FC = () => {
  const { currentUser } = useAuth();
  const isAuthed = !!currentUser;
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { testimonials: allTestimonials, loading, error } = useTestimonials({
    statuses: ['published'],
    orderByField: 'createdAt',
    orderDirection: 'desc',
    prioritizeFeatured: true,
    limit: 120,
  });

  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300); // Wait 300ms after user stops typing before searching
  const [sortMode, setSortMode] = useState<SortMode>('featured');
  const [onlyFeatured, setOnlyFeatured] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [activeMood, setActiveMood] = useState<string | null>(null);

  const featuredList = useMemo(
    () => allTestimonials.filter((t) => t.featured).slice(0, 12),
    [allTestimonials]
  );


  const allMoods = useMemo(() => {
    const set = new Set<string>();
    for (const t of allTestimonials) {
      const mood = (t as any).toneLabel;
      if (mood) set.add(String(mood));
    }
    return [...set].sort((a, b) => a.localeCompare(b)).slice(0, 12);
  }, [allTestimonials]);

  const baseFiltered = useMemo(() => {
    let list = allTestimonials;

    if (onlyFeatured) list = list.filter((t) => t.featured);

    if (activeMood) {
      list = list.filter((t) => String((t as any).toneLabel || '') === activeMood);
    }

    return list;
  }, [allTestimonials, onlyFeatured, activeMood]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim(); // Use debounced query instead of immediate query
    let list = baseFiltered;

    if (q) {
      const scored = list
        .map((t) => ({ t, s: scoreTestimonial(t, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.t);

      if (scored.length > 0) {
        // Only show matching results when search is active
        list = scored;
      } else {
        // Fallback: if no scored matches, try simple text search
        const qq = norm(q);
        const simpleMatches = list.filter((t) => {
          // Fallback simple search: searches across all text fields
          const hay = `${t.displayName} ${t.quote} ${t.highlight || ''} ${(t as any).toneLabel || ''} ${((t as any).toneKeywords || []).join(' ')} ${(t as any).searchText || ''}`.toLowerCase();
          return hay.includes(qq);
        });
        // Only show matches - if no matches, show empty list (not all results)
        list = simpleMatches;
      }
    } else {
      if (sortMode === 'newest') {
        list = [...list].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      } else if (sortMode === 'highest_rated') {
        list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      } else {
        list = [...list].sort((a, b) => {
          const f = Number(b.featured) - Number(a.featured);
          if (f !== 0) return f;
          return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
        });
      }
    }

    return list;
  }, [baseFiltered, debouncedQuery, sortMode]); // Use debouncedQuery instead of query

  const totalCount = allTestimonials.length;
  const featuredCount = featuredList.length;

  const avgRating = useMemo(() => {
    const ratings = allTestimonials
      .map((t) => t.rating)
      .filter((r): r is number => typeof r === 'number' && r > 0);
    if (ratings.length === 0) return null;
    const sum = ratings.reduce((a, b) => a + b, 0);
    return Math.round((sum / ratings.length) * 10) / 10;
  }, [allTestimonials]);

  const handleShare = () => {
    if (isAuthed) {
      setShowForm(true);
      setTimeout(() => {
        const formElement = document.getElementById('testimonial-form-section');
        if (formElement) formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return;
    }

    toast(
      (t) => (
        <div className="flex flex-col gap-3 relative" style={{ minWidth: '320px' }}>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toast.dismiss(t.id);
            }}
            className="absolute top-0 right-0 text-white/70 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div>
            <span className="font-semibold text-white block mb-1">Please sign in to share your story</span>
            <p className="text-sm text-gray-200">Create an account or log in to publish your testimonial.</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toast.dismiss(t.id);
                navigate('/login');
              }}
              className="flex-1 px-4 py-2 bg-white text-[#F25129] rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toast.dismiss(t.id);
                navigate('/register');
              }}
              className="flex-1 px-4 py-2 border-2 border-white text-white rounded-lg text-sm font-medium hover:bg-white/20 transition-colors"
            >
              Join MOJO
            </button>
          </div>

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toast.dismiss(t.id);
            }}
            className="w-full px-4 py-2 text-white/80 hover:text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      ),
      {
        duration: Infinity,
        position: 'top-center',
        style: {
          background: '#1F2937',
          color: '#fff',
          padding: '20px',
          maxWidth: '420px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
        },
      }
    );
  };

  const handleFormSubmitted = () => {
    setShowForm(false);
    toast.success('Thank you! Your testimonial is pending review.');
  };

  const clearFilters = () => {
    setQuery('');
    setSortMode('featured');
    setOnlyFeatured(false);
    setActiveMood(null);
  };

  return (
    <div className="min-h-screen bg-[#FFF9F6]">
      <HelmetWrapper>
        <title>Testimonials | Moms Fitness Mojo</title>
        <meta
          name="description"
          content="Real stories from moms in Moms Fitness Mojo — fitness, friendship, confidence, and community."
        />
      </HelmetWrapper>

      {/* COMPACT HERO */}
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-[#EFD8C5] blur-3xl opacity-35" />
          <div className="absolute -bottom-40 -left-40 h-[24rem] w-[24rem] rounded-full bg-[#FFE08A] blur-3xl opacity-30" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-5">
          {/* Title - Centered to match other pages */}
          <div className="text-center mb-6 overflow-visible pb-1">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-3 overflow-visible">
              What Moms Are Saying
            </h1>
            <p className="mt-1 sm:mt-1.5 text-base sm:text-lg text-gray-600 leading-snug max-w-3xl mx-auto">
              Real stories of fitness, friendship, and confidence in Moms Fitness Mojo.
            </p>
          </div>

          {/* Buttons and Stats */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm
                           bg-gradient-to-r from-[#F25129] to-[#FFC107] hover:opacity-95 active:scale-[0.98] transition"
              >
                <MessageSquare className="w-4 h-4" />
                Share Your Story
              </button>
            </div>

            {/* STATS STRIP */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StatPill icon={<Sparkles className="w-4 h-4" />} value={`${totalCount}`} label="stories" />
              {avgRating !== null ? (
                <StatPill icon={<Star className="w-4 h-4 fill-current" />} value={`${avgRating}`} label="avg" />
              ) : null}
              <StatPill icon={<Filter className="w-4 h-4" />} value={`${featuredCount}`} label="featured" />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED CAROUSEL (cleaner container, less vertical padding) */}
      {featuredList.length > 0 && (
        <section ref={spotlightRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
          <div className="rounded-2xl border border-[#F25129]/15 bg-white shadow-sm p-4 sm:p-6">
            <div className="mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Featured Spotlight</h2>
              <p className="text-sm text-gray-600">A few standout stories from the community.</p>
            </div>

            <TestimonialCarousel
              testimonials={featuredList.length > 0 ? featuredList : allTestimonials.slice(0, 12)}
              loading={loading}
              error={error}
            />
          </div>
        </section>
      )}

      {/* FORM */}
      {showForm && isAuthed && (
        <section id="testimonial-form-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="rounded-2xl border border-[#F25129]/20 bg-white shadow-lg p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Share Your Story</h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Close form"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <TestimonialSubmissionForm onSubmitted={handleFormSubmitted} />
          </div>
        </section>
      )}

      {/* Section separator */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mt-5 h-px w-full bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
      </div>

      {/* MAIN: FEED + RIGHT RAIL */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* MOBILE: SEARCH FIRST (before stories on mobile) */}
          <div className="lg:hidden">
            {/* Search - Mobile */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4 text-[#F25129]" />
                <div className="font-bold text-gray-900 text-sm">Search stories</div>
              </div>
              <div className="relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Try: supportive, confidence..."
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F25129]/25"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  onClick={clearFilters}
                  className="text-xs font-semibold text-[#F25129] hover:underline"
                >
                  Reset
                </button>
                <div className="text-xs text-gray-500">{filtered.length} results</div>
              </div>
            </div>
          </div>

          {/* LEFT: FEED */}
          <div className="lg:col-span-8 xl:col-span-9">
            <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Community Voices</h2>
                <p className="text-sm text-gray-600">Browse stories from across Moms Fitness Mojo.</p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-[#F25129]/25"
                >
                  <option value="featured">Featured first</option>
                  <option value="newest">Most recent</option>
                  <option value="highest_rated">Highest rated</option>
                </select>

                <button
                  onClick={() => setOnlyFeatured((v) => !v)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold border transition ${
                    onlyFeatured
                      ? 'bg-[#F25129] text-white border-[#F25129]'
                      : 'bg-white text-gray-800 border-gray-200 hover:border-[#F25129]/30'
                  }`}
                >
                  Featured only
                </button>
              </div>
            </div>

            {/* RESULTS - Editorial row layout */}
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="rounded-2xl bg-gray-100 animate-pulse h-32" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-8 text-red-800 text-center shadow-sm">
                <div className="text-lg font-semibold mb-2">Error Loading Stories</div>
                <div>{String(error)}</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-[#F25129]/30 bg-white p-10 text-center shadow-sm">
                <div className="text-xl font-semibold text-gray-900 mb-2">No Stories Found</div>
                <p className="text-base text-gray-600 max-w-md mx-auto">
                  Try clearing filters or searching a different keyword.
                </p>
                <button
                  onClick={clearFilters}
                  className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold bg-[#F25129] text-white hover:bg-[#E0451F] transition"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filtered.map((testimonial) => (
                  <TestimonialRow key={testimonial.id} testimonial={testimonial} />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: STICKY FILTERS (Desktop only - search hidden on mobile, shown above) */}
          <aside className="hidden lg:block lg:col-span-4 xl:col-span-3">
            <div className="lg:sticky lg:top-20 space-y-4">
              {/* Search - Desktop */}
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="w-4 h-4 text-[#F25129]" />
                  <div className="font-bold text-gray-900">Search stories</div>
                </div>
                <div className="relative">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Try: supportive, confidence, postpartum..."
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[#F25129]/25"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <button
                    onClick={clearFilters}
                    className="text-sm font-semibold text-[#F25129] hover:underline"
                  >
                    Reset
                  </button>
                  <div className="text-xs text-gray-500">{filtered.length} results</div>
                </div>
              </div>

              {/* View toggles */}
              <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4">
                <div className="font-bold text-gray-900 mb-3">Browse by</div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: 'all', label: 'All' },
                    { key: 'moods', label: 'Moods' },
                  ] as const).map((x) => (
                    <button
                      key={x.key}
                      onClick={() => setViewMode(x.key as ViewMode)}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold border transition ${
                        viewMode === x.key
                          ? 'bg-[#F25129] text-white border-[#F25129]'
                          : 'bg-white text-gray-800 border-gray-200 hover:border-[#F25129]/30'
                      }`}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>

                {viewMode === 'moods' && (
                  <div className="mt-4">
                    <div className="text-sm font-semibold text-gray-900 mb-2">Moods (AI)</div>
                    <div className="flex flex-wrap gap-2">
                      {allMoods.length === 0 ? (
                        <div className="text-sm text-gray-500">No mood labels yet.</div>
                      ) : (
                        allMoods.map((m) => (
                          <button
                            key={m}
                            onClick={() => setActiveMood((v) => (v === m ? null : m))}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition ${
                              activeMood === m
                                ? 'bg-[#F25129] text-white border-[#F25129]'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-[#F25129]/30'
                            }`}
                          >
                            {m}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Tips */}
              <div className="rounded-2xl border border-[#F25129]/15 bg-gradient-to-br from-[#F25129]/5 to-[#FFC107]/10 p-4">
                <div className="font-bold text-gray-900 mb-2">How to write a great story</div>
                <ul className="text-sm text-gray-700 space-y-2">
                  <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#F25129]" />Write from the heart</li>
                  <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#F25129]" />Share a specific moment or result</li>
                  <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#F25129]" />Keep it real and encouraging</li>
                </ul>

                <button
                  onClick={handleShare}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-[#F25129] text-white hover:bg-[#E0451F] transition"
                >
                  <MessageSquare className="w-4 h-4" />
                  Share Your Story
                </button>
              </div>

            </div>
          </aside>
        </div>
      </section>

      {/* BOTTOM CTA STRIP (lighter, less tall) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="rounded-3xl bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white px-6 py-8 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-2xl font-extrabold">Your story belongs here.</div>
              <div className="text-white/90 text-sm mt-1">
                Fitness, confidence, friendship—whatever your journey looks like, it can inspire another mom.
              </div>
            </div>
            <button
              onClick={handleShare}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#F25129] px-6 py-2.5 text-sm font-extrabold hover:bg-white/90 transition"
            >
              <MessageSquare className="w-4 h-4" />
              Share Your Story
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Testimonials;
