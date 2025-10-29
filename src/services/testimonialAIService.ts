import { getFunctions, httpsCallable } from 'firebase/functions';

export interface TestimonialSuggestion {
  text: string;
}

export interface GenerateSuggestionsInput {
  prompt?: string;
  userContext?: string;
  highlight?: string;
}

export interface GenerateSuggestionsResult {
  success: boolean;
  suggestions?: string[];
  error?: string;
}

/**
 * Generate AI-powered testimonial suggestions using Google Gemini
 * 
 * Usage:
 * ```typescript
 * const result = await generateTestimonialSuggestions({
 *   prompt: "I love the Saturday morning workouts",
 *   userContext: "Member for 2 years, attended 15 events",
 *   highlight: "Favorite: Tennis sessions"
 * });
 * 
 * if (result.success) {
 *   console.log(result.suggestions); // Array of 2-3 testimonial options
 * }
 * ```
 */
export async function generateTestimonialSuggestions(
  input: GenerateSuggestionsInput
): Promise<GenerateSuggestionsResult> {
  try {
    // Use us-east1 region to match the deployed function
    const functions = getFunctions(undefined, 'us-east1');
    const generateSuggestions = httpsCallable<GenerateSuggestionsInput, GenerateSuggestionsResult>(
      functions,
      'generateTestimonialSuggestions'
    );

    const result = await generateSuggestions(input);
    return result.data;
  } catch (error: any) {
    console.error('[testimonialAIService] Error calling Cloud Function:', error);
    return {
      success: false,
      error: error?.message || 'Failed to connect to AI service. Please try again.'
    };
  }
}

