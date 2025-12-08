import { HttpsError } from 'firebase-functions/v2/https';
import { onCall } from 'firebase-functions/v2/https';

// CORS wrapper (matches pattern from index.ts)
const ALLOWED_CORS_ORIGINS = [
  'https://momsfitnessmojo.com',
  'https://www.momsfitnessmojo.com',
  'https://momsfitnessmojo-65d00.web.app',
  'https://momsfitnessmojo-65d00.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

function onCallWithCors<T = any, R = any>(
  opts: any,
  handler: (request: any) => R | Promise<R>
) {
  return onCall({
    ...opts,
    cors: ALLOWED_CORS_ORIGINS,
  }, handler);
}

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
export const moderateContent = onCallWithCors(
  {
    region: 'us-east1',
    memory: '1GiB',
    timeoutSeconds: 30,
  },
  async (request): Promise<ContentModerationResponse> => {
    const { content, contentType, userId } = request.data as ContentModerationRequest;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'Content is required and must be a non-empty string');
    }

    if (!contentType || !['post', 'media', 'comment', 'testimonial'].includes(contentType)) {
      throw new HttpsError('invalid-argument', 'contentType must be one of: post, media, comment, testimonial');
    }

    try {
      // Get Gemini API key
      let geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const functions = require('firebase-functions');
          const config = functions.config();
          geminiApiKey = config?.gemini?.api_key;
        } catch (error) {
          // functions.config() not available in v2
        }
      }

      if (!geminiApiKey) {
        console.warn('⚠️ [ContentModeration] GEMINI_API_KEY not configured, using fallback keyword matching');
        return fallbackModeration(content);
      }

      // Use AI sentiment analysis
      const aiResult = await analyzeContentWithGemini(content, contentType, geminiApiKey);
      
      // Combine AI analysis with keyword check for safety
      const keywordCheck = checkNegativeKeywords(content);
      
      // Determine final moderation decision
      const requiresApproval = aiResult.requiresApproval || keywordCheck.requiresApproval;
      const isBlocked = aiResult.isBlocked || keywordCheck.isBlocked || 
                       (aiResult.sentiment === 'negative' && aiResult.confidence > 0.7);

      return {
        requiresApproval,
        isBlocked,
        reason: isBlocked 
          ? 'Content contains negative sentiment about the platform, admin, or community and cannot be published.'
          : requiresApproval
          ? 'Content may require review before publication.'
          : undefined,
        sentiment: aiResult.sentiment,
        confidence: aiResult.confidence,
        detectedIssues: [...aiResult.detectedIssues, ...keywordCheck.detectedIssues],
        aiAnalysis: aiResult.aiAnalysis,
      };
    } catch (error: any) {
      console.error('❌ [ContentModeration] Error:', error);
      // Fallback to keyword-based moderation on error
      return fallbackModeration(content);
    }
  }
);

/**
 * Analyze content using Gemini AI for sentiment and negative mentions
 */
