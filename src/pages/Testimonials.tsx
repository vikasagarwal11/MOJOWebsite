import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { MessageSquare, Quote, Star, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTestimonials } from '../hooks/useTestimonials';
import { TestimonialSubmissionForm } from '../components/home/TestimonialSubmissionForm';
import type { Testimonial } from '../types';

const TONE_BADGE_STYLES: { matcher: RegExp; className: string }[] = [
  { matcher: /empower|strong|confiden/i, className: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  { matcher: /motivat|energ/i, className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  { matcher: /heartfelt|gratitude|thank/i, className: 'bg-rose-100 text-rose-700 border border-rose-200' },
  { matcher: /celebrat|festiv|party/i, className: 'bg-purple-100 text-purple-700 border border-purple-200' },
  { matcher: /support|encourag|comfort/i, className: 'bg-sky-100 text-sky-700 border border-sky-200' },
  { matcher: /transform|journey|growth/i, className: 'bg-amber-100 text-amber-700 border border-amber-200' },
];

const DEFAULT_TONE_BADGE = 'bg-slate-100 text-slate-700 border border-slate-200';

function getToneBadgeClass(label: string): string {
  for (const entry of TONE_BADGE_STYLES) {
    if (entry.matcher.test(label)) {
      return entry.className;
    }
  }
  return DEFAULT_TONE_BADGE;
}

const TestimonialListItem: React.FC<{ testimonial: Testimonial }> = ({ testimonial }) => {
  const toneLabel = testimonial.toneLabel?.trim() || '';
  const toneConfidence =
    typeof testimonial.toneConfidence === 'number'
      ? Math.round(Math.max(0, Math.min(1, testimonial.toneConfidence)) * 100)
      : null;
  const toneBadgeClass = toneLabel ? getToneBadgeClass(toneLabel) : '';

  return (
    <article className="rounded-2xl border border-[#F25129]/20 bg-white/80 p-6 shadow-lg transition-all hover:shadow-xl hover:border-[#F25129]/40">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex-1">
          {toneLabel ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${toneBadgeClass}`}
            >
              {toneLabel}
              {toneConfidence !== null && (
                <span className="text-[10px] font-medium opacity-80">{toneConfidence}%</span>
              )}
            </span>
          ) : (
            <span className="text-sm font-semibold uppercase tracking-wide text-gray-400">Testimonial</span>
          )}
        </div>
        <div className="flex gap-1 text-[#FFC107]">
          {Array.from({ length: Math.round(testimonial.rating || 0) }).map((_, index) => (
            <Star key={index} className="h-4 w-4 fill-current" />
          ))}
        </div>
      </div>

      {testimonial.highlight && (
        <div className="mb-4 rounded-lg bg-[#F25129]/10 px-3 py-1.5">
          <p className="text-xs font-semibold text-[#F25129]">{testimonial.highlight}</p>
        </div>
      )}

      <div className="mb-4">
        <Quote className="mb-2 h-6 w-6 text-[#F25129]/40" />
        <p className="text-lg font-medium leading-relaxed text-gray-800">{testimonial.quote}</p>
      </div>

      <footer className="border-t border-dashed border-[#F25129]/30 pt-4 text-sm text-gray-600">
        <span className="font-semibold text-gray-900">{testimonial.displayName}</span>
        {testimonial.publishedAt instanceof Date && (
          <span className="ml-2 text-xs uppercase tracking-wide text-gray-400">
            {testimonial.publishedAt.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
        )}
      </footer>
    </article>
  );
};

const Testimonials: React.FC = () => {
  const isBrowser = typeof window !== 'undefined';
  const HelmetWrapper = useMemo(() => {
    return ({ children }: { children?: React.ReactNode }) =>
      isBrowser ? <Helmet>{children}</Helmet> : <>{children}</>;
  }, [isBrowser]);

  const MotionlessDiv = useMemo(
    () =>
      ({ children, ...rest }: any) => {
        const { initial, animate, exit, transition, variants, whileInView, viewport, ...clean } = rest;
        return <div {...clean}>{children}</div>;
      },
    []
  );
  const Motion = isBrowser ? motion : { div: MotionlessDiv };

  const { currentUser } = useAuth();
  const [showForm, setShowForm] = useState(false);

  const {
    testimonials: publishedTestimonials,
    loading: loadingTestimonials,
    error: testimonialsError,
  } = useTestimonials({
    statuses: ['published'],
    orderByField: 'publishedAt',
    orderDirection: 'desc',
    prioritizeFeatured: true,
  });

  const handleFormSubmitted = () => {
    setShowForm(false);
  };

  return (
    <>
      <HelmetWrapper>
        <title>Testimonials - Moms Fitness Mojo</title>
        <meta
          name="description"
          content="Read real stories from moms in the Moms Fitness Mojo community. See how our fitness community is making a difference in moms' lives."
        />
        <meta property="og:title" content="Testimonials - Moms Fitness Mojo" />
        <meta
          property="og:description"
          content="Read real stories from moms in the Moms Fitness Mojo community."
        />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Testimonials - Moms Fitness Mojo" />
        <meta
          name="twitter:description"
          content="Read real stories from moms in the Moms Fitness Mojo community."
        />
      </HelmetWrapper>

      <div className="min-h-screen bg-gradient-to-b from-white via-white to-[#F25129]/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          {/* Header Section */}
          <Motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8 sm:mb-12"
          >
            <div className="flex items-center justify-center gap-4 mb-4 flex-wrap">
              <h1
                className="text-3xl md:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent"
                tabIndex={-1}
              >
                What Moms Are Saying
              </h1>
              {currentUser && (
                <button
                  onClick={() => setShowForm(!showForm)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-full font-semibold hover:from-[#E0451F] hover:to-[#E55A2B] transition-all shadow-md hover:shadow-lg transform hover:scale-105"
                >
                  <MessageSquare className="w-4 h-4" />
                  {showForm ? 'Hide Form' : 'Share Your Story'}
                </button>
              )}
            </div>
            <p className="mx-auto max-w-2xl text-base text-gray-600">
              Real words from the women shaping Moms Fitness Mojo. Scroll through our community stories. Feeling inspired?{' '}
              {currentUser ? (
                <button
                  onClick={() => setShowForm(true)}
                  className="font-semibold text-[#F25129] hover:underline"
                >
                  Share Your Story.
                </button>
              ) : (
                <span className="font-semibold text-gray-800">&ldquo;Share Your Story.&rdquo;</span>
              )}
            </p>
          </Motion.div>

          {/* Submission Form Section */}
          {showForm && currentUser && (
            <Motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-8"
            >
              <TestimonialSubmissionForm onSubmitted={handleFormSubmitted} />
            </Motion.div>
          )}

          {/* Testimonials List */}
          <div className="space-y-6">
            {loadingTestimonials ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#F25129]" />
                <span className="ml-3 text-gray-600">Loading testimonials...</span>
              </div>
            ) : testimonialsError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
                <p className="text-red-800">
                  Unable to load testimonials. Please try refreshing the page.
                </p>
              </div>
            ) : publishedTestimonials.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#F25129]/30 bg-white/80 p-12 text-center">
                <Quote className="mx-auto h-12 w-12 text-[#F25129]/40 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No testimonials yet</h3>
                <p className="text-gray-600 mb-4">
                  Be the first to share your experience with Moms Fitness Mojo!
                </p>
                {currentUser ? (
                  <button
                    onClick={() => setShowForm(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-full font-semibold hover:from-[#E0451F] hover:to-[#E55A2B] transition-all shadow-md hover:shadow-lg"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Share Your Story
                  </button>
                ) : (
                  <a
                    href="/login"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-full font-semibold hover:from-[#E0451F] hover:to-[#E55A2B] transition-all shadow-md hover:shadow-lg"
                  >
                    Sign in to share your story
                  </a>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {publishedTestimonials.map((testimonial, index) => (
                  <Motion.div
                    key={testimonial.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                  >
                    <TestimonialListItem testimonial={testimonial} />
                  </Motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Submission Form at Bottom (if not shown at top) */}
          {!showForm && (
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-12"
            >
              <TestimonialSubmissionForm onSubmitted={handleFormSubmitted} />
            </Motion.div>
          )}
        </div>
      </div>
    </>
  );
};

export default Testimonials;

