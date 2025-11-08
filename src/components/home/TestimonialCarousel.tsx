import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Quote, Star, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { Testimonial } from '../../types';

interface TestimonialCarouselProps {
  testimonials: Testimonial[];
  loading?: boolean;
  error?: Error | null;
}

const AUTO_ADVANCE_MS = 10000; // Slower carousel - 10 seconds per slide
const MAX_VISIBLE_LINES = 4;

const DEFAULT_TONE_BADGE =
  'bg-slate-100 text-slate-700 border border-slate-200';

const TONE_BADGE_STYLES: { matcher: RegExp; className: string }[] = [
  { matcher: /empower|strong|confiden/i, className: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  { matcher: /motivat|energ/i, className: 'bg-orange-100 text-orange-700 border border-orange-200' },
  { matcher: /heartfelt|gratitude|thank/i, className: 'bg-rose-100 text-rose-700 border border-rose-200' },
  { matcher: /celebrat|festiv|party/i, className: 'bg-purple-100 text-purple-700 border border-purple-200' },
  { matcher: /support|encourag|comfort/i, className: 'bg-sky-100 text-sky-700 border border-sky-200' },
  { matcher: /transform|journey|growth/i, className: 'bg-amber-100 text-amber-700 border border-amber-200' },
];

const HEURISTIC_SETS: Array<{ label: string; keywords: string[] }> = [
  { label: 'Empowering', keywords: ['strong', 'power', 'bold', 'fearless', 'challenge', 'confident'] },
  { label: 'Motivational', keywords: ['motivat', 'inspir', 'drive', 'energ', 'momentum', 'push'] },
  { label: 'Heartfelt', keywords: ['grateful', 'thank', 'heart', 'love', 'gratitude', 'appreciat'] },
  { label: 'Celebratory', keywords: ['celebrat', 'party', 'dance', 'festive', 'gala', 'confetti'] },
  { label: 'Supportive', keywords: ['support', 'together', 'community', 'encourag', 'sisterhood', 'accountability'] },
  { label: 'Transformational', keywords: ['transform', 'journey', 'progress', 'growth', 'milestone', 'change'] },
];

function getToneBadgeClass(label: string): string {
  for (const entry of TONE_BADGE_STYLES) {
    if (entry.matcher.test(label)) {
      return entry.className;
    }
  }
  return DEFAULT_TONE_BADGE;
}

function heuristicToneFromQuote(quote: string): { label: string; confidence: number | null } {
  const lower = (quote || '').toLowerCase();
  if (!lower) return { label: 'Heartfelt', confidence: null };

  let bestEntry = HEURISTIC_SETS[2]; // Heartfelt
  let bestScore = 0;

  for (const entry of HEURISTIC_SETS) {
    const matches = entry.keywords.filter((keyword) => lower.includes(keyword));
    const score = matches.length / Math.max(1, entry.keywords.length);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  const confidence = bestScore > 0 ? Math.max(0.35, Math.min(0.85, bestScore + 0.35)) : null;
  return { label: bestEntry.label, confidence };
}

const TestimonialCard: React.FC<{
  testimonial: Testimonial;
  onOpen: (testimonial: Testimonial) => void;
}> = ({ testimonial, onOpen }) => {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;

    const checkOverflow = () => {
      if (!element) return;
      const hasOverflow = element.scrollHeight - 1 > element.clientHeight;
      setIsOverflowing(hasOverflow);
    };

    checkOverflow();

    const resizeObserver = new ResizeObserver(() => checkOverflow());
    resizeObserver.observe(element);

    let cancelled = false;
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', checkOverflow);
      const docFonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      docFonts?.ready
        .then(() => {
          if (!cancelled) {
            checkOverflow();
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', checkOverflow);
      }
    };
  }, [testimonial.quote]);

  const toneLabelRaw = testimonial.toneLabel?.trim();
  const toneConfidenceRaw =
    typeof testimonial.toneConfidence === 'number'
      ? Math.max(0, Math.min(1, testimonial.toneConfidence))
      : undefined;

  const derivedTone = useMemo(() => {
    if (toneLabelRaw) {
      return {
        label: toneLabelRaw,
        confidence: toneConfidenceRaw ?? null,
      };
    }
    return heuristicToneFromQuote(testimonial.quote || '');
  }, [testimonial.quote, toneLabelRaw, toneConfidenceRaw]);

  const toneLabel = derivedTone.label;
  const toneConfidence =
    derivedTone.confidence !== null && derivedTone.confidence !== undefined
      ? Math.round(derivedTone.confidence * 100)
      : null;
  const toneBadgeClass = toneLabel ? getToneBadgeClass(toneLabel) : '';

  return (
    <article
      className={`relative h-full overflow-hidden rounded-2xl border border-[#F25129]/20 bg-white/80 p-6 shadow-lg transition-all ${
        isOverflowing
          ? 'hover:shadow-xl hover:scale-[1.02] hover:border-[#F25129]/40'
          : 'hover:shadow-xl'
      }`}
    >
      <div className="relative mb-3 flex items-start justify-between">
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
        <div className="ml-4 flex gap-1 text-[#FFC107]">
          {Array.from({ length: Math.round(testimonial.rating || 0) }).map((_, index) => (
            <Star key={index} className="h-4 w-4 fill-current" />
          ))}
        </div>
      </div>

      {testimonial.highlight && (
        <div className="relative z-10 mb-3 rounded-lg bg-[#F25129]/10 px-3 py-1.5">
          <p className="text-xs font-semibold text-[#F25129]">{testimonial.highlight}</p>
        </div>
      )}

      <div className="relative z-10 mb-3 min-h-[6rem]">
        <p
          ref={textRef}
          className="text-lg font-medium leading-relaxed text-gray-800"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: MAX_VISIBLE_LINES,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {testimonial.quote}
        </p>
        {isOverflowing && (
          <>
            <div
              className="pointer-events-none absolute bottom-0 right-0 h-6 w-28"
              style={{
                background:
                  'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.85) 30%, rgba(255,255,255,1) 100%)',
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpen(testimonial);
              }}
              className="absolute bottom-0 right-2 text-sm font-semibold text-[#F25129] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F25129]/40 focus-visible:ring-offset-2"
              aria-label="Read full testimonial"
            >
              Read full story →
            </button>
          </>
        )}
      </div>

      <footer className="relative z-10 mt-4 border-t border-dashed border-[#F25129]/30 pt-4 text-sm text-gray-600">
        <span className="font-semibold text-gray-900">{testimonial.displayName}</span>
        {testimonial.publishedAt instanceof Date && (
          <span className="ml-2 text-xs uppercase tracking-wide text-gray-400">
            {testimonial.publishedAt.toLocaleDateString()}
          </span>
        )}
      </footer>
    </article>
  );
};

function calculateItemsPerSlide(width: number): number {
  if (width >= 1280) return 3;
  if (width >= 768) return 2;
  return 1;
}

export const TestimonialCarousel: React.FC<TestimonialCarouselProps> = ({ testimonials, loading = false, error = null }) => {
  const [itemsPerSlide, setItemsPerSlide] = useState(() =>
    typeof window !== 'undefined' ? calculateItemsPerSlide(window.innerWidth) : 1
  );
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedTestimonial, setSelectedTestimonial] = useState<Testimonial | null>(null);

  useEffect(() => {
    const handleResize = () => setItemsPerSlide(calculateItemsPerSlide(window.innerWidth));
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const slides = useMemo(() => {
    if (!testimonials.length) {
      return [] as Testimonial[][];
    }

    const chunkSize = Math.max(1, itemsPerSlide);
    const result: Testimonial[][] = [];

    for (let i = 0; i < testimonials.length; i += chunkSize) {
      result.push(testimonials.slice(i, i + chunkSize));
    }

    return result;
  }, [testimonials, itemsPerSlide]);

  useEffect(() => {
    setCurrentSlide(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;

    const interval = window.setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(interval);
  }, [slides.length]);

  const handlePrev = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % Math.max(1, slides.length));
  };

  const handleNext = () => {
    setCurrentSlide((prev) => (prev + 1) % Math.max(1, slides.length));
  };

  const handleCardClick = (testimonial: Testimonial) => {
    setSelectedTestimonial(testimonial);
  };

  const handleCloseModal = () => {
    setSelectedTestimonial(null);
  };

  // Close modal on ESC key
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseModal();
      }
    };
    if (selectedTestimonial) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden'; // Prevent body scroll when modal is open
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [selectedTestimonial]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {[...Array(Math.min(3, Math.max(1, itemsPerSlide)))].map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-2xl border border-[#F25129]/10 bg-white/60 p-6 shadow-inner"
          >
            <div className="mb-4 h-5 w-24 rounded-full bg-gray-200" />
            <div className="mb-3 h-4 w-full rounded-full bg-gray-100" />
            <div className="mb-3 h-4 w-5/6 rounded-full bg-gray-100" />
            <div className="h-4 w-2/3 rounded-full bg-gray-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-600">
        We couldn’t load testimonials right now. Please try again later.
      </div>
    );
  }

  if (!slides.length) {
    return (
      <div className="rounded-xl border border-dashed border-[#F25129]/40 bg-white/70 p-6 text-center text-gray-600">
        Be the first to share your experience with Moms Fitness Mojo!
      </div>
    );
  }

  const gridColumns = (() => {
    if (itemsPerSlide >= 3) return 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6';
    if (itemsPerSlide === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-6';
    return 'grid grid-cols-1 gap-6';
  })();

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSlide}
          className={gridColumns}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.45 }}
        >
          {slides[currentSlide]?.map((testimonial) => (
            <TestimonialCard
              key={testimonial.id}
              testimonial={testimonial}
              onOpen={handleCardClick}
            />
          ))}
        </motion.div>
      </AnimatePresence>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 rounded-full bg-white p-2 shadow-lg ring-1 ring-[#F25129]/30 transition hover:-translate-x-6 hover:bg-[#F25129] hover:text-white"
            aria-label="Previous testimonials"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-5 rounded-full bg-white p-2 shadow-lg ring-1 ring-[#F25129]/30 transition hover:translate-x-6 hover:bg-[#F25129] hover:text-white"
            aria-label="Next testimonials"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="mt-6 flex justify-center gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentSlide(index)}
                className={`h-2 w-8 rounded-full transition ${
                  currentSlide === index ? 'bg-[#F25129]' : 'bg-[#F25129]/20 hover:bg-[#F25129]/40'
                }`}
                aria-label={`Go to testimonials slide ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Testimonial Detail Modal */}
      {selectedTestimonial && createPortal(
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedTestimonial.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={handleCloseModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10"
              role="dialog"
              aria-modal="true"
              aria-labelledby="testimonial-title"
            >
              {/* Close Button */}
              <button
                onClick={handleCloseModal}
                className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-gray-400 shadow-lg backdrop-blur-sm transition hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#F25129]"
                aria-label="Close testimonial"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Content */}
              <div className="overflow-y-auto max-h-[90vh] p-8">
                <div className="mb-6 flex items-center justify-between text-[#F25129]">
                  <Quote className="h-8 w-8 opacity-70" />
                  <div className="flex gap-1 text-[#FFC107]">
                    {Array.from({ length: Math.round(selectedTestimonial.rating || 0) }).map((_, index) => (
                      <Star key={index} className="h-5 w-5 fill-current" />
                    ))}
                  </div>
                </div>

                <blockquote className="mb-6 text-xl font-medium leading-relaxed text-gray-800">
                  "{selectedTestimonial.quote}"
                </blockquote>

                {selectedTestimonial.highlight && (
                  <div className="mb-6 rounded-lg bg-[#F25129]/10 p-4">
                    <p className="text-sm font-semibold text-[#F25129]">{selectedTestimonial.highlight}</p>
                  </div>
                )}

                <footer className="border-t border-dashed border-[#F25129]/30 pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-semibold text-gray-900">{selectedTestimonial.displayName}</p>
                      {selectedTestimonial.publishedAt instanceof Date && (
                        <p className="mt-1 text-sm text-gray-500">
                          Published {selectedTestimonial.publishedAt.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      )}
                    </div>
                    {selectedTestimonial.avatarUrl && (
                      <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-[#F25129]/20">
                        <img
                          src={selectedTestimonial.avatarUrl}
                          alt={selectedTestimonial.displayName}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                  </div>
                </footer>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default TestimonialCarousel;