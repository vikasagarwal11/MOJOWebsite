import React, { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Helmet } from 'react-helmet-async';
import {
  MessageSquare,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
  ArrowDown,
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { useTestimonials } from '../hooks/useTestimonials';
import { TestimonialCarousel } from '../components/home/TestimonialCarousel';
import { TestimonialSubmissionForm } from '../components/home/TestimonialSubmissionForm';
import type { Testimonial } from '../types';

type SortMode = 'featured' | 'newest' | 'highest_rated';
type ViewMode = 'spotlight' | 'all' | 'themes' | 'moods';

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

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="text-center">
    <div className="text-3xl md:text-4xl font-bold mb-1">{value}</div>
    <div className="text-white/90 text-sm">{label}</div>
  </div>
);

const QuoteCard: React.FC<{ testimonial: Testimonial }> = ({ testimonial }) => {
  const displayName = testimonial.displayName || 'MFM Member';
  const date = testimonial.publishedAt || testimonial.createdAt;
  const dt = date
    ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date)
    : '';

  const toneLabel = (testimonial as any).toneLabel as string | undefined;

  return (
    <div className="break-inside-avoid rounded-2xl bg-white shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full overflow-hidden ring-1 ring-[#F25129]/25 bg-gradient-to-br from-[#F25129] to-[#FFC107] flex items-center justify-center shrink-0">
              {testimonial.avatarUrl ? (
                <img src={testimonial.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-xs font-semibold">{initialsFromName(displayName)}</span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-semibold text-gray-900 truncate">{displayName}</div>
                {testimonial.featured && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[#F25129]/10 text-[#F25129]">
                    <Sparkles className="w-3 h-3" />
                    Featured
                  </span>
                )}
                {toneLabel ? (
                  <span className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                    {toneLabel}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-gray-500">{dt}</div>
            </div>
          </div>

          {typeof testimonial.rating === 'number' && (
            <div className="flex items-center gap-1 text-[#F25129] shrink-0">
              <Star className="w-4 h-4 fill-current" />
              <span className="text-sm font-semibold">
                {Math.max(1, Math.min(5, Math.round(testimonial.rating)))}
              </span>
            </div>
          )}
        </div>

        <p className="mt-4 text-gray-700 leading-relaxed">
          <span className="text-[#F25129] font-bold mr-1">"</span>
          {testimonial.quote}
          <span className="text-[#F25129] font-bold ml-1">"</span>
        </p>

        {testimonial.highlight ? (
          <div className="mt-4 rounded-xl border border-[#F25129]/15 bg-[#FFF5F2] px-4 py-3 text-sm text-gray-700">
            <span className="font-semibold text-[#F25129]">Mojo Highlight: </span>
            {testimonial.highlight}
          </div>
        ) : null}

        {Array.isArray((testimonial as any).tags) && (testimonial as any).tags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {(testimonial as any).tags.slice(0, 6).map((tag: string) => (
              <span
                key={tag}
                className="text-[11px] px-2 py-1 rounded-full border border-gray-200 bg-white text-gray-600"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const Testimonials: React.FC = () => {
  const { currentUser } = useAuth();
  const isAuthed = !!currentUser;
  const navigate = useNavigate();

  const spotlightRef = useRef<HTMLDivElement | null>(null);
  const [showForm, setShowForm] = useState(false);

  const {
    testimonials: allTestimonials,
    loading,
    error,
  } = useTestimonials({
    statuses: ['published'],
    orderByField: 'createdAt',
    orderDirection: 'desc',
    prioritizeFeatured: true,
    limit: 120,
  });

  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('featured');
  const [onlyFeatured, setOnlyFeatured] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('spotlight');
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [activeMood, setActiveMood] = useState<string | null>(null);

  const featuredList = useMemo(
    () => allTestimonials.filter((t) => t.featured).slice(0, 12),
    [allTestimonials]
  );

  const allThemes = useMemo(() => {
    const set = new Set<string>();
    for (const t of allTestimonials) {
      const tags = (t as any).tags as string[] | undefined;
      tags?.forEach((x) => set.add(String(x)));
    }
    return [...set].sort((a, b) => a.localeCompare(b)).slice(0, 18);
  }, [allTestimonials]);

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

    if (activeTheme) {
      list = list.filter((t) => Array.isArray((t as any).tags) && (t as any).tags.includes(activeTheme));
    }

    if (activeMood) {
      list = list.filter((t) => String((t as any).toneLabel || '') === activeMood);
    }

    return list;
  }, [allTestimonials, onlyFeatured, activeTheme, activeMood]);

  const filtered = useMemo(() => {
    const q = query.trim();
    let list = baseFiltered;

    // When query exists, use smart ranking (instead of plain includes)
    if (q) {
      const scored = list
        .map((t) => ({ t, s: scoreTestimonial(t, q) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.t);

      // If smart score yields nothing, fallback to simple includes on quote/highlight
      if (scored.length > 0) list = scored;
      else {
        const qq = norm(q);
        list = list.filter((t) => {
          const hay = `${t.displayName} ${t.quote} ${t.highlight || ''} ${(t as any).searchText || ''}`.toLowerCase();
          return hay.includes(qq);
        });
      }
    } else {
      // No query: apply selected sort mode
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
  }, [baseFiltered, query, sortMode]);

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

  return (
    <div className="min-h-screen bg-white">
      <HelmetWrapper>
        <title>Testimonials | Moms Fitness Mojo</title>
        <meta
          name="description"
          content="Real stories from moms in Moms Fitness Mojo — fitness, friendship, confidence, and community."
        />
      </HelmetWrapper>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-gradient-to-b from-[#F25129]/12 via-[#FFF3EE] to-white" />
          <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-[#EFD8C5] blur-3xl opacity-60" />
          <div className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[#FFE08A] blur-3xl opacity-55" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-18">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F25129]/20 bg-white/70 px-4 py-2 text-sm text-gray-700">
              <Sparkles className="w-4 h-4 text-[#F25129]" />
              Real Stories. Real Strength.
            </div>

            <h1 className="mt-5 text-4xl sm:text-5xl font-extrabold tracking-tight">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F25129] to-[#FFC107]">
                What Moms Are Saying
              </span>
            </h1>

            <p className="mt-4 text-lg text-gray-700 leading-relaxed">
              Honest experiences from women who found fitness, friendship, and confidence through Moms Fitness Mojo.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white shadow-md hover:shadow-lg transition-all hover:scale-[1.02]"
              >
                <MessageSquare className="w-4 h-4" />
                Share Your Story
              </button>

              {featuredList.length > 0 && (
                <button
                  onClick={() => spotlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-[#F25129] border border-[#F25129]/35 bg-white/70 hover:bg-[#F25129]/5 transition-colors"
                >
                  <ArrowDown className="w-4 h-4" />
                  Read Featured Stories
                </button>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-2 text-sm text-gray-600">
              <span className="rounded-full bg-white/70 border border-gray-200 px-3 py-1">{totalCount} stories</span>
              {featuredCount > 0 && (
                <span className="rounded-full bg-white/70 border border-gray-200 px-3 py-1">
                  {featuredCount} featured
                </span>
              )}
              {avgRating !== null && (
                <span className="rounded-full bg-white/70 border border-gray-200 px-3 py-1 inline-flex items-center gap-1">
                  <Star className="w-4 h-4 text-[#F25129] fill-current" />
                  {avgRating} avg
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* TABS (Hybrid UX) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-2">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['spotlight', 'Spotlight'],
              ['all', 'All Stories'],
              ['themes', 'By Theme'],
              ['moods', 'By Mood'],
            ] as Array<[ViewMode, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${
                viewMode === key
                  ? 'bg-[#F25129] text-white border-[#F25129]'
                  : 'bg-white text-[#F25129] border-[#F25129]/35 hover:bg-[#F25129]/5'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* FEATURED SPOTLIGHT */}
      {viewMode === 'spotlight' && featuredList.length > 0 && (
        <section ref={spotlightRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Featured Spotlight</h2>
              <p className="mt-1 text-gray-600">A few standout stories from the community.</p>
            </div>

            <button
              onClick={handleShare}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold bg-[#F25129] text-white hover:bg-[#E0451F] transition-colors shadow-sm"
            >
              <MessageSquare className="w-4 h-4" />
              Add Yours
            </button>
          </div>

          <div className="rounded-2xl border border-[#F25129]/15 bg-white/60 backdrop-blur-sm shadow-sm p-4 sm:p-6">
            <TestimonialCarousel
              testimonials={featuredList.length > 0 ? featuredList : allTestimonials.slice(0, 12)}
              loading={loading}
              error={error}
            />
          </div>
        </section>
      )}

      {/* SUBMISSION FORM */}
      {showForm && isAuthed && (
        <section id="testimonial-form-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

      {/* THEMES / MOODS PICKERS */}
      {(viewMode === 'themes' || viewMode === 'moods') && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-5">
            {viewMode === 'themes' ? (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-lg font-bold text-gray-900">Themes</div>
                    <div className="text-sm text-gray-600">Tap a theme to filter stories.</div>
                  </div>
                  {activeTheme ? (
                    <button
                      onClick={() => setActiveTheme(null)}
                      className="text-sm font-semibold text-[#F25129] hover:underline"
                    >
                      Clear theme
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {allThemes.length === 0 ? (
                    <div className="text-sm text-gray-500">No themes yet. They'll appear as stories are added.</div>
                  ) : (
                    allThemes.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => setActiveTheme((v) => (v === tag ? null : tag))}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold border transition-colors ${
                          activeTheme === tag
                            ? 'bg-[#F25129] text-white border-[#F25129]'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-[#F25129]/40 hover:text-[#F25129]'
                        }`}
                      >
                        #{tag}
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-lg font-bold text-gray-900">Moods (AI)</div>
                    <div className="text-sm text-gray-600">
                      These come from tone classification saved with each story.
                    </div>
                  </div>
                  {activeMood ? (
                    <button
                      onClick={() => setActiveMood(null)}
                      className="text-sm font-semibold text-[#F25129] hover:underline"
                    >
                      Clear mood
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {allMoods.length === 0 ? (
                    <div className="text-sm text-gray-500">No mood labels yet.</div>
                  ) : (
                    allMoods.map((m) => (
                      <button
                        key={m}
                        onClick={() => setActiveMood((v) => (v === m ? null : m))}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold border transition-colors ${
                          activeMood === m
                            ? 'bg-[#F25129] text-white border-[#F25129]'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-[#F25129]/40 hover:text-[#F25129]'
                        }`}
                      >
                        {m}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* TOOLBAR (smart search + sort) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2">
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
            <div className="flex-1">
              <label className="sr-only" htmlFor="testimonial-search">
                Search testimonials
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="testimonial-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder='Try: "confidence", "friends", "accountability", "postpartum"...'
                  className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F25129]/30"
                />
              </div>
              {query.trim().length > 0 ? (
                <div className="mt-2 text-xs text-gray-500">
                  Smart ranking uses quote + highlight + AI keywords + tags + mood labels.
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                <SlidersHorizontal className="w-4 h-4 text-gray-500" />
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="text-sm bg-transparent focus:outline-none"
                  disabled={query.trim().length > 0} // smart rank overrides sort
                  title={query.trim().length > 0 ? 'Sorting disabled while searching (smart ranking enabled)' : ''}
                >
                  <option value="featured">Featured first</option>
                  <option value="newest">Newest</option>
                  <option value="highest_rated">Highest rated</option>
                </select>
              </div>

              <button
                onClick={() => setOnlyFeatured((v) => !v)}
                className={`rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${
                  onlyFeatured
                    ? 'bg-[#F25129] text-white border-[#F25129]'
                    : 'bg-white text-[#F25129] border-[#F25129]/35 hover:bg-[#F25129]/5'
                }`}
              >
                Featured only
              </button>

              <div className="text-sm text-gray-500 ml-1">
                Showing <span className="font-semibold text-gray-700">{filtered.length}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GRID */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Community Voices</h2>
            <p className="mt-1 text-gray-600">Browse stories from across Moms Fitness Mojo.</p>
          </div>

          <Link to="/" className="text-sm font-semibold text-[#F25129] hover:underline">
            Back to Home
          </Link>
        </div>

        {loading ? (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="break-inside-avoid rounded-2xl bg-gray-100 animate-pulse h-48" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">{String(error)}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#F25129]/30 bg-white p-10 text-center">
            <div className="text-lg font-semibold text-gray-900">No stories match your filters.</div>
            <p className="mt-2 text-gray-600">Try a different keyword, theme, or mood.</p>
            <button
              onClick={() => {
                setQuery('');
                setOnlyFeatured(false);
                setSortMode('featured');
                setActiveTheme(null);
                setActiveMood(null);
              }}
              className="mt-5 inline-flex rounded-full px-5 py-2.5 text-sm font-semibold bg-[#F25129] text-white hover:bg-[#E0451F] transition-colors"
            >
              Reset
            </button>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
            {filtered.map((testimonial) => (
              <QuoteCard key={testimonial.id} testimonial={testimonial} />
            ))}
          </div>
        )}
      </section>

      {/* IMPACT STRIP */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <div className="rounded-2xl bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white py-10 px-6 shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Stat label="Active Moms" value="180+" />
            <Stat label="NJ Towns & Growing" value="6+" />
            <Stat label="Stories Shared" value={`${totalCount}+`} />
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="rounded-3xl border border-[#F25129]/15 bg-gradient-to-br from-[#F25129]/8 to-[#FFC107]/10 p-8 sm:p-12 text-center shadow-sm">
          <h3 className="text-3xl font-bold text-gray-900">Your Story Belongs Here</h3>
          <p className="mt-3 text-lg text-gray-700 max-w-2xl mx-auto">
            Whether it's fitness, confidence, friendship, or simply finding time for yourself — your journey can inspire
            another mom.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold bg-[#F25129] text-white hover:bg-[#E0451F] transition-colors shadow-sm"
            >
              <MessageSquare className="w-4 h-4" />
              Share Your Story
            </button>

            <Link
              to="/events"
              className="inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold bg-white text-[#F25129] border border-[#F25129]/35 hover:bg-[#F25129]/5 transition-colors"
            >
              Explore Events
            </Link>
          </div>

          <p className="mt-5 text-sm text-gray-600">
            Tip: If you're new here, start with an event — the community feeling clicks instantly.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Testimonials;