async function analyzeContentWithGemini(
  content: string,
  contentType: string,
  apiKey: string
): Promise<ContentModerationResponse> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    const modelsToTry = [
      'gemini-2.5-flash',
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash',
      'gemini-pro',
    ];

    const prompt = `You are a content moderation system for "Moms Fitness Mojo", a supportive fitness and lifestyle community for moms.

Analyze the following ${contentType} content and determine:
1. Overall sentiment (positive, neutral, or negative)
2. Whether it contains negative comments about:
   - The platform/website ("Moms Fitness Mojo", "platform", "website", "app")
   - Administrators ("admin", "admins", "moderators", "staff")
   - The community ("community", "members", "group")
3. Confidence level (0.0 to 1.0)

CRITICAL: Flag content that:
- Criticizes or complains about the platform, admin, or community
- Contains negative sentiment directed at the organization
- Uses inappropriate language or tone

Return ONLY valid JSON in this exact format:
{
  "sentiment": "positive" | "neutral" | "negative",
  "confidence": 0.0-1.0,
  "negativePlatformMention": true/false,
  "negativeAdminMention": true/false,
  "negativeCommunityMention": true/false,
  "overallSentiment": "brief explanation",
  "explanation": "why this content should or should not be approved"
}

CONTENT TO ANALYZE:
"""${content.trim()}"""`;

    let lastError: Error | null = null;
    for (const modelName of modelsToTry) {
      try {
        console.log(`🤖 [ContentModeration] Trying Gemini model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1, // Low temperature for consistent moderation
            maxOutputTokens: 500,
          },
        });

        const response = result.response;
        const text = response.text().trim();
        
        // Parse JSON response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
          sentiment?: string;
          confidence?: number;
          negativePlatformMention?: boolean;
          negativeAdminMention?: boolean;
          negativeCommunityMention?: boolean;
          overallSentiment?: string;
          explanation?: string;
        };

        const hasNegativeMention = 
          parsed.negativePlatformMention === true ||
          parsed.negativeAdminMention === true ||
          parsed.negativeCommunityMention === true;

        const sentiment = (parsed.sentiment || 'neutral').toLowerCase();
        const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));

        const detectedIssues: string[] = [];
        if (parsed.negativePlatformMention) detectedIssues.push('Negative platform mention');
        if (parsed.negativeAdminMention) detectedIssues.push('Negative admin mention');
        if (parsed.negativeCommunityMention) detectedIssues.push('Negative community mention');
        if (sentiment === 'negative' && confidence > 0.6) detectedIssues.push('Overall negative sentiment');

        const requiresApproval = hasNegativeMention || (sentiment === 'negative' && confidence > 0.5);
        const isBlocked = hasNegativeMention && confidence > 0.7;

        console.log(`✅ [ContentModeration] Analysis complete:`, {
          sentiment,
          confidence,
          requiresApproval,
          isBlocked,
          hasNegativeMention,
        });

        return {
          requiresApproval,
          isBlocked,
          sentiment: sentiment as 'positive' | 'neutral' | 'negative',
          confidence,
          detectedIssues,
          aiAnalysis: {
            negativePlatformMention: parsed.negativePlatformMention || false,
            negativeAdminMention: parsed.negativeAdminMention || false,
            negativeCommunityMention: parsed.negativeCommunityMention || false,
            overallSentiment: parsed.overallSentiment || sentiment,
            explanation: parsed.explanation || 'No explanation provided',
          },
        };
      } catch (modelError: any) {
        lastError = modelError;
        console.warn(`⚠️ [ContentModeration] Model ${modelName} failed:`, modelError?.message);
        continue;
      }
    }

    // If all models failed, throw error
    throw lastError || new Error('All Gemini models failed');
  } catch (error: any) {
    console.error('❌ [ContentModeration] Gemini analysis failed:', error);
    throw error;
  }
}

/**
 * Fallback keyword-based moderation (used when AI is unavailable)
 */
function fallbackModeration(content: string): ContentModerationResponse {
  const keywordCheck = checkNegativeKeywords(content);
  
  return {
    requiresApproval: keywordCheck.requiresApproval,
    isBlocked: keywordCheck.isBlocked,
    reason: keywordCheck.reason,
    sentiment: keywordCheck.isBlocked ? 'negative' : 'neutral',
    confidence: keywordCheck.detectedIssues.length > 0 ? 0.6 : 0.3,
    detectedIssues: keywordCheck.detectedIssues,
  };
}

/**
 * Check for negative keywords (fallback method)
 */
function checkNegativeKeywords(content: string): {
  requiresApproval: boolean;
  isBlocked: boolean;
  reason?: string;
  detectedIssues: string[];
} {
  const negativeKeywords = [
    'admin is', 'admins are', 'admin sucks', 'admin terrible', 'admin bad',
    'platform is bad', 'platform sucks', 'platform terrible', 'worst platform',
    'mojo is bad', 'mojo sucks', 'mojo terrible', 'hate mojo', 'mojo worst',
    'community is bad', 'community sucks', 'community terrible', 'hate community',
    'worst community', 'community worst', 'bad community',
    'hate this', 'hate that', 'terrible experience', 'worst experience',
    'awful', 'horrible', 'disgusting', 'ridiculous', 'stupid',
  ];

  const lowerContent = content.toLowerCase();
  const detectedIssues: string[] = [];
  
  for (const keyword of negativeKeywords) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      detectedIssues.push(`Contains negative keyword: "${keyword}"`);
    }
  }

  const negativePatterns = [
    /(admin|platform|mojo|community)\s+(is|are|was|were)\s+(bad|terrible|awful|horrible|worst|sucks)/i,
    /(hate|dislike|despise)\s+(admin|platform|mojo|community|this|that)/i,
    /(worst|terrible|awful|horrible)\s+(admin|platform|mojo|community|experience)/i,
  ];

  for (const pattern of negativePatterns) {
    if (pattern.test(content)) {
      detectedIssues.push('Matches negative content pattern');
      break;
    }
  }

  const isBlocked = detectedIssues.length >= 3;
  const requiresApproval = detectedIssues.length > 0;

  return {
    requiresApproval,
    isBlocked,
    reason: isBlocked
      ? 'Content contains inappropriate language or negative comments about the platform, admin, or community.'
      : detectedIssues.length > 0
      ? 'Content may require review before publication.'
      : undefined,
    detectedIssues,
  };
}

