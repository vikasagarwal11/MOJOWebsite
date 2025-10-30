import { getFunctions, httpsCallable } from 'firebase/functions';

export interface generatePostSuggestionsV2Input {
  prompt: string;
  userContext?: string;
  postType?: string;
}

export interface generatePostSuggestionsV2Result {
  success: boolean;
  suggestions?: string[];
  error?: string;
}

/**
 * Generate AI-powered post suggestions using Google Gemini or OpenAI
 * 
 * Usage:
 * ```typescript
 * const result = await generatePostSuggestionsV2({
 *   prompt: "I want to share my fitness progress",
 *   userContext: "Member for 1 year",
 *   postType: "progress update"
 * });
 * 
 * if (result.success) {
 *   console.log(result.suggestions); // Array of 2-3 post options
 * }
 * ```
 */
export async function generatePostSuggestionsV2(
  input: generatePostSuggestionsV2Input
): Promise<generatePostSuggestionsV2Result> {
  try {
    // Use us-east1 region to match the deployed function
    const functions = getFunctions(undefined, 'us-east1');
    const generateSuggestions = httpsCallable<generatePostSuggestionsV2Input, generatePostSuggestionsV2Result>(
      functions,
      'generatePostSuggestionsV2'
    );

    const result = await generateSuggestions(input);
    return result.data;
  } catch (error: any) {
    console.error('[postAIService] Error calling Cloud Function:', error);
    return {
      success: false,
      error: error?.message || 'Failed to connect to AI service. Please try again.'
    };
  }
}

// Backward-compatible alias used by older UI code
export const generatePostSuggestions = generatePostSuggestionsV2;

