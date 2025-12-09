import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { runTextModeration, ModerationVerdict } from './moderationEngine';

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

export type ContentModerationResponse = ModerationVerdict;

/**
 * Callable wrapper so web clients can preview moderation feedback,
 * while the core logic lives in moderationEngine for server-side use.
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
      throw new HttpsError('invalid-argument', 'contentType must be post, media, comment, or testimonial');
    }

    try {
      return await runTextModeration(content, contentType, userId);
    } catch (error: any) {
      console.error('⚠️ [ContentModeration] Callable failed:', error);
      throw new HttpsError('internal', error?.message || 'Moderation failed');
    }
  }
);

