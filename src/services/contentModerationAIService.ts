import { getFunctions, httpsCallable } from 'firebase/functions';

export interface ContentModerationRequest {
  content: string;
  contentType: 'post' | 'media' | 'comment' | 'testimonial';
  userId?: string;
}

export interface ContentModerationResponse {
  requiresApproval: boolean;
  isBlocked: boolean;
  reason?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number; // 0-1
  detectedIssues: string[];
  aiAnalysis?: {
    negativePlatformMention: boolean;
    negativeAdminMention: boolean;
    negativeCommunityMention: boolean;
    overallSentiment: string;
    explanation: string;
  };
}

/**
 * AI-powered content moderation using Gemini
 * Analyzes content for negative sentiment about platform, admin, or community
 */
export async function moderateContentWithAI(
  request: ContentModerationRequest
): Promise<ContentModerationResponse> {
  try {
    const functions = getFunctions(undefined, 'us-east1');
    const moderateContent = httpsCallable<ContentModerationRequest, ContentModerationResponse>(
      functions,
      'moderateContent'
    );

    const result = await moderateContent(request);
    return result.data;
  } catch (error: any) {
    console.error('❌ [ContentModerationAI] Error calling moderation function:', error);
    
    // CRITICAL: On error, require approval instead of auto-approving
    // This prevents malicious content from slipping through during outages
    return {
      requiresApproval: true, // Changed from false - require approval on error
      isBlocked: false,
      sentiment: 'neutral',
      confidence: 0.3,
      detectedIssues: [],
      reason: 'Moderation service temporarily unavailable. Content will be reviewed manually.',
    };
  }
}

