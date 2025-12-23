import vision from '@google-cloud/vision';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export type ModerationContentType = 'post' | 'media' | 'comment' | 'testimonial';

export interface ModerationVerdict {
  requiresApproval: boolean;
  isBlocked: boolean;
  reason?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  detectedIssues: string[];
  aiAnalysis?: {
    negativePlatformMention: boolean;
    negativeAdminMention: boolean;
    negativeCommunityMention: boolean;
    overallSentiment: string;
    explanation: string;
  };
}

const NEGATIVE_KEYWORDS = [
  'admin is', 'admins are', 'admin sucks', 'admin terrible', 'admin bad',
  'platform is bad', 'platform sucks', 'platform terrible', 'worst platform',
  'mojo is bad', 'mojo sucks', 'mojo terrible', 'hate mojo', 'mojo worst',
  'community is bad', 'community sucks', 'community terrible', 'hate community',
  'worst community', 'community worst', 'bad community',
  'hate this', 'hate that', 'terrible experience', 'worst experience',
  'awful', 'horrible', 'disgusting', 'ridiculous', 'stupid',
  'moderation is', 'moderators are', 'censorship', 'unfair',
];

const NEGATIVE_PATTERNS = [
  /(admin|platform|mojo|community)\s+(is|are|was|were)\s+(bad|terrible|awful|horrible|worst|sucks)/i,
  /(hate|dislike|despise)\s+(admin|platform|mojo|community|this|that)/i,
  /(worst|terrible|awful|horrible)\s+(admin|platform|mojo|community|experience)/i,
];

const TEXT_MODEL_PREFERENCE = [
  'gemini-2.5-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash',
  'gemini-pro',
];

let cachedVisionClient: any | null = null;

function getVisionClient() {
  if (!cachedVisionClient) {
    cachedVisionClient = new vision.ImageAnnotatorClient();
  }
  return cachedVisionClient;
}

export async function runTextModeration(
  content: string,
  contentType: ModerationContentType,
  userId?: string
): Promise<ModerationVerdict> {
  if (!content || content.trim().length === 0) {
    return {
      requiresApproval: false,
      isBlocked: false,
      sentiment: 'neutral',
      confidence: 0.3,
      detectedIssues: [],
    };
  }

  try {
    const result = await analyzeContentWithGemini(content, contentType);
    return result;
  } catch (error) {
    console.error('⚠️ [ModerationEngine] Text moderation failed, using fallback:', error);
    return fallbackModeration(content);
  }
}

async function analyzeContentWithGemini(
  content: string,
  contentType: ModerationContentType
): Promise<ModerationVerdict> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: Error | null = null;

  const prompt = `You are a content moderation system for "Moms Fitness Mojo", a supportive fitness community for moms.

Analyze the following ${contentType} content and determine:
1. Overall sentiment (positive, neutral, or negative)
2. Whether it contains negative comments about:
   - The platform/website ("Moms Fitness Mojo", "platform", "website", "app")
   - Administrators ("admin", "admins", "moderators", "staff")
   - The community ("community", "members", "group")
   - Individual members (harassment or bullying)
   - Hate speech, discrimination, self-harm encouragement, explicit or violent threats
3. Confidence level (0.0 to 1.0)

Return ONLY valid JSON in this format:
{
  "sentiment": "positive" | "neutral" | "negative",
  "confidence": 0.0-1.0,
  "negativePlatformMention": true/false,
  "negativeAdminMention": true/false,
  "negativeCommunityMention": true/false,
  "negativeMemberMention": true/false,
  "containsHateSpeech": true/false,
  "containsSelfHarm": true/false,
  "containsThreats": true/false,
  "containsProfanity": true/false,
  "overallSentiment": "brief explanation",
  "explanation": "why this content should or should not be approved"
}

CONTENT:
"""${content.trim()}"""`;

  for (const modelName of TEXT_MODEL_PREFERENCE) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
      });

      const text = response.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Gemini response missing JSON payload');
      }

      const data = JSON.parse(jsonMatch[0]);
      const sentiment = (data.sentiment || 'neutral').toLowerCase();
      const confidence = Number(data.confidence) || 0.5;
      const issues: string[] = [];

      if (data.negativePlatformMention) issues.push('Negative platform mention');
      if (data.negativeAdminMention) issues.push('Negative admin mention');
      if (data.negativeCommunityMention) issues.push('Negative community mention');
      if (data.negativeMemberMention) issues.push('Member harassment detected');
      if (data.containsHateSpeech) issues.push('Possible hate speech');
      if (data.containsSelfHarm) issues.push('Self-harm content');
      if (data.containsThreats) issues.push('Threatening language');
      if (data.containsProfanity) issues.push('Profanity detected');
      if (sentiment === 'negative' && confidence > 0.6) {
        issues.push('Overall negative sentiment');
      }

      const hasSevereIssue =
        Boolean(data.containsHateSpeech || data.containsSelfHarm || data.containsThreats) ||
        confidence > 0.8 && sentiment === 'negative';

      const requiresApproval = issues.length > 0 || sentiment === 'negative';
      const isBlocked = hasSevereIssue;

      return {
        requiresApproval,
        isBlocked,
        reason: isBlocked
          ? 'Content contains language that violates our community guidelines.'
          : requiresApproval
          ? 'Content requires review before publication.'
          : undefined,
        sentiment: ['positive', 'neutral', 'negative'].includes(sentiment)
          ? sentiment
          : 'neutral',
        confidence: Math.max(0, Math.min(1, confidence)),
        detectedIssues: issues,
        aiAnalysis: {
          negativePlatformMention: Boolean(data.negativePlatformMention),
          negativeAdminMention: Boolean(data.negativeAdminMention),
          negativeCommunityMention: Boolean(data.negativeCommunityMention),
          overallSentiment: data.overallSentiment || sentiment,
          explanation: data.explanation || 'No explanation provided',
        },
      };
    } catch (error: any) {
      lastError = error;
      console.warn(`⚠️ [ModerationEngine] Gemini model ${modelName} failed:`, error?.message);
      continue;
    }
  }

  throw lastError || new Error('Unable to process moderation request');
}

