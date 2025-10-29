import React, { useEffect, useMemo, useState } from 'react';
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

  // Check if testimonial is truncated (roughly > 200 chars or > 4 lines)
  const isTruncated = (quote: string) => {
    return quote.length > 200;
  };

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
          {slides[currentSlide]?.map((testimonial) => {
            const truncated = isTruncated(testimonial.quote);
            return (
              <article
                key={testimonial.id}
                className={`h-full rounded-2xl border border-[#F25129]/20 bg-white/80 p-6 shadow-lg transition-all ${
                  truncated 
                    ? 'hover:shadow-xl hover:scale-[1.02] hover:border-[#F25129]/40' 
                    : 'hover:shadow-xl'
                }`}
              >
                <div className="mb-3 flex items-center justify-between text-[#F25129]">
                  <Quote className="h-6 w-6 opacity-70" />
                  <div className="flex gap-1 text-[#FFC107]">
                    {Array.from({ length: Math.round(testimonial.rating || 0) }).map((_, index) => (
                      <Star key={index} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                </div>

                {/* Highlight at the top */}
                {testimonial.highlight && (
                  <div className="mb-3 rounded-lg bg-[#F25129]/10 px-3 py-1.5">
                    <p className="text-xs font-semibold text-[#F25129]">{testimonial.highlight}</p>
                  </div>
                )}

                {/* Quote with inline "read more" - blends at end of truncated text */}
                <div className="relative mb-3 min-h-[6rem]">
                  <p 
                    className="text-lg font-medium text-gray-800 leading-relaxed"
                    style={{
                      display: truncated ? '-webkit-box' : 'block',
                      WebkitLineClamp: truncated ? 4 : 'none',
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      wordBreak: 'break-word',
                      position: 'relative'
                    }}
                  >
                    "{testimonial.quote}"
                  </p>
                  {truncated && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleCardClick(testimonial);
                      }}
                      className="absolute bottom-0 right-0 inline-block text-[#F25129] font-semibold cursor-pointer hover:underline whitespace-nowrap z-10"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCardClick(testimonial);
                        }
                      }}
                      style={{
                        background: 'linear-gradient(to right, transparent 0%, white 15%, white 100%)',
                        paddingLeft: '0.5rem',
                        paddingRight: '0.25rem'
                      }}
                    >
                      ... see more
                    </button>
                  )}
                </div>

                <footer className="mt-4 border-t border-dashed border-[#F25129]/30 pt-4 text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{testimonial.displayName}</span>
                  {testimonial.publishedAt instanceof Date && (
                    <span className="ml-2 text-xs uppercase tracking-wide text-gray-400">
                      {testimonial.publishedAt.toLocaleDateString()}
                    </span>
                  )}
                </footer>
              </article>
            );
          })}
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