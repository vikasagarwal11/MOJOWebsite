import React, { useMemo, useState } from 'react';
import { Sparkles, Loader2, X, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { submitTestimonial } from '../../services/testimonialsService';
import { useTestimonials } from '../../hooks/useTestimonials';
import { generateTestimonialSuggestions } from '../../services/testimonialAIService';
import toast from 'react-hot-toast';

const MAX_QUOTE_LENGTH = 200; // ~3-4 lines - optimal for carousel display
const MIN_QUOTE_LENGTH = 40;

const ratingOptions = [5, 4, 3, 2, 1];

interface TestimonialSubmissionFormProps {
  onSubmitted?: () => void;
}

export const TestimonialSubmissionForm: React.FC<TestimonialSubmissionFormProps> = ({ onSubmitted }) => {
  const { currentUser } = useAuth();
  const [quote, setQuote] = useState('');
  const [highlight, setHighlight] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // AI suggestions state
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const userId = currentUser?.id;

  const { testimonials: myTestimonials, loading: loadingMyTestimonials } = useTestimonials({
    userId,
    orderByField: 'updatedAt',
    orderDirection: 'desc',
    prioritizeFeatured: false,
    limit: 5,
    disabled: !userId,
  });

  const hasPending = useMemo(
    () => myTestimonials.some((testimonial) => testimonial.status === 'pending'),
    [myTestimonials]
  );

  const pendingCount = myTestimonials.filter((testimonial) => testimonial.status === 'pending').length;

  if (!currentUser) {
    return (
      <div className="mt-12 rounded-2xl border border-dashed border-[#F25129]/30 bg-white/80 p-8 text-center text-gray-700">
        <h3 className="text-xl font-semibold text-gray-900">Share your story</h3>
        <p className="mt-2">
          Sign in to share your experience with Moms Fitness Mojo. Your testimonial helps other moms discover the community.
        </p>
        <a
          href="/login"
          className="mt-4 inline-flex items-center justify-center rounded-full bg-[#F25129] px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[#E0451F]"
        >
          Sign in to share your story
        </a>
      </div>
    );
  }

  const handleGenerateSuggestions = async () => {
    if (!currentUser) {
      toast.error('Please sign in to use AI suggestions');
      return;
    }

    setIsGenerating(true);
    setSuggestions([]);
    setShowSuggestions(true);

    try {
      // Build user context
      const userContext = currentUser.displayName 
        ? `${currentUser.displayName}${currentUser.email ? ` (${currentUser.email})` : ''}`
        : undefined;

      // Use current quote or placeholder prompt
      const prompt = quote.trim() || 'I want to share my positive experience with Moms Fitness Mojo community';

      const result = await generateTestimonialSuggestions({
        prompt,
        userContext,
        highlight: highlight.trim() || undefined
      });

      if (result.success && result.suggestions && result.suggestions.length > 0) {
        setSuggestions(result.suggestions);
        toast.success(`Generated ${result.suggestions.length} suggestions!`);
      } else {
        toast.error(result.error || 'Failed to generate suggestions. Please try writing your own.');
        setShowSuggestions(false);
      }
    } catch (error: any) {
      console.error('[TestimonialSubmissionForm] Error generating suggestions:', error);
      toast.error('Something went wrong. Please try again or write your own testimonial.');
      setShowSuggestions(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseSuggestion = (suggestion: string) => {
    setQuote(suggestion);
    setShowSuggestions(false);
    setSuggestions([]);
    toast.success('Suggestion applied! You can edit it before submitting.');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (quote.trim().length < MIN_QUOTE_LENGTH) {
      toast.error(`Please share at least ${MIN_QUOTE_LENGTH} characters so others can feel your story.`);
      return;
    }

    try {
      setIsSubmitting(true);
      await submitTestimonial({
        userId: currentUser.id,
        displayName: currentUser.displayName || `${currentUser.firstName ?? 'Member'}`,
        quote: quote.trim(),
        rating,
        highlight: highlight.trim() ? highlight.trim() : undefined,
        avatarUrl: currentUser.photoURL || undefined,
      });

      toast.success('Thank you! Your testimonial is pending review.');
      setQuote('');
      setHighlight('');
      setRating(5);
      onSubmitted?.();
    } catch (error: any) {
      console.error('[TestimonialSubmissionForm] Failed to submit testimonial', error);
      toast.error(error?.message ?? 'Unable to submit testimonial. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <h3 className="text-2xl font-bold text-gray-900">Share your experience</h3>
          <p className="mt-2 text-sm text-gray-600">
            Tell other moms what you love about Moms Fitness Mojo. Testimonials appear after a quick admin review.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{rating}</span>
            <span className="text-xs font-medium text-gray-500">/ 5</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">RATING</span>
          </div>
          <select
            value={rating}
            onChange={(event) => setRating(Number(event.target.value) as typeof rating)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20 hover:border-gray-400 transition"
          >
            {ratingOptions.map((value) => (
              <option key={value} value={value}>
                {value} - {value === 5 ? 'Loved it' : value === 4 ? 'Great' : value === 3 ? 'Good' : value === 2 ? 'Okay' : 'Needs work'}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="testimonial-quote" className="text-sm font-medium text-gray-700">
              Your story <span className="text-[#F25129]">*</span>
            </label>
            <button
              type="button"
              onClick={() => {
                console.log('[TestimonialSubmissionForm] Help me write button clicked');
                handleGenerateSuggestions();
              }}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F25129] to-[#FFC107] px-5 py-2 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:from-[#E0451F] hover:to-[#E55A2B] hover:shadow-lg hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 z-10"
              style={{ minWidth: '140px', minHeight: '36px' }}
              data-testid="ai-help-button"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Help me write</span>
                </>
              )}
            </button>
          </div>
          <textarea
            id="testimonial-quote"
            required
            minLength={MIN_QUOTE_LENGTH}
            maxLength={MAX_QUOTE_LENGTH}
            value={quote}
            onChange={(event) => setQuote(event.target.value)}
            placeholder="Share how Moms Fitness Mojo has made a difference for you... Or click 'Help me write' for AI suggestions!"
            className="mt-2 w-full rounded-2xl border border-gray-200 bg-white/90 p-4 text-gray-800 shadow-inner focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
            rows={4}
          />
          <div className="mt-1 text-xs text-gray-500">
            {quote.length}/{MAX_QUOTE_LENGTH} characters (about 3-4 lines recommended for best display)
          </div>

          {/* AI Suggestions Display */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="mt-4 space-y-3 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-900">AI Suggestions</span>
                  <span className="text-xs text-purple-600">({suggestions.length} options)</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowSuggestions(false);
                    setSuggestions([]);
                  }}
                  className="rounded-full p-1 text-purple-400 hover:bg-purple-100 hover:text-purple-600 transition"
                  aria-label="Close suggestions"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleUseSuggestion(suggestion)}
                    className="w-full text-left rounded-lg border border-purple-200 bg-white p-3 hover:border-purple-300 hover:bg-purple-50 transition group"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-semibold">
                        {index + 1}
                      </span>
                      <p className="flex-1 text-sm text-gray-700 group-hover:text-purple-900">
                        "{suggestion}"
                      </p>
                      <Check className="h-4 w-4 text-purple-500 opacity-0 group-hover:opacity-100 transition" />
                    </div>
                    <div className="mt-2 text-xs text-purple-600">{suggestion.length} characters</div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-purple-600 italic">
                💡 Click any suggestion to use it, or write your own!
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="testimonial-highlight" className="text-sm font-medium text-gray-700">
            Highlight (optional)
          </label>
          <input
            id="testimonial-highlight"
            type="text"
            maxLength={120}
            value={highlight}
            onChange={(event) => setHighlight(event.target.value)}
            placeholder="e.g., Favorite event or support moment"
            className="mt-2 w-full rounded-xl border border-gray-200 bg-white/90 px-4 py-2.5 text-gray-800 shadow-inner focus:border-[#F25129] focus:outline-none focus:ring-2 focus:ring-[#F25129]/20"
          />
        </div>

        <div className="flex flex-col gap-4 border-t border-gray-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            {hasPending ? (
              <p className="text-sm text-[#F25129] font-medium">
                You have {pendingCount} testimonial{pendingCount === 1 ? '' : 's'} awaiting approval. We'll notify you once it's published.
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                Testimonials are reviewed before they appear on the homepage. Thank you for sharing your voice!
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={isSubmitting || quote.trim().length < MIN_QUOTE_LENGTH}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#F25129] to-[#FFC107] px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:from-[#E0451F] hover:to-[#E55A2B] hover:shadow-lg disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-400 disabled:hover:from-gray-300 disabled:hover:to-gray-400"
          >
            {isSubmitting ? 'Submitting…' : 'Submit testimonial'}
          </button>
        </div>
      </form>

      {userId && !loadingMyTestimonials && myTestimonials.length > 0 && (
        <div className="mt-6 rounded-2xl bg-gray-50/80 p-4 text-sm text-gray-600">
          <h4 className="mb-3 font-semibold text-gray-800">Recent submissions</h4>
          <ul className="space-y-2">
            {myTestimonials.slice(0, 3).map((testimonial) => (
              <li key={testimonial.id} className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-2">
                <span className="line-clamp-1 text-gray-700">{testimonial.quote}</span>
                <span
                  className={`ml-3 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    testimonial.status === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : testimonial.status === 'published'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {testimonial.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TestimonialSubmissionForm;