export function fallbackModeration(content: string): ModerationVerdict {
  const issues: string[] = [];
  const lower = content.toLowerCase();

  for (const keyword of NEGATIVE_KEYWORDS) {
    if (lower.includes(keyword)) {
      issues.push(`Contains negative keyword: "${keyword}"`);
    }
  }

  for (const pattern of NEGATIVE_PATTERNS) {
    if (pattern.test(content)) {
      issues.push('Matches negative content pattern');
    }
  }

  const isBlocked = issues.length >= 3;
  const requiresApproval = issues.length > 0 || isBlocked;

  return {
    requiresApproval,
    isBlocked,
    reason: isBlocked
      ? 'Content contains inappropriate language or negative comments.'
      : requiresApproval
      ? 'Content may require review before publication.'
      : undefined,
    sentiment: isBlocked ? 'negative' : 'neutral',
    confidence: issues.length > 0 ? 0.6 : 0.3,
    detectedIssues: issues,
  };
}

export interface MediaModerationResult {
  requiresApproval: boolean;
  isBlocked: boolean;
  detectedIssues: string[];
  reason?: string;
}

export async function analyzeMediaSafeSearch(
  filePath: string | undefined
): Promise<MediaModerationResult> {
  if (!filePath) {
    return { requiresApproval: true, isBlocked: false, detectedIssues: ['Missing file path'], reason: 'Media pending manual review.' };
  }

  try {
    const bucket = getStorage().bucket();
    const client = getVisionClient();
    const [result] = await client.safeSearchDetection(`gs://${bucket.name}/${filePath}`);
    const annotation = result.safeSearchAnnotation;

    if (!annotation) {
      return { requiresApproval: true, isBlocked: false, detectedIssues: ['No annotation'], reason: 'Media pending manual review.' };
    }

    const scores = {
      adult: annotation.adult || 'UNKNOWN',
      violence: annotation.violence || 'UNKNOWN',
      racy: annotation.racy || 'UNKNOWN',
      medical: annotation.medical || 'UNKNOWN',
      spoof: annotation.spoof || 'UNKNOWN',
    };

    const highRisk = ['VERY_LIKELY', 'LIKELY'];
    const mediumRisk = ['POSSIBLE'];

    const blockedIssues: string[] = [];
    const reviewIssues: string[] = [];

    if (highRisk.includes(scores.adult)) blockedIssues.push('Adult content detected');
    if (highRisk.includes(scores.violence)) blockedIssues.push('Violence detected');
    if (highRisk.includes(scores.racy)) blockedIssues.push('Racy content detected');

    if (mediumRisk.includes(scores.adult)) reviewIssues.push('Possible adult content');
    if (mediumRisk.includes(scores.violence)) reviewIssues.push('Possible violence');
    if (mediumRisk.includes(scores.racy)) reviewIssues.push('Possible racy content');
    if (highRisk.includes(scores.medical)) reviewIssues.push('Graphic medical content');

    if (blockedIssues.length > 0) {
      return {
        requiresApproval: true,
        isBlocked: true,
        detectedIssues: blockedIssues,
        reason: blockedIssues[0],
      };
    }

    if (reviewIssues.length > 0) {
      return {
        requiresApproval: true,
        isBlocked: false,
        detectedIssues: reviewIssues,
        reason: reviewIssues[0],
      };
    }

    return {
      requiresApproval: false,
      isBlocked: false,
      detectedIssues: [],
    };
  } catch (error) {
    console.error('⚠️ [ModerationEngine] Vision API failed:', error);
    return {
      requiresApproval: true,
      isBlocked: false,
      detectedIssues: ['Vision API error'],
      reason: 'Media pending manual review.',
    };
  }
}

export async function adjustUserTrustScore(
  userId: string,
  delta: number
): Promise<void> {
  if (!userId) return;
  const db = getFirestore();
  const userRef = db.collection('users').doc(userId);

  await db.runTransaction(async (txn) => {
    const snap = await txn.get(userRef);
    const data = snap.data() || {};
    const profile = data.moderationProfile || {};
    const current = typeof profile.trustScore === 'number' ? profile.trustScore : 50;
    const updated = Math.max(0, Math.min(100, current + delta));

    const forceManual = updated < 30;

    txn.update(userRef, {
      moderationProfile: {
        ...profile,
        trustScore: updated,
        forceManualReview: forceManual,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
  });
}

export function shouldForceManualReview(userData: any): boolean {
  const profile = userData?.moderationProfile;
  if (!profile) return false;
  if (profile.forceManualReview) return true;
  if (typeof profile.trustScore === 'number' && profile.trustScore < 30) return true;
  return false;
}

