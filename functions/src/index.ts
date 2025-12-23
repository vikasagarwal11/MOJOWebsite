import ffprobe from '@ffprobe-installer/ffprobe';
import { SpeechClient } from '@google-cloud/speech';
import { CloudTasksClient } from "@google-cloud/tasks";
import type { Request, Response } from "express";
import ffmpegStatic from 'ffmpeg-static';
import { initializeApp } from "firebase-admin/app";
import { DocumentData, FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentCreated, onDocumentDeleted, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest, type CallableOptions, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
const fsp = fs.promises;

// Set global options for all functions - set to us-east1 to match prod bucket
setGlobalOptions({ region: 'us-east1' });

// Central CORS allowlist for all callable/HTTP functions invoked from the web app
const ALLOWED_CORS_ORIGINS = [
  'https://momsfitnessmojo.com',
  'https://www.momsfitnessmojo.com',
  // Primary Firebase Hosting domains (project-specific)
  'https://momsfitnessmojo-65d00.web.app',
  'https://momsfitnessmojo-65d00.firebaseapp.com',
  // Historical/typo variants kept for backward compatibility with older clients
  'https://momfitnessmojo.web.app',
  'https://momfitnessmojo.firebaseapp.com',
  // Local development
  'http://localhost:5173',
  'http://localhost:3000',
];

function wrapWithOriginGuard<T, R>(fn: (request: CallableRequest<T>) => R | Promise<R>) {
  return async (request: CallableRequest<T>): Promise<R> => {
    try {
      const origin = request?.rawRequest?.headers?.origin;
      if (origin && !ALLOWED_CORS_ORIGINS.includes(origin)) {
        console.warn('⚠️ [CORS] Blocked request from disallowed origin:', origin);
        throw new HttpsError('permission-denied', 'Origin not allowed');
      }
    } catch (originCheckError) {
      console.warn('⚠️ [CORS] Origin guard encountered an error:', (originCheckError as Error).message);
      // If we cannot determine origin, fall through to handler (Cloud Functions will still enforce auth)
    }
    return fn(request);
  };
}

// Helper wrappers so future functions automatically include origin allowlist checks
export function onCallWithCors<T = any, R = any>(
  optsOrHandler: CallableOptions | ((request: CallableRequest<T>) => R | Promise<R>),
  handler?: (request: CallableRequest<T>) => R | Promise<R>
) {
  if (typeof optsOrHandler === 'function') {
    return onCall({}, wrapWithOriginGuard(optsOrHandler));
  }
  const opts: CallableOptions = optsOrHandler || {};
  if (!handler) {
    throw new Error('Handler is required for onCallWithCors');
  }
  const merged: CallableOptions = {
    ...opts,
    cors: opts.cors ?? ALLOWED_CORS_ORIGINS,
  };
  return onCall(merged, wrapWithOriginGuard(handler));
}

export function onRequestWithCors(
  optsOrHandler: any,
  handler?: (req: Request, res: Response) => any
) {
  if (typeof optsOrHandler === 'function') {
    return onRequest({ cors: ALLOWED_CORS_ORIGINS }, optsOrHandler);
  }
  const opts = optsOrHandler || {};
  if (!handler) {
    throw new Error('Handler is required for onRequestWithCors');
  }
  return onRequest({ ...opts, cors: opts.cors ?? ALLOWED_CORS_ORIGINS }, handler);
}
// Initialize Firebase Admin BEFORE importing modules that use it
initializeApp();

// Initialize Cloud Tasks client
const tasksClient = new CloudTasksClient();
const speechClient = new SpeechClient();

import { bulkAttendeeOperation, manualRecalculateCount, onAttendeeChange } from './attendeeCounts';
import { manualRecalculateWaitlistPositions as _manualRecalcWaitlist } from './autoPromotionService';
import { backfillKnowledgeBaseEmbeddings, ensureChunkEmbedding, getKnowledgeEmbeddingStatus, retryFailedKnowledgeEmbeddings } from './kbEmbeddingWorker';
import { manualDeleteKnowledgeSource, manualUpsertKnowledgeSource, type KnowledgeVisibilityLevel } from './knowledgeBase';
import { syncStaticKnowledgeEntries } from './staticContent';
import { ensureAdmin } from './utils/admin';

// Export the new attendee count management functions
export { backfillKnowledgeBaseEmbeddings, bulkAttendeeOperation, ensureChunkEmbedding, getKnowledgeEmbeddingStatus, manualRecalculateCount, onAttendeeChange, retryFailedKnowledgeEmbeddings };

// Auto-Promotion Cloud Function - triggers when someone cancels RSVP
export const onAttendeeCancellation = onDocumentWritten(
  'events/{eventId}/attendees/{attendeeId}',
  async (event) => {
    try {
      const beforeData = event.data?.before?.data();
      const afterData = event.data?.after?.data();
      
      // Check if this is a cancellation (going/not-going → waitlisted or going → not-going)
      const isGoingToWaitlist = afterData?.rsvpStatus === 'waitlisted' && 
                               beforeData?.rsvpStatus === 'going';
      const isGoingToNotGoing = afterData?.rsvpStatus === 'not-going' && 
                               beforeData?.rsvpStatus === 'going';
      const isWaitlistToNotGoing = afterData?.rsvpStatus === 'not-going' && 
                                   beforeData?.rsvpStatus === 'waitlisted';
      
      // Trigger auto-promotion if someone left or cancelled
      // Trigger promotions when a primary seat frees up: going->not-going, going->waitlisted, or deletion of a going primary
      const isDeletion = !event.data?.after?.exists && !!beforeData;
      const freedPrimarySeat = (
        (beforeData?.attendeeType === 'primary') && (
          isGoingToNotGoing || isGoingToWaitlist || (isDeletion && beforeData?.rsvpStatus === 'going')
        )
      );
      if (freedPrimarySeat) {
        const eventId = event.params.eventId;
        console.log(`🚀 Attendee cancellation detected: ${afterData?.name} → ${afterData?.rsvpStatus}`);
        console.log(`🔄 Starting auto-promotion for event: ${eventId}`);
        
        // Call our auto-promotion service
        try {
          // Import the auto-promotion service
          const { triggerAutomaticPromotions } = await import('./autoPromotionService');
          
          const promotionResult = await triggerAutomaticPromotions(eventId);
          
          if (promotionResult.success && promotionResult.promotionsCount > 0) {
            console.log(`✅ Auto-promotion completed: ${promotionResult.promotionsCount} users promoted`);
            console.log(`👥 Promoted users:`, promotionResult.promotedUsers.map(u => u.message));
            
            // TODO: Send notifications to promoted users
            await sendPromotionNotifications(promotionResult.promotedUsers, eventId);
          } else {
            console.log(`ℹ️ No auto-promotions needed: ${promotionResult.errors.join(', ')}`);
          }
        } catch (promoError) {
          console.error('🚨 Auto-promotion failed:', promoError);
        }
      }
      
      // Check if someone joined waitlist (trigger manual admin notifications)
      if (isGoingToWaitlist) {
        const eventId = event.params.eventId;
        console.log(`📝 New waitlist join: ${afterData?.name} at position ${afterData?.waitlistPosition}`);
        
        // Log for admin monitoring (could lead to admin notifications)
        await db.collection('waitlist_activities').add({
          eventId: eventId,
          attendeeId: event.params.attendeeId,
          action: 'joined_waitlist',
          userId: afterData?.userId,
          userName: afterData?.name,
          position: afterData?.waitlistPosition,
          timestamp: new Date()
        });
      }
      
    } catch (error) {
      console.error('🚨 Error in attendee cancellation handler:', error);
    }
  }
);

// Callable: Manually recalc waitlist positions (admin only)
export const recalcWaitlistPositions = onCallWithCors({ region: 'us-central1' }, async (request) => {
  const { data, auth } = request;
  const eventId = data?.eventId as string | undefined;
  if (!auth) throw new Error('Unauthenticated');
  if (!eventId) throw new Error('eventId required');
  const isAdmin = (auth.token as any)?.role === 'admin' || (auth.token as any)?.admin === true;
  if (!isAdmin) throw new Error('Admin only');
  await _manualRecalcWaitlist(eventId);
  return { success: true, eventId };
});

const ALLOWED_KB_VISIBILITY: KnowledgeVisibilityLevel[] = ['public', 'members', 'private'];

export const saveManualKnowledgeEntry = onCallWithCors({ region: 'us-central1' }, async request => {
  await ensureAdmin(request.auth);

  const rawData = request.data || {};
  const title = (rawData.title ?? '').toString().trim();
  if (!title) {
    throw new HttpsError('invalid-argument', 'title is required');
  }

  const summary = (rawData.summary ?? '').toString();
  const body = (rawData.body ?? '').toString();
  const rawVisibility = (rawData.visibility ?? 'members').toString().toLowerCase();
  const visibility: KnowledgeVisibilityLevel = ALLOWED_KB_VISIBILITY.includes(rawVisibility as KnowledgeVisibilityLevel)
    ? (rawVisibility as KnowledgeVisibilityLevel)
    : 'members';

  const tags: string[] = Array.isArray(rawData.tags)
    ? (rawData.tags as any[]).map(tag => (typeof tag === 'string' ? tag.trim() : '')).filter(Boolean)
    : typeof rawData.tags === 'string'
      ? rawData.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : [];

  const url = rawData.url ? rawData.url.toString() : undefined;
  const metadata = typeof rawData.metadata === 'object' && rawData.metadata !== null ? rawData.metadata : {};

  const db = getFirestore();
  const providedId = rawData.id ? rawData.id.toString().trim() : '';
  const sourceId = providedId || db.collection('kb_sources').doc().id;
  const sourceKey = `manual_${sourceId}`;

  await manualUpsertKnowledgeSource(sourceKey, {
    sourceId,
    sourceType: 'manual',
    title,
    summary,
    body,
    visibility,
    tags,
    url,
    metadata: {
      ...metadata,
      lastEditedBy: request.auth?.uid ?? null,
      lastEditedAt: new Date().toISOString(),
    },
  });

  return {
    success: true,
    id: sourceId,
    sourceKey,
  };
});

export const deleteManualKnowledgeEntry = onCallWithCors({ region: 'us-central1' }, async request => {
  await ensureAdmin(request.auth);
  const id = (request.data?.id ?? '').toString().trim();
  if (!id) {
    throw new HttpsError('invalid-argument', 'id is required');
  }
  const sourceKey = `manual_${id}`;
  await manualDeleteKnowledgeSource(sourceKey);
  return { success: true, id };
});

export const syncSiteCopyToKnowledgeBase = onCallWithCors({ region: 'us-central1' }, async request => {
  await ensureAdmin(request.auth);
  const result = await syncStaticKnowledgeEntries();
  return {
    success: true,
    ...result,
  };
});

// Send notifications to promoted users
const sendPromotionNotifications = async (
  promotedUsers: Array<{
    userId: string;
    attendeeId: string;
    name: string;
    promotedFromPosition: number;
    message: string;
  }>,
  eventId: string
): Promise<void> => {
  try {
    console.log(`📱 Sending notifications to ${promotedUsers.length} promoted users`);
    
    // Get event data for notification
    const eventDoc = await db.collection('events').doc(eventId).get();
    const eventData = eventDoc.exists ? eventDoc.data() : null;
    const eventTitle = eventData?.title || 'Event';
    
    for (const user of promotedUsers) {
      try {
        // Get user data for phone number and preferences
        const userDoc = await db.collection('users').doc(user.userId).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        
        if (!userData) {
          console.warn(`⚠️ User data not found for ${user.userId}`);
          continue;
        }
        
        // 1. Create in-app notification
        await db.collection('notifications').add({
          userId: user.userId,
          type: 'waitlist_promotion',
          title: '🎉 Waitlist Promotion Confirmed!',
          message: `You've been promoted from waitlist for "${eventTitle}"`,
          eventId: eventId,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)), // 24 hours
          metadata: {
            originalPosition: user.promotedFromPosition,
            promotionTime: new Date().toISOString()
          }
        });
        
        // 2. Send push notification (if enabled)
        const fcmToken = userData?.fcmToken;
        const pushEnabled = userData?.notificationPreferences?.pushEnabled !== false;
        if (pushEnabled && fcmToken) {
          try {
            const { getMessaging } = await import('firebase-admin/messaging');
            const messaging = getMessaging();
            await messaging.send({
              token: fcmToken,
              notification: {
                title: '🎉 Waitlist Promotion Confirmed!',
                body: `You've been promoted from waitlist for "${eventTitle}"`,
              },
              data: {
                type: 'waitlist_promotion',
                eventId: eventId,
              },
            });
            console.log(`✅ Push notification sent to ${user.userId}`);
          } catch (pushError) {
            console.warn(`⚠️ Push notification failed for ${user.userId}:`, pushError);
          }
        }
        
        // 3. Send SMS immediately (time-sensitive - user needs to RSVP within 24h)
        const phoneNumber = userData?.phoneNumber;
        const smsEnabled = userData?.notificationPreferences?.smsEnabled !== false;
        if (smsEnabled && phoneNumber) {
          const smsMessage = `🎉 MOMS FITNESS MOJO: You've been promoted from waitlist! Confirm attendance at "${eventTitle}" within 24h.`;
          const smsResult = await sendSMSViaTwilio(phoneNumber, smsMessage);
          
          if (smsResult.success) {
            console.log(`✅ Immediate SMS sent to ${user.userId} for promotion`);
          } else {
            console.error(`❌ SMS failed for ${user.userId}:`, smsResult.error);
          }
        }
        
        // 4. Mark for popup alert on next visit
        await db.collection('popup_alerts').add({
          userId: user.userId,
          type: 'promotion',
          title: '🎉 Waitlist Promotion Confirmed!',
          message: `Congratulations! You've been promoted from waitlist for "${eventTitle}"`,
          eventId: eventId,
          createdAt: FieldValue.serverTimestamp(),
          acknowledged: false
        });
        
        console.log(`✅ All notifications sent for ${user.name} (${user.userId})`);
      } catch (userError) {
        console.error(`❌ Failed to send notifications for ${user.userId}:`, userError);
      }
    }
    
    console.log(`✅ Promotion notifications processed for ${promotedUsers.length} users`);
  } catch (error) {
    console.error('🚨 Error sending promotion notifications:', error);
  }
};

// Get Firestore instance - using momsfitnessmojo database
const db = getFirestore();

// ───────────────── SMS SERVICE (Twilio) ─────────────────

/**
 * Send SMS using Twilio
 * Requires Firebase config: twilio.account_sid, twilio.auth_token, twilio.phone_number
 * Set via: firebase functions:config:set twilio.account_sid="..." twilio.auth_token="..." twilio.phone_number="..."
 */
async function sendSMSViaTwilio(phoneNumber: string, message: string): Promise<{ success: boolean; error?: string; sid?: string }> {
  try {
    // For Firebase Functions v2, access config via runtime config
    // Try to get from functions.config() first (for v1 compatibility), then fallback to process.env
    let twilioAccountSid: string | undefined;
    let twilioAuthToken: string | undefined;
    let twilioPhoneNumber: string | undefined;
    
    try {
      // Try to access via functions.config() (works with firebase functions:config:set)
      const functions = require('firebase-functions');
      const config = functions.config();
      twilioAccountSid = config?.twilio?.account_sid;
      twilioAuthToken = config?.twilio?.auth_token;
      twilioPhoneNumber = config?.twilio?.phone_number;
    } catch (configError) {
      // functions.config() not available, will use process.env
    }
    
    // Fallback to environment variables (for v2 direct env vars)
    twilioAccountSid = twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
    twilioAuthToken = twilioAuthToken || process.env.TWILIO_AUTH_TOKEN;
    twilioPhoneNumber = twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      console.error('❌ Twilio credentials not configured');
      return { success: false, error: 'Twilio credentials not configured. Please set twilio.account_sid, twilio.auth_token, and twilio.phone_number' };
    }

    const twilio = await import('twilio');
    const client = twilio.default(twilioAccountSid, twilioAuthToken);

    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: phoneNumber,
    });

    console.log(`✅ SMS sent via Twilio. SID: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (error: any) {
    console.error('❌ Twilio SMS failed:', error?.message || error);
    return { success: false, error: error?.message || 'Failed to send SMS' };
  }
}
type StorageBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

// Helper
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// Watermark configuration
const WATERMARK_FOLDER = process.env.WATERMARK_FOLDER || 'watermarked';
const WATERMARK_TEXT = process.env.WATERMARK_TEXT || 'Moms Fitness Mojo';
const WATERMARK_URL_TTL_SECONDS = Number(process.env.WATERMARK_URL_TTL || 60 * 60); // 1 hour
const WATERMARK_VIDEO_PRESET = process.env.WATERMARK_VIDEO_PRESET || 'veryfast';

// ───────────────── SMART ENCODING PRESETS ─────────────────
interface EncodingPreset {
  preset: string;
  crf: number;
  scale: string;
  priority: 'speed' | 'quality' | 'balanced';
}

/**
 * Determines optimal encoding preset based on video characteristics
 */
function getEncodingPreset(videoInfo: {
  duration: number | null;
  width: number | null;
  height: number | null;
  fileSize: number;
  frameRate: number;
}): EncodingPreset {
  const { duration, width, height, fileSize, frameRate } = videoInfo;
  
  // Short videos (<30s): Prioritize speed
  if (duration && duration < 30) {
    console.log(`⚡ [SMART] Short video detected (${duration}s), using ultrafast preset for speed`);
    return {
      preset: 'ultrafast',
      crf: 25, // Slightly lower quality for faster encoding
      scale: '720p', // Lower resolution for speed
      priority: 'speed'
    };
  }
  
  // Very short videos (<10s): Even faster
  if (duration && duration < 10) {
    console.log(`⚡ [SMART] Very short video detected (${duration}s), using ultrafast preset`);
    return {
      preset: 'ultrafast',
      crf: 26,
      scale: '720p',
      priority: 'speed'
    };
  }
  
  // High resolution (>1080p): Prioritize quality
  const isHighRes = (width && width > 1920) || (height && height > 1080);
  const is4K = (width && width >= 3840) || (height && height >= 2160);
  
  if (is4K) {
    console.log(`🎬 [SMART] 4K video detected (${width}x${height}), using medium preset for quality`);
    return {
      preset: 'medium',
      crf: 21, // Higher quality for 4K
      scale: 'original', // Keep original resolution
      priority: 'quality'
    };
  }
  
  if (isHighRes) {
    console.log(`🎬 [SMART] High-res video detected (${width}x${height}), using balanced preset`);
    return {
      preset: 'fast',
      crf: 22, // Better quality for high-res
      scale: 'original', // Keep original resolution
      priority: 'quality'
    };
  }
  
  // High frame rate (>50fps): Use faster preset (frame rate adds encoding complexity)
  if (frameRate > 50) {
    console.log(`📹 [SMART] High frame rate detected (${frameRate}fps), using fast preset`);
    return {
      preset: 'fast',
      crf: 23,
      scale: '1080p',
      priority: 'balanced'
    };
  }
  
  // Large files (>100MB): Use faster preset to reduce processing time
  if (fileSize > 100 * 1024 * 1024) {
    console.log(`📦 [SMART] Large file detected (${(fileSize / 1024 / 1024).toFixed(1)}MB), using fast preset`);
    return {
      preset: 'fast',
      crf: 23,
      scale: '1080p',
      priority: 'balanced'
    };
  }
  
  // Standard: Balanced settings
  console.log(`⚙️ [SMART] Standard video, using balanced preset`);
  return {
    preset: 'fast',
    crf: 23,
    scale: '1080p',
    priority: 'balanced'
  };
}

/**
 * Generates FFmpeg scale filter based on target scale
 */
function getScaleFilter(scale: string, width: number | null, height: number | null): string {
  switch (scale) {
    case '720p':
      return 'scale=w=min(iw\\,1280):h=-2';
    case '1080p':
      return 'scale=w=min(iw\\,1920):h=-2';
    case 'original':
      // Keep original resolution
      return 'scale=iw:ih';
    default:
      return 'scale=w=min(iw\\,1280):h=-2';
  }
}

// ───────────────── HELPER FUNCTIONS ─────────────────
async function findMediaDocRef(name: string, dir: string, tries = 5): Promise<FirebaseFirestore.DocumentReference | null> {
  console.log(`🔍 Searching for media doc:`, { name, dir });
  for (let i = 0; i < tries; i++) {
    console.log(`🔍 Attempt ${i + 1}/${tries}:`);

    // Try by filePath
    let snap = await db.collection('media').where('filePath', '==', name).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      console.log(`✅ Found by filePath: ${doc.id}`, {
        filePath: doc.data()?.filePath,
        storageFolder: doc.data()?.storageFolder,
        transcodeStatus: doc.data()?.transcodeStatus
      });
      return doc.ref;
    }
    console.log(`❌ No match by filePath: ${name}`);

    // Try by storageFolder
    const searchFolder = dir.endsWith('/') ? dir : `${dir}/`;
    snap = await db.collection('media').where('storageFolder', '==', searchFolder).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      console.log(`✅ Found by storageFolder: ${doc.id}`, {
        filePath: doc.data()?.filePath,
        storageFolder: doc.data()?.storageFolder,
        transcodeStatus: doc.data()?.transcodeStatus
      });
      return doc.ref;
    }
    console.log(`❌ No match by storageFolder: ${searchFolder}`);

    if (i === 0) {
      const allDocs = await db.collection('media').limit(10).get();
      console.log(`🔍 Available media docs:`, allDocs.docs.map(d => ({
        id: d.id,
        filePath: d.data()?.filePath,
        storageFolder: d.data()?.storageFolder,
        transcodeStatus: d.data()?.transcodeStatus
      })));
    }
    await sleep(500 * Math.pow(2, i));
  }
  console.log(`❌ Failed to find media doc after ${tries} attempts`);
  return null;
}

// FFmpeg paths
ffmpeg.setFfmpegPath(ffmpegStatic as string);
ffmpeg.setFfprobePath(ffprobe.path);

// ───────────────── Manifest Rewriter (NEW) ─────────────────
function rewriteManifestWithAbsoluteUrls(
  manifestPath: string,
  bucketName: string,
  hlsPath: string,   // e.g. "media/<uid>/<batch>/hls/<base>/"
  token: string
) {
  let text = fs.readFileSync(manifestPath, 'utf8');

  const toAbs = (rel: string) => {
    const fullStoragePath = `${hlsPath}${rel}`; // media/.../hls/.../index0.ts
    const enc = encodeURIComponent(fullStoragePath);
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${enc}?alt=media&token=${token}`;
  };

  const lines = text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();

    // Keep comments as-is
    if (trimmed.startsWith('#')) {
      // Handle EXT-X-MAP:URI="init.mp4" etc
      const mapMatch = trimmed.match(/URI="([^"]+)"/);
      if (mapMatch && !/^https?:\/\//i.test(mapMatch[1])) {
        const abs = toAbs(mapMatch[1]);
        return line.replace(/URI="[^"]+"/, `URI="${abs}"`);
      }
      return line;
    }

    if (!trimmed) return line;

    // Already absolute? leave it
    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    // Otherwise convert relative segment to absolute URL
    return toAbs(trimmed);
  });

  const out = lines.join('\n');
  fs.writeFileSync(manifestPath, out, 'utf8');

  // Debug: log first non-comment, non-empty line
  const sample = lines.find(l => l.trim() && !l.trim().startsWith('#'));
  console.log('📝 Manifest rewrite sample:', sample);
}

// ───────────────── MEDIA counters ─────────────────
export const onLikeWrite = onDocumentWritten("media/{mediaId}/likes/{userId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;

  console.log('🔍 onLikeWrite triggered:', {
    mediaId: event.params.mediaId,
    userId: event.params.userId,
    beforeExists,
    afterExists,
    delta
  });

  if (delta === 0) return;

  try {
    await db.doc(`media/${event.params.mediaId}`)
      .update({ likesCount: FieldValue.increment(delta) });
    console.log('✅ Like count updated successfully:', { mediaId: event.params.mediaId, delta });
  } catch (error) {
    console.error('❌ Failed to update like count:', error);
  }
});

export const onCommentWrite = onDocumentWritten("media/{mediaId}/comments/{commentId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;

  console.log('🔍 onCommentWrite triggered:', {
    mediaId: event.params.mediaId,
    commentId: event.params.commentId,
    beforeExists,
    afterExists,
    delta
  });

  if (delta === 0) return;

  try {
    await db.doc(`media/${event.params.mediaId}`)
      .update({ commentsCount: FieldValue.increment(delta) });
    console.log('✅ Comment count updated successfully:', { mediaId: event.params.mediaId, delta });
  } catch (error) {
    console.error('❌ Failed to update comment count:', error);
  }
});

// ───────────────── POSTS counters ─────────────────
export const onPostLikeWrite = onDocumentWritten("posts/{postId}/likes/{userId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;
  if (delta === 0) return;
  await db.doc(`posts/${event.params.postId}`)
    .update({ likesCount: FieldValue.increment(delta) });
});

export const onPostCommentWrite = onDocumentWritten("posts/{postId}/comments/{commentId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;
  if (delta === 0) return;
  await db.doc(`posts/${event.params.postId}`)
    .update({ commentsCount: FieldValue.increment(delta) });
});

// ───────────────── COMMENT AGGREGATION FUNCTIONS ─────────────────
// Update comment reply count when replies are added/removed
export const onCommentReplyWrite = onDocumentWritten("posts/{postId}/comments/{commentId}", async (event) => {
  const beforeData = event.data?.before.exists ? event.data?.before.data() : null;
  const afterData = event.data?.after.exists ? event.data?.after.data() : null;
  
  // Only process if this is a reply (has parentCommentId)
  if (!afterData?.parentCommentId) return;
  
  const parentCommentId = afterData.parentCommentId;
  const wasReply = beforeData?.parentCommentId === parentCommentId;
  const isReply = afterData?.parentCommentId === parentCommentId;
  
  let delta = 0;
  if (isReply && !wasReply) delta = 1;  // New reply added
  if (!isReply && wasReply) delta = -1; // Reply removed
  
  if (delta === 0) return;
  
  try {
    await db.doc(`posts/${event.params.postId}/comments/${parentCommentId}`)
      .update({ replyCount: FieldValue.increment(delta) });
    console.log(`✅ Reply count updated for comment ${parentCommentId}: ${delta}`);
  } catch (error) {
    console.error('❌ Failed to update reply count:', error);
  }
});

// Update comment likes count
export const onCommentLikeWrite = onDocumentWritten("posts/{postId}/comments/{commentId}/likes/{userId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;
  if (delta === 0) return;
  
  try {
    await db.doc(`posts/${event.params.postId}/comments/${event.params.commentId}`)
      .update({ likesCount: FieldValue.increment(delta) });
    console.log(`✅ Comment like count updated for ${event.params.commentId}: ${delta}`);
  } catch (error) {
    console.error('❌ Failed to update comment like count:', error);
  }
});

// Update comment reactions summary - Force deploy
export const onCommentReactionWrite = onDocumentWritten("posts/{postId}/comments/{commentId}/reactions/{userId_emoji}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  
  if (beforeExists === afterExists) return; // No change
  
  const commentRef = db.doc(`posts/${event.params.postId}/comments/${event.params.commentId}`);
  
  try {
    // Get current reaction summary
    const commentDoc = await commentRef.get();
    const currentSummary = commentDoc.data()?.reactionSummary || {};
    
    // Extract emoji from compound key (userId_emoji)
    const emoji = event.params.userId_emoji.split('_').pop();
    if (!emoji) return;
    
    if (afterExists && !beforeExists) {
      // Reaction added
      currentSummary[emoji] = (currentSummary[emoji] || 0) + 1;
    } else if (!afterExists && beforeExists) {
      // Reaction removed
      currentSummary[emoji] = Math.max(0, (currentSummary[emoji] || 0) - 1);
      if (currentSummary[emoji] === 0) {
        delete currentSummary[emoji];
      }
    }
    
    await commentRef.update({ reactionSummary: currentSummary });
    console.log(`✅ Comment reaction summary updated for ${event.params.commentId}:`, currentSummary);
  } catch (error) {
    console.error('❌ Failed to update comment reaction summary:', error);
  }
});

// ───────────────── MEDIA COMMENT AGGREGATION FUNCTIONS ─────────────────
// Update media comment reply count when replies are added/removed
export const onMediaCommentReplyWrite = onDocumentWritten("media/{mediaId}/comments/{commentId}", async (event) => {
  const beforeData = event.data?.before.exists ? event.data?.before.data() : null;
  const afterData = event.data?.after.exists ? event.data?.after.data() : null;
  
  // Only process if this is a reply (has parentCommentId)
  if (!afterData?.parentCommentId) return;
  
  const parentCommentId = afterData.parentCommentId;
  const wasReply = beforeData?.parentCommentId === parentCommentId;
  const isReply = afterData?.parentCommentId === parentCommentId;
  
  let delta = 0;
  if (isReply && !wasReply) delta = 1;  // New reply added
  if (!isReply && wasReply) delta = -1; // Reply removed
  
  if (delta === 0) return;
  
  try {
    await db.doc(`media/${event.params.mediaId}/comments/${parentCommentId}`)
      .update({ replyCount: FieldValue.increment(delta) });
    console.log(`✅ Media comment reply count updated for comment ${parentCommentId}: ${delta}`);
  } catch (error) {
    console.error('❌ Failed to update media comment reply count:', error);
  }
});

// Update media comment likes count
export const onMediaCommentLikeWrite = onDocumentWritten("media/{mediaId}/comments/{commentId}/likes/{userId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;
  if (delta === 0) return;
  
  try {
    await db.doc(`media/${event.params.mediaId}/comments/${event.params.commentId}`)
      .update({ likesCount: FieldValue.increment(delta) });
    console.log(`✅ Media comment like count updated for ${event.params.commentId}: ${delta}`);
  } catch (error) {
    console.error('❌ Failed to update media comment like count:', error);
  }
});

// Update media comment reactions summary - Force deploy
export const onMediaCommentReactionWrite = onDocumentWritten("media/{mediaId}/comments/{commentId}/reactions/{userId_emoji}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  
  if (beforeExists === afterExists) return; // No change
  
  const commentRef = db.doc(`media/${event.params.mediaId}/comments/${event.params.commentId}`);
  
  try {
    // Get current reaction summary
    const commentDoc = await commentRef.get();
    const currentSummary = commentDoc.data()?.reactionSummary || {};
    
    // Extract emoji from compound key (userId_emoji)
    const emoji = event.params.userId_emoji.split('_').pop();
    if (!emoji) return;
    
    if (afterExists && !beforeExists) {
      // Reaction added
      currentSummary[emoji] = (currentSummary[emoji] || 0) + 1;
    } else if (!afterExists && beforeExists) {
      // Reaction removed
      currentSummary[emoji] = Math.max(0, (currentSummary[emoji] || 0) - 1);
      if (currentSummary[emoji] === 0) {
        delete currentSummary[emoji];
      }
    }
    
    await commentRef.update({ reactionSummary: currentSummary });
    console.log(`✅ Media comment reaction summary updated for ${event.params.commentId}:`, currentSummary);
  } catch (error) {
    console.error('❌ Failed to update media comment reaction summary:', error);
  }
});

// ───────────────── EVENTS: RSVP counter ─────────────────
export const onRsvpWrite = onDocumentWritten("events/{eventId}/rsvps/{userId}", async (event) => {
  const beforeData = event.data?.before.exists ? event.data?.before.data() : null;
  const afterData = event.data?.after.exists ? event.data?.after.data() : null;
  const wasGoing = beforeData?.status === "going";
  const isGoing = afterData?.status === "going";
  let delta = 0;
  if (isGoing && !wasGoing) delta = 1;
  if (!isGoing && wasGoing) delta = -1;
  if (delta === 0) return;
  await db.doc(`events/${event.params.eventId}`)
    .update({ attendingCount: FieldValue.increment(delta) });
});

// ───────────────── EVENTS: teaser sync ─────────────────
export const onEventTeaserSync = onDocumentWritten("events/{eventId}", async (event) => {
  const teaserRef = db.doc(`event_teasers/${event.params.eventId}`);
  if (!event.data?.after.exists) {
    await teaserRef.delete().catch(() => {});
    return;
  }
  const data = event.data.after.data()!;
    // Check if post is public (hybrid approach for backward compatibility)
    const isPublic = data.visibility === 'public' || !!data.public;
  const raw = data.startAt;
  const startAtDate: Date =
    raw instanceof Timestamp ? raw.toDate() :
      typeof raw?.toDate === "function" ? raw.toDate() :
        new Date(raw);
  const isPast = startAtDate.getTime() < Date.now();
  if (isPublic || isPast) {
    await teaserRef.delete().catch(() => {});
  } else {
    await teaserRef.set({
      title: data.title || "Upcoming event",
      startAt: data.startAt,
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
});


// ───────────────── EVENTS: RSVP notifications (New Attendee System) ─────────────────
export const notifyRsvp = onDocumentWritten("events/{eventId}/attendees/{attendeeId}", async (event) => {
  console.log(`🔍 notifyRsvp: Function triggered for eventId=${event.params.eventId}, attendeeId=${event.params.attendeeId}`);
  
  const beforeData = event.data?.before.exists ? event.data?.before.data() : null;
  const afterData = event.data?.after.exists ? event.data?.after.data() : null;
  
  console.log(`🔍 notifyRsvp: beforeData=`, beforeData);
  console.log(`🔍 notifyRsvp: afterData=`, afterData);

  const wasGoing = beforeData?.rsvpStatus === "going";
  const isGoing = afterData?.rsvpStatus === "going";
  
  console.log(`🔍 notifyRsvp triggered: wasGoing=${wasGoing}, isGoing=${isGoing}, eventId=${event.params.eventId}, attendeeId=${event.params.attendeeId}`);
  
  // Only trigger notification when someone changes TO "going" status
  // (was not going before, but is going now)
  if (!isGoing || wasGoing) {
    console.log(`🔍 notifyRsvp: Skipping notification (wasGoing=${wasGoing}, isGoing=${isGoing})`);
    return;
  }
  
  console.log(`🔍 notifyRsvp: Proceeding with notification creation`);

  try {
    const eventId = event.params.eventId;
    const attendeeId = event.params.attendeeId;
    
    // Get attendee data to find the user ID
    const attendeeData = afterData;
    const userId = attendeeData?.userId;
    console.log(`🔍 notifyRsvp: userId from attendeeData:`, userId);
    if (!userId) {
      console.log(`🔍 notifyRsvp: No userId found, returning`);
      return;
    }

    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) return;

    const eventData = eventDoc.data()!;
    const eventCreatorId = eventData.createdBy;
    console.log(`🔍 notifyRsvp: eventCreatorId:`, eventCreatorId, `userId:`, userId);
    
    // Allow notifications for everyone, including event creators
    // Event creators should also receive notifications for their own events

    const userDoc = await db.collection('users').doc(userId).get();
    let userName = 'Member';
    if (userDoc.exists) {
      const userData = userDoc.data()!;
      userName = userData.displayName || userData.firstName || userData.lastName || 'Member';
    }
    
    // Get attendee name for more specific notification
    const attendeeName = attendeeData?.name || userName;
    
    // Create appropriate message based on whether it's the event creator or not
    const isEventCreator = eventCreatorId === userId;
    const notificationMessage = isEventCreator 
      ? `You RSVP'd for ${eventData.title}!`
      : `${attendeeName} is going to ${eventData.title}!`;

    console.log(`🔍 notifyRsvp: Creating notification for eventCreatorId:`, eventCreatorId);
    const notificationRef = await db.collection('notifications').add({
      userId: eventCreatorId,
      message: notificationMessage,
      createdAt: FieldValue.serverTimestamp(),
      eventId,
      read: false,
      type: 'rsvp',
      rsvpUserId: userId,
      rsvpStatus: 'going',
      attendeeId: attendeeId,
      attendeeName: attendeeName,
      isEventCreator: isEventCreator
    });
    console.log(`🔍 notifyRsvp: Notification created with ID:`, notificationRef.id);

    try {
      const creatorDoc = await db.collection('users').doc(eventCreatorId).get();
      const fcmToken = creatorDoc.data()?.fcmToken;
      if (fcmToken) {
        const { getMessaging } = await import('firebase-admin/messaging');
        const messaging = getMessaging();
        await messaging.send({
          token: fcmToken,
          notification: {
            title: 'New RSVP',
            body: notificationMessage,
          },
          data: { eventId, type: 'rsvp', userId, attendeeId, attendeeName, isEventCreator: isEventCreator.toString() },
        });
        console.log(`Push notification sent to ${eventCreatorId} for event ${eventId}`);
      }
    } catch (fcmError) {
      console.warn('FCM notification failed, but Firestore notification was created:', fcmError);
    }

    console.log(`Notification created for event ${eventId}: ${attendeeName} is going`);
  } catch (error) {
    console.error('Error creating RSVP notification:', error);
  }
});

// Legacy alias
export const onRsvpNotification = notifyRsvp;

// ───────────────── MEDIA: Storage Cleanup ─────────────────
export const onMediaDeletedCleanup = onDocumentDeleted("media/{mediaId}", async (event) => {
  const mediaId = event.params.mediaId;
  const deletedData = event.data?.data();
  
  if (!deletedData) {
    console.log(`🗑️ [CLOUD] No data found for deleted media document: ${mediaId}`);
    return;
  }

  console.log(`🗑️ [CLOUD] Starting storage cleanup for deleted media: ${mediaId}`, {
    filePath: deletedData.filePath,
    thumbnailPath: deletedData.thumbnailPath,
    rotatedImagePath: deletedData.rotatedImagePath,
    type: deletedData.type,
    sources: deletedData.sources,
    usingBucket: process.env.STORAGE_BUCKET, // Use environment variable
    version: '2.3-FIXED-VIDEO-DELETION' // Force complete redeployment
  });

  // Use the bucket from environment variable or default
  const bucketName = process.env.STORAGE_BUCKET || 'momsfitnessmojo-65d00.firebasestorage.app';
  const bucket = getStorage().bucket(bucketName);
  
  // Debug logging
  console.log('🔧 STORAGE_BUCKET env:', process.env.STORAGE_BUCKET || 'undefined');
  console.log('🔧 Final bucket used:', bucketName);
  const filesToDelete: Array<{path: string, type: string, isFolder?: boolean}> = [];
  
  // 1. Original file
  if (deletedData.filePath) {
    filesToDelete.push({ path: deletedData.filePath, type: 'original' });
  }
  
  // 2. Custom thumbnail  
  if (deletedData.thumbnailPath) {
    filesToDelete.push({ path: deletedData.thumbnailPath, type: 'thumbnail' });
  }
  
  // 3. Rotated image
  if (deletedData.rotatedImagePath) {
    filesToDelete.push({ path: deletedData.rotatedImagePath, type: 'rotated' });
  }
  
  // 4. HLS segments for videos (delete entire HLS folder)
  if (deletedData.type === 'video' && deletedData.filePath) {
    const folderPath = deletedData.filePath.substring(0, deletedData.filePath.lastIndexOf('/'));
    filesToDelete.push({
      path: `${folderPath}/hls/`,
      type: 'hls-folder',
      isFolder: true // Mark as folder for special handling
    });

    if (deletedData.sources?.hls) {
      filesToDelete.push({ path: deletedData.sources.hls, type: 'hls-playlist' });
    }
  }
  
  // 5. Extension thumbnails (cleanup all formats in correct location)
  if (deletedData.filePath && (deletedData.type === 'image' || deletedData.type === 'video')) {
    const fileName = deletedData.filePath.split('/').pop(); // Get just filename
    const folderPath = deletedData.filePath.substring(0, deletedData.filePath.lastIndexOf('/'));
    const baseName = fileName.substring(0, fileName.lastIndexOf('.')); // Remove extension
    const originalExt = fileName.substring(fileName.lastIndexOf('.') + 1); // Get original extension
    
    console.log(`🗑️ [CLOUD] [DEBUG] Filename parsing:`, {
      fullPath: deletedData.filePath,
      fileName: fileName,
      baseName: baseName,
      originalExt: originalExt,
      folderPath: folderPath
    });
    
    // Extensions create: original format + other formats for all sizes
    // Pattern: baseName_{size}.originalExt + baseName_{size}.format
    // Sizes: 400x400, 800x800, 1200x1200
    const thumbnailSizes = ['400x400', '800x800', '1200x1200'];
    const extensionFormats = [originalExt.toLowerCase(), 'webp', 'jpeg', 'png', 'avif', 'gif', 'tiff'];
    const uniqueFormats = [...new Set(extensionFormats)]; // Remove duplicates
    
    // Delete thumbnails for all sizes and formats
    thumbnailSizes.forEach(size => {
      uniqueFormats.forEach(format => {
        const thumbnailPath = `${folderPath}/thumbnails/${baseName}_${size}.${format}`;
        console.log(`🗑️ [CLOUD] [DEBUG] Generated thumbnail path:`, thumbnailPath);
        filesToDelete.push({ 
          path: thumbnailPath, 
          type: `extension-thumbnail-${size}-${format}` 
        });
      });
    });
    
    // Also attempt to delete the thumbnails folder itself (after individual files)
    filesToDelete.push({ 
      path: `${folderPath}/thumbnails/`, 
      type: 'thumbnails-folder',
      isFolder: true 
    });
  }

  console.log(`🗑️ [CLOUD] Files to delete:`, filesToDelete);
  
  let deletedCount = 0;
  let failedCount = 0;
  
  for (const file of filesToDelete) {
    try {
      if (file.isFolder) {
        // Delete entire folder (for HLS segments)
        console.log(`🗑️ [CLOUD] [DEBUG] Deleting folder: ${file.path}`);
        const [files] = await bucket.getFiles({ prefix: file.path });
        if (files.length > 0) {
          await Promise.all(files.map(f => f.delete().catch(() => {})));
          console.log(`🗑️ [CLOUD] ✅ Deleted ${file.type}: ${files.length} files in ${file.path}`);
          deletedCount += files.length;
        } else {
          console.log(`🗑️ [CLOUD] ⚠️ Folder empty or not found: ${file.path}`);
        }
      } else {
        // Delete individual file
        await bucket.file(file.path).delete();
        console.log(`🗑️ [CLOUD] ✅ Deleted ${file.type}: ${file.path}`);
        deletedCount++;
      }
    } catch (error: any) {
      // 404 errors are expected for files that don't exist
      if (error.code === 404) {
        console.log(`🗑️ [CLOUD] ⚠️ File not found (expected): ${file.path}`);
      } else {
        console.warn(`🗑️ [CLOUD] ❌ Failed to delete ${file.type}: ${error.message}`);
        failedCount++;
      }
    }
  }
  
  console.log(`🗑️ [CLOUD] Storage cleanup complete: ${deletedCount} deleted, ${failedCount} failed`);
});

// ───────────────── CLOUD TASKS HELPERS ─────────────────

/**
 * Enqueues a Cloud Task for processing a quality level
 */
async function enqueueQualityTask(
  mediaId: string,
  qualityLevel: string,
  taskPayload: {
    mediaId: string;
    qualityLevel: string;
    filePath: string;
    storageFolder: string;
    hlsBasePath: string;
    sharedToken: string;
    originalResolution: string;
    remainingQualities: string[];
    qualityConfig: {
      name: string;
      label: string;
      resolution: string;
      scaleFilter: string;
      preset: string;
      crf: number;
      bandwidth: number;
    };
  }
): Promise<void> {
  const project = process.env.GCLOUD_PROJECT || 'momsfitnessmojo-65d00';
  const location = 'us-central1'; // Cloud Tasks queue location
  const queue = 'video-quality-generation';
  
  const queuePath = tasksClient.queuePath(project, location, queue);
  
  // Get the function URL for processQualityLevel
  // In production, this will be the deployed function URL
  const functionUrl = process.env.PROCESS_QUALITY_FUNCTION_URL || 
    `https://us-east1-${project}.cloudfunctions.net/processQualityLevel`;
  
  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: functionUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(taskPayload)).toString('base64'),
    },
  };
  
  try {
    const [response] = await tasksClient.createTask({
      parent: queuePath,
      task: task,
    });
    
    console.log(`✅ [CLOUD TASKS] Enqueued task for ${qualityLevel}: ${response.name}`);
  } catch (error) {
    console.error(`❌ [CLOUD TASKS] Failed to enqueue task for ${qualityLevel}:`, error);
    throw error;
  }
}

// ───────────────── MEDIA: FFmpeg + Manifest Rewrite ─────────────────

export const onMediaFileFinalize = onObjectFinalized({ 
  region: 'us-east1',
  memory: '8GiB', // Maximum memory for fastest video processing
  timeoutSeconds: 900, // 15 minutes - increased to support 4K processing and match worker function timeout
  cpu: 2, // Use 2 vCPUs for parallel processing
  maxInstances: 20 // Handle spike days with many concurrent uploads (default: 80)
}, async (event) => {
  const object = event.data;
    console.log('🎬 onMediaFileFinalize triggered for:', object.name);
    console.log('Bucket:', object.bucket);
    console.log('Content type:', object.contentType);
    console.log('Size:', object.size);

    const name = object.name || '';
    const ctype = object.contentType || '';

    // Only process files from our target bucket (use bucket from event if env var not set)
    const expectedBucket = process.env.STORAGE_BUCKET || 'momsfitnessmojo-65d00.firebasestorage.app';
    if (object.bucket !== expectedBucket) {
      console.log(`⏭️ Skipping file from bucket: ${object.bucket}, expected: ${expectedBucket}`);
      return;
    }

    // Skip generated outputs
    if (!name.startsWith('media/')) {
      console.log('⏭️ Skipping file not in media/ folder:', name);
      return;
    }
    
    // Handle extension-generated thumbnails - update Firestore when ready
    // Firebase Extensions create thumbnails in format: .../thumbnails/filename_{size}.ext
    // Sizes: 400x400, 800x800, 1200x1200
    if (name.includes('/thumbnails/')) {
      console.log('🖼️ [THUMBNAIL FINALIZE] Thumbnail finalized:', name);
      
      // Extract thumbnail size and parent directory
      let thumbnailSize: 'small' | 'medium' | 'large' | null = null;
      if (name.includes('_400x400.')) {
        thumbnailSize = 'small';
      } else if (name.includes('_800x800.')) {
        thumbnailSize = 'medium';
      } else if (name.includes('_1200x1200.')) {
        thumbnailSize = 'large';
      }
      
      if (!thumbnailSize) {
        console.log('⏭️ Skipping thumbnail with unknown size:', name);
        return;
      }
      
      // Extract parent directory (media/{userId}/{batchId})
      // Thumbnail path: media/{userId}/{batchId}/thumbnails/{filename}_{size}.ext
      // Parent dir: media/{userId}/{batchId}
      const thumbnailsIndex = name.indexOf('/thumbnails/');
      if (thumbnailsIndex === -1) {
        console.log('⏭️ Skipping thumbnail with invalid path:', name);
        return;
      }
      
      const parentDir = name.substring(0, thumbnailsIndex);
      console.log('🔍 [THUMBNAIL] Parent directory:', parentDir);
      
      // Find the media document by storageFolder (with fallback to filePath)
      // Try multiple path formats to handle edge cases
      const searchFolderWithSlash = parentDir.endsWith('/') ? parentDir : `${parentDir}/`;
      const searchFolderWithoutSlash = parentDir.endsWith('/') ? parentDir.slice(0, -1) : parentDir;
      
      let mediaSnapshot = await db.collection('media')
        .where('storageFolder', '==', searchFolderWithSlash)
        .limit(1)
        .get();
      
      // Try without trailing slash if first attempt failed
      if (mediaSnapshot.empty) {
        mediaSnapshot = await db.collection('media')
          .where('storageFolder', '==', searchFolderWithoutSlash)
          .limit(1)
          .get();
      }
      
      // Fallback: If no match by storageFolder, try to find by filePath pattern
      // Extract the original filename from thumbnail path (remove _size suffix)
      if (mediaSnapshot.empty) {
        console.log('⚠️ [THUMBNAIL] No match by storageFolder, trying fallback query...');
        
        // Extract original filename from thumbnail: thumbnails/image_800x800.jpg -> image.jpg
        const thumbnailFileName = name.substring(name.lastIndexOf('/') + 1);
        const originalFileName = thumbnailFileName
          .replace(/_400x400\./, '.')
          .replace(/_800x800\./, '.')
          .replace(/_1200x1200\./, '.');
        
        // Try to find by filePath pattern (any file in the same folder)
        const filePathPattern = `${parentDir}/${originalFileName}`;
        mediaSnapshot = await db.collection('media')
          .where('filePath', '==', filePathPattern)
          .limit(1)
          .get();
        
        // If still no match, try to find ANY document in the same folder
        if (mediaSnapshot.empty) {
          console.log('⚠️ [THUMBNAIL] No match by filePath, trying any document in folder...');
          // Get recent documents and filter by folder (fallback for when query fails)
          // Note: This is a fallback, so we get a reasonable number of recent docs
          const allDocs = await db.collection('media')
            .orderBy('createdAt', 'desc')
            .limit(200) // Increased from 100 to catch more recent uploads
            .get();
          
          const matchingDoc = allDocs.docs.find(doc => {
            const docFolder = doc.data()?.storageFolder || '';
            const docFilePath = doc.data()?.filePath || '';
            // Match if storageFolder matches (with or without trailing slash) or filePath is in parentDir
            const normalizedDocFolder = docFolder.endsWith('/') ? docFolder : `${docFolder}/`;
            const normalizedParentDir = parentDir.endsWith('/') ? parentDir : `${parentDir}/`;
            return normalizedDocFolder === normalizedParentDir || 
                   docFolder === parentDir ||
                   docFilePath.startsWith(parentDir) ||
                   docFilePath.includes(parentDir);
          });
          
          if (matchingDoc) {
            mediaSnapshot = { docs: [matchingDoc], empty: false } as any;
            console.log('✅ [THUMBNAIL] Found document using fallback filter');
          }
        }
      }
      
      if (mediaSnapshot.empty) {
        console.error('❌ [THUMBNAIL] No media document found for thumbnail after all attempts:', name);
        console.error('❌ [THUMBNAIL] Parent directory:', parentDir);
        console.error('❌ [THUMBNAIL] Search folder (with slash):', searchFolderWithSlash);
        console.error('❌ [THUMBNAIL] Search folder (without slash):', searchFolderWithoutSlash);
        // Log available documents for debugging
        const debugDocs = await db.collection('media').orderBy('createdAt', 'desc').limit(10).get();
        console.error('❌ [THUMBNAIL] Sample documents:', debugDocs.docs.map(d => ({
          id: d.id,
          filePath: d.data()?.filePath,
          storageFolder: d.data()?.storageFolder,
          createdAt: d.data()?.createdAt
        })));
        return;
      }
      
      const mediaRef = mediaSnapshot.docs[0].ref;
      const mediaId = mediaRef.id;
      console.log('✅ [THUMBNAIL] Found media document:', mediaId);
      
      // Update Firestore with thumbnail status (wrapped in try/catch for safety)
      try {
        const thumbnailUpdate: any = {
          [`thumbnails.${thumbnailSize}Ready`]: true,
          [`thumbnails.${thumbnailSize}Path`]: name,
          [`thumbnails.updatedAt`]: FieldValue.serverTimestamp()
        };
        
        await mediaRef.set(thumbnailUpdate, { merge: true });
        console.log(`✅ [THUMBNAIL] Updated media document ${mediaId} with ${thumbnailSize} thumbnail ready:`, name);
      } catch (error) {
        // Server-side fallback: If Firestore update fails, log it but don't break
        // The UI will continue using the original image (graceful degradation)
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ [THUMBNAIL] Failed to update Firestore for ${mediaId}:`, errorMessage);
        console.error(`❌ [THUMBNAIL] Thumbnail exists at: ${name}, but Firestore update failed`);
        console.error(`❌ [THUMBNAIL] UI will continue using original image (graceful degradation)`);
        // Don't throw - let the function complete successfully
        // The original image path is still available, so nothing breaks visually
      }
      
      return; // Don't process thumbnails further
    }
    
    if (name.includes('/hls/') || name.endsWith('.m3u8') || name.endsWith('.ts')) {
      console.log('⏭️ Skipping HLS output file:', name);
      return;
    }
    
    const baseName = path.basename(name);
    if (baseName.startsWith('thumb_') || baseName.startsWith('poster_')) {
      console.log('⏭️ Skipping thumbnail/poster file:', name);
      return;
    }

    const ext = path.extname(name).toLowerCase();
    const looksLikeVideo =
      (ctype || '').startsWith('video/') ||
      ['.mp4','.mov','.m4v','.webm','.mkv'].includes(ext);

    const looksLikeImage =
      (ctype || '').startsWith('image/') ||
      ['.jpg','.jpeg','.png','.webp','.gif'].includes(ext);

    if (!looksLikeImage && !looksLikeVideo) {
      console.log('Unknown media type, skipping', { ctype, name, ext });
      return;
    }

    // Use the bucket from environment variable or default
    const bucketName = process.env.STORAGE_BUCKET || 'momsfitnessmojo-65d00.firebasestorage.app';
    const bucket = getStorage().bucket(bucketName);
    const dir = path.dirname(name);   // media/<uid>/<batchId>
    const base = path.parse(name).name;
    
    // Debug logging to confirm bucket usage
    console.log(`🔧 Using bucket for file operations: ${bucket.name}`);
    console.log(`🔧 Environment STORAGE_BUCKET: ${process.env.STORAGE_BUCKET || 'undefined (using default)'}`);
    console.log(`🔧 Final bucket used: ${bucketName}`);

    // Add initial delay to allow Firestore document creation to complete
    // This prevents race condition where storage trigger fires before Firestore write is replicated
    console.log(`⏳ Waiting 2 seconds for Firestore document creation...`);
    await sleep(2000);

    console.log(`🔍 Looking for media document for file: ${name}`);
    let mediaRef = await findMediaDocRef(name, dir, 15); // Increased retries from 10 to 15
    if (!mediaRef) {
      console.error(`❌ CRITICAL: No media doc found for ${name} after retries!`);
      console.error(`❌ This video will remain stuck in 'processing' state. Please check if the Firestore document was created properly.`);
      
      // Try one more time with a broader search - look for any document with matching filename in the folder
      try {
        const filename = path.basename(name);
        const searchFolder = dir.endsWith('/') ? dir : `${dir}/`;
        console.log(`🔍 Attempting fallback search for filename: ${filename} in folder: ${searchFolder}`);
        
        // Get all media documents and try to find a match by filename
        const allMedia = await db.collection('media')
          .where('storageFolder', '==', searchFolder)
          .limit(10)
          .get();
        
        console.log(`🔍 Found ${allMedia.docs.length} documents in folder ${searchFolder}:`, 
          allMedia.docs.map(d => ({
            id: d.id,
            filePath: d.data()?.filePath,
            storageFolder: d.data()?.storageFolder,
            transcodeStatus: d.data()?.transcodeStatus
          }))
        );
        
        // Try to find a document where the filePath ends with the filename
        const matchingDoc = allMedia.docs.find(doc => {
          const docPath = doc.data()?.filePath || '';
          return docPath.endsWith(filename) || docPath.includes(filename);
        });
        
        if (matchingDoc) {
          console.log(`✅ Found matching document via fallback search: ${matchingDoc.id}`);
          mediaRef = matchingDoc.ref; // Assign to outer variable
        } else {
          console.error(`❌ No matching document found even with fallback search`);
          return;
        }
      } catch (fallbackError) {
        console.error('❌ Fallback search also failed:', fallbackError);
        return;
      }
    }

    const tmpOriginal = path.join(
      os.tmpdir(),
      `${base}-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(name)}`
    );

    // Declare these for error logging (will be set in try block)
    let videoDuration: number | null = null;
    let videoWidth: number | null = null;
    let videoHeight: number | null = null;

    try {
      await bucket.file(name).download({ destination: tmpOriginal });

      const mediaSnapshot = await mediaRef.get();
      if (!mediaSnapshot.exists) {
        console.warn(`⚠️ Media document ${name} no longer exists. Skipping processing.`);
        try { fs.unlinkSync(tmpOriginal); } catch {}
        return;
      }

      const mediaData = mediaSnapshot.data();
      console.log(`Processing media file: ${name}`);
      console.log(`Found media doc: ${mediaRef.id}, current status: ${mediaData?.transcodeStatus || 'none'}`);
      console.log(`Media type: ${mediaData?.type}, uploaded by: ${mediaData?.uploadedBy}`);

      // Images → Let Firebase Extensions handle processing
      if (looksLikeImage) {
        console.log(`📸 [EXTENSION] Image uploaded: ${name} - Firebase Extensions will handle processing`);
        console.log(`📸 [EXTENSION] Media document:`, {
          mediaId: mediaRef.id,
          type: mediaData?.type,
          filePath: mediaData?.filePath,
          extensionWillProcess: true
        });
        
        // Just mark as ready - Firebase Extensions will process automatically
        await mediaRef.set({
          transcodeStatus: 'ready', // Extensions work independently
          processedBy: 'firebase-extension',
          processedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        console.log(`📸 [EXTENSION] ✅ Image marked as ready - Extensions will handle thumbnails and optimization`);
        return;
      }

      // Videos → poster + HLS + metadata
      await mediaRef.set({ transcodeStatus: 'processing' }, { merge: true });

      // ⚡ FAST THUMBNAIL GENERATION - Extract thumbnail IMMEDIATELY after download
      // This happens before probing to provide instant visual feedback
      console.log(`🖼️ [FAST] Generating thumbnail immediately for ${mediaRef.id}...`);
      let thumbnailPath: string | null = null;
      try {
        const posterLocal = path.join(os.tmpdir(), `poster_${base}-${Date.now()}.jpg`);
        // Extract frame at 1 second (fast, doesn't require duration)
        await new Promise<void>((res, rej) =>
          ffmpeg(tmpOriginal)
            .inputOptions(['-ss', '1']) // Seek to 1 second
            .outputOptions(['-frames:v', '1', '-q:v', '2'])
            .output(posterLocal)
            .on('end', () => res())
            .on('error', rej)
            .run()
        );

        const posterPath = `${dir}/poster_${base}.jpg`;
        await bucket.upload(posterLocal, {
          destination: posterPath,
          metadata: {
            contentType: 'image/jpeg',
            cacheControl: 'public,max-age=31536000,immutable'
          },
        });

        thumbnailPath = posterPath;
        // Update Firestore IMMEDIATELY so UI shows thumbnail right away
        await mediaRef.set({
          thumbnailPath: posterPath,
          transcodingMessage: 'Thumbnail ready, processing video...'
        }, { merge: true });

        console.log(`✅ [FAST] Thumbnail uploaded immediately for ${mediaRef.id}, poster: ${posterPath}`);
        fs.unlinkSync(posterLocal);
      } catch (e) {
        console.warn('⚠️ [FAST] Thumbnail generation failed (non-fatal), continuing with processing:', e);
      }

      // Probe video (can happen in parallel, but we need it for encoding decisions)
      const probe: any = await new Promise((res, rej) =>
        ffmpeg(tmpOriginal).ffprobe((err: any, data: any) => err ? rej(err) : res(data))
      );
      const stream = (probe.streams || []).find((s: any) => s.width && s.height) || {};
      const duration = probe.format?.duration != null ? Number(probe.format.duration) : null;
      const width = stream.width || null;
      const height = stream.height || null;
      const fileSize = object.size || 0;
      const frameRate = stream.r_frame_rate ? 
        parseFloat(stream.r_frame_rate.split('/')[0]) / parseFloat(stream.r_frame_rate.split('/')[1] || '1') : 
        30;
      
      // Store these for error logging
      videoDuration = duration;
      videoWidth = width;
      videoHeight = height;

      // Update Firestore with video metadata (including thumbnail if generated)
      await mediaRef.set({
        duration,
        dimensions: { width, height },
        ...(thumbnailPath ? { thumbnailPath } : {})
      }, { merge: true });

      // 🎬 MULTI-QUALITY ADAPTIVE STREAMING
      // Determine which quality levels to generate based on video resolution
      const is4K = (width && width >= 3840) || (height && height >= 2160);
      const is1080pOrHigher = (width && width >= 1920) || (height && height >= 1080);
      
      // Define quality levels to generate
      interface QualityLevel {
        name: string;
        label: string;
        resolution: string;
        scaleFilter: string;
        preset: string;
        crf: number;
        bandwidth: number; // Estimated bandwidth in bits per second
      }
      
      const qualityLevels: QualityLevel[] = [];
      
      // Always generate 720p
      qualityLevels.push({
        name: '720p',
        label: '720p',
        resolution: '1280x720',
        scaleFilter: 'scale=w=min(iw\\,1280):h=-2',
        preset: 'ultrafast',
        crf: 26,
        bandwidth: 2000000 // 2 Mbps
      });
      
      // Generate 1080p if video is at least 1080p
      if (is1080pOrHigher) {
        qualityLevels.push({
          name: '1080p',
          label: '1080p',
          resolution: '1920x1080',
          scaleFilter: 'scale=w=min(iw\\,1920):h=-2',
          preset: 'fast',
          crf: 23,
          bandwidth: 5000000 // 5 Mbps
        });
      }
      
      // Generate 2160p (4K) if video is at least 4K
      if (is4K) {
        qualityLevels.push({
          name: '2160p',
          label: '4K',
          resolution: '3840x2160',
          scaleFilter: 'scale=iw:ih', // Keep original resolution
          preset: 'medium',
          crf: 21,
          bandwidth: 20000000 // 20 Mbps
        });
      }
      
      console.log(`🎬 [ADAPTIVE] Generating ${qualityLevels.length} quality levels for ${mediaRef.id}:`, {
        qualities: qualityLevels.map(q => q.label),
        originalResolution: `${width}x${height}`,
        duration: `${duration}s`,
        fileSize: `${(fileSize / 1024 / 1024).toFixed(1)}MB`,
        frameRate: `${frameRate}fps`
      });
      
      // Update status
      await mediaRef.set({
        transcodeStartTime: FieldValue.serverTimestamp(),
        transcodingMessage: `Generating ${qualityLevels.length} quality levels...`
      }, { merge: true });
      
      const transcodeStartTime = Date.now();
      const TRANSCODE_TIMEOUTS: Record<string, number> = {
        '720p': 300000,  // 5 minutes
        '1080p': 600000, // 10 minutes - increased to handle large videos and resource contention during bulk uploads
        '2160p': 840000  // 14 minutes - increased from 12 to ensure completion
      };
      
      // Shared token for all HLS files
      const sharedToken = uuidv4();
      const hlsBasePath = `${dir}/hls/${base}/`; // media/<uid>/<batch>/hls/<base>/
      console.log(`🔑 Shared token for HLS: ${sharedToken}`);
      const cleanupHlsArtifacts = async () => {
        try {
          const [files] = await bucket.getFiles({ prefix: hlsBasePath });
          if (files.length) {
            await Promise.all(files.map(f => f.delete().catch(() => {})));
            console.log(`🧹 [ADAPTIVE] Cleaned up ${files.length} HLS artifacts at ${hlsBasePath}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️ [ADAPTIVE] Failed to clean HLS artifacts at ${hlsBasePath}:`, cleanupError);
        }
      };
      
      // Helper function to generate a single quality level
      const generateQualityLevel = async (quality: QualityLevel): Promise<{ quality: QualityLevel; storagePath: string }> => {
        const qualityDirLocal = path.join(os.tmpdir(), `hls_${base}_${quality.name}`);
        fs.mkdirSync(qualityDirLocal, { recursive: true });
        const qualityDirStorage = `${hlsBasePath}${quality.name}/`;
        
        console.log(`🎬 [ADAPTIVE] Starting ${quality.label} transcoding...`);
        
        await new Promise<void>((res, rej) => {
          const timeoutForQuality = TRANSCODE_TIMEOUTS[quality.name] ?? TRANSCODE_TIMEOUTS['720p'];
          const timeoutId = setTimeout(() => {
            rej(new Error(`Transcode timeout for ${quality.label}: Processing exceeded ${timeoutForQuality / 1000} seconds`));
          }, timeoutForQuality);
          
          ffmpeg(tmpOriginal)
            .addOptions([
              '-preset', quality.preset,
              '-crf', String(quality.crf),
              '-profile:v', 'main',
              '-vf', quality.scaleFilter,
              // Audio quality improvements
              '-c:a', 'aac',
              '-b:a', '192k',
              '-ar', '48000',
              '-ac', '2',
              // Optimized HLS settings for better adaptive streaming
              '-start_number', '0',
              '-hls_time', '6',              // 6-second segments (better for adaptation)
              '-hls_list_size', '10',        // Keep last 10 segments (reduces manifest size)
              '-hls_flags', 'independent_segments', // Better seeking
              '-hls_segment_type', 'mpegts',  // Explicit segment type
              '-f', 'hls'
            ])
            .output(path.join(qualityDirLocal, 'index.m3u8'))
            .on('start', (cmdline) => {
              console.log(`🎬 [ADAPTIVE] ${quality.label} FFmpeg started:`, cmdline.substring(0, 100) + '...');
            })
            .on('progress', (progress) => {
              const elapsed = (Date.now() - transcodeStartTime) / 1000;
              if (elapsed % 30 < 1) {
                console.log(`📊 [ADAPTIVE] ${quality.label} progress: ${progress.percent || 'unknown'}% (${elapsed.toFixed(1)}s)`);
              }
            })
            .on('end', () => {
              clearTimeout(timeoutId);
              console.log(`✅ [ADAPTIVE] ${quality.label} transcoding completed`);
              res();
            })
            .on('error', (err) => {
              clearTimeout(timeoutId);
              console.error(`❌ [ADAPTIVE] ${quality.label} FFmpeg error:`, err);
              rej(err);
            })
            .run();
        });
        
        const manifestLocalPath = path.join(qualityDirLocal, 'index.m3u8');
        rewriteManifestWithAbsoluteUrls(manifestLocalPath, bucket.name, qualityDirStorage, sharedToken);
        
        const files = fs.readdirSync(qualityDirLocal);
        await Promise.all(files.map(f => {
          const dest = `${qualityDirStorage}${f}`;
          const ct = f.endsWith('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : 'video/mp2t';
          return bucket.upload(path.join(qualityDirLocal, f), {
            destination: dest,
            metadata: {
              contentType: ct,
              cacheControl: 'public,max-age=31536000,immutable',
              metadata: { firebaseStorageDownloadTokens: sharedToken }
            },
          });
        }));
        
        fs.rmSync(qualityDirLocal, { recursive: true, force: true });
        
        return {
          quality,
          storagePath: `${qualityDirStorage}index.m3u8`
        };
      };

      // Helper function to create/update master playlist
      const createOrUpdateMasterPlaylist = async (completedQualities: { quality: QualityLevel; storagePath: string }[]): Promise<string> => {
        const masterPlaylistContent = [
          '#EXTM3U',
          '#EXT-X-VERSION:3'
        ];
        
        const createAbsoluteUrl = (storagePath: string) => {
          const encodedPath = encodeURIComponent(storagePath);
          return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${sharedToken}`;
        };
        
        completedQualities
          .sort((a, b) => a.quality.bandwidth - b.quality.bandwidth)
          .forEach(({ quality, storagePath }) => {
            const absoluteUrl = createAbsoluteUrl(storagePath);
            masterPlaylistContent.push(
              `#EXT-X-STREAM-INF:BANDWIDTH=${quality.bandwidth},RESOLUTION=${quality.resolution}`,
              absoluteUrl
            );
          });
        
        const masterPlaylistLocal = path.join(os.tmpdir(), `master_${base}.m3u8`);
        fs.writeFileSync(masterPlaylistLocal, masterPlaylistContent.join('\n') + '\n');
        
        const masterPlaylistStorage = `${hlsBasePath}master.m3u8`;
        await bucket.upload(masterPlaylistLocal, {
          destination: masterPlaylistStorage,
          metadata: {
            contentType: 'application/vnd.apple.mpegurl',
            cacheControl: 'public,max-age=31536000,immutable',
            metadata: { firebaseStorageDownloadTokens: sharedToken }
          },
        });
        
        fs.unlinkSync(masterPlaylistLocal);
        return masterPlaylistStorage;
      };

      // Feature flag for progressive quality generation (mark ready after 720p)
      const ENABLE_PROGRESSIVE_QUALITY = process.env.ENABLE_PROGRESSIVE_QUALITY !== 'false'; // Default: true
      
      let qualityResults: { quality: QualityLevel; storagePath: string }[];
      
      if (ENABLE_PROGRESSIVE_QUALITY) {
        // PROGRESSIVE MODE: Generate 720p first, mark as ready, then continue others in background
        console.log(`🚀 [PROGRESSIVE] Progressive quality generation enabled - marking ready after 720p`);
        
        const quality720p = qualityLevels.find(q => q.name === '720p');
        if (!quality720p) {
          throw new Error('720p quality level not found - cannot proceed with progressive generation');
        }
        
        let quality720pResult: { quality: QualityLevel; storagePath: string };
        try {
          quality720pResult = await generateQualityLevel(quality720p);
          qualityResults = [quality720pResult];
        } catch (error) {
          console.error(`❌ [PROGRESSIVE] 720p generation failed:`, error);
          await cleanupHlsArtifacts();
          throw new Error('720p transcoding failed - video cannot play');
        }
        
        const masterPlaylistStorage = await createOrUpdateMasterPlaylist(qualityResults);
        const fallbackHlsPath = quality720pResult.storagePath;
        
        // Mark video as READY immediately (user can play now!)
        const currentDoc = await mediaRef.get();
        const currentData = currentDoc.exists ? currentDoc.data() : {};
        const currentSources = currentData?.sources || {};
        
        const mergedSources = {
          ...currentSources,
          hlsMaster: masterPlaylistStorage,
          hls: fallbackHlsPath
        };
        
        // Store sharedToken in Firestore for worker function to access
        await mediaRef.set({
          sources: mergedSources,
          transcodeStatus: 'ready',
          transcodeUpdatedAt: FieldValue.serverTimestamp(),
          qualityLevels: [{
            name: quality720p.name,
            label: quality720p.label,
            resolution: quality720p.resolution,
            bandwidth: quality720p.bandwidth,
            storagePath: quality720pResult.storagePath // Store path for master playlist
          }],
          transcodingMessage: '720p ready, generating higher qualities...',
          hlsSharedToken: sharedToken // Store for worker function
        }, { merge: true });
        
        console.log(`✅ [PROGRESSIVE] Video marked as READY after 720p completion - user can play now!`);
        
        // Continue with higher qualities via Cloud Tasks (proper background processing)
        const otherQualities = qualityLevels.filter(q => q.name !== '720p');
        if (otherQualities.length > 0) {
          console.log(`🔄 [PROGRESSIVE] Enqueuing ${otherQualities.length} higher quality levels via Cloud Tasks...`);
          
          // Store full quality configs in Firestore for worker function to access
          const qualityConfigsMap: Record<string, any> = {};
          qualityLevels.forEach(q => {
            qualityConfigsMap[q.name] = {
              name: q.name,
              label: q.label,
              resolution: q.resolution,
              scaleFilter: q.scaleFilter,
              preset: q.preset,
              crf: q.crf,
              bandwidth: q.bandwidth
            };
          });
          
          // Initialize background processing tracking
          await mediaRef.set({
            backgroundProcessingStatus: 'processing',
            backgroundProcessingStarted: FieldValue.serverTimestamp(),
            backgroundProcessingTargetQualities: otherQualities.map(q => q.name),
            failedQualities: [],
            qualityConfigs: qualityConfigsMap // Store for worker function
          }, { merge: true });
          
          // Get base name for HLS paths
          const base = path.parse(name).name;
          
          // Enqueue only the FIRST quality (others will be chained by the worker)
          // This ensures sequential processing and prevents overwhelming the system
          const firstQuality = otherQualities[0];
          const remainingAfterFirst = otherQualities.slice(1).map(q => q.name);
          
          try {
            await enqueueQualityTask(mediaRef.id, firstQuality.name, {
              mediaId: mediaRef.id,
              qualityLevel: firstQuality.name,
              filePath: name,
              storageFolder: dir,
              hlsBasePath: `${dir}/hls/${base}/`,
              sharedToken: sharedToken,
              originalResolution: `${width}x${height}`,
              remainingQualities: remainingAfterFirst,
              qualityConfig: {
                name: firstQuality.name,
                label: firstQuality.label,
                resolution: firstQuality.resolution,
                scaleFilter: firstQuality.scaleFilter,
                preset: firstQuality.preset,
                crf: firstQuality.crf,
                bandwidth: firstQuality.bandwidth
              }
            });
            
            console.log(`✅ [PROGRESSIVE] Enqueued first Cloud Task for ${firstQuality.label} (remaining will chain)`);
          } catch (enqueueError) {
            console.error(`❌ [PROGRESSIVE] Failed to enqueue task for ${firstQuality.label}:`, enqueueError);
            
            // Track failed enqueue in Firestore
            try {
              const currentDocForFailure = await mediaRef.get();
              const currentDataForFailure = currentDocForFailure.exists ? currentDocForFailure.data() : {};
              const currentFailedQualities = currentDataForFailure?.failedQualities || [];
              
              await mediaRef.set({
                failedQualities: [
                  ...currentFailedQualities,
                  {
                    name: firstQuality.name,
                    label: firstQuality.label,
                    error: `Failed to enqueue task: ${enqueueError instanceof Error ? enqueueError.message : String(enqueueError)}`,
                    failedAt: FieldValue.serverTimestamp()
                  }
                ]
              }, { merge: true });
            } catch (updateError) {
              console.error(`❌ Failed to update failedQualities for ${firstQuality.label}:`, updateError);
            }
          }
          
          console.log(`✅ [PROGRESSIVE] First quality task enqueued, chaining will continue automatically`);
        }
        
        return; // Return early in progressive mode
      } else {
        // STANDARD MODE: Generate all qualities in parallel, wait for all
        console.log(`⏳ [ADAPTIVE] Standard mode - generating all qualities in parallel`);
        
        const qualitySettled = await Promise.allSettled(
          qualityLevels.map(async (quality) => {
            return await generateQualityLevel(quality);
          })
        );
        
        qualityResults = qualitySettled
          .map((result, index) => {
            if (result.status === 'fulfilled') return result.value;
            console.warn(`⚠️ [ADAPTIVE] ${qualityLevels[index].label} failed:`, result.reason);
            return null;
          })
          .filter((value): value is { quality: QualityLevel; storagePath: string } => value !== null);
      }

      if (!qualityResults.length) {
        throw new Error('All quality levels failed to transcode');
      }
      const has720p = qualityResults.some(r => r.quality.name === '720p');
      if (!has720p) {
        console.error(`❌ [ADAPTIVE] Critical: 720p failed for ${mediaRef.id}`);
        await cleanupHlsArtifacts();
        throw new Error('720p transcoding failed - video cannot play');
      }
      
      // Create master playlist with absolute URLs (with tokens)
      const masterPlaylistContent = [
        '#EXTM3U',
        '#EXT-X-VERSION:3'
      ];
      
      // Helper function to create absolute Firebase Storage URL with token
      const createAbsoluteUrl = (storagePath: string) => {
        const encodedPath = encodeURIComponent(storagePath);
        return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${sharedToken}`;
      };
      
      // Add stream info for each quality (sorted by bandwidth, lowest first)
      qualityResults
        .sort((a, b) => a.quality.bandwidth - b.quality.bandwidth)
        .forEach(({ quality, storagePath }) => {
          // Use absolute URL with token instead of relative path
          const absoluteUrl = createAbsoluteUrl(storagePath);
          console.log(`📋 [ADAPTIVE] Master playlist: Adding ${quality.name} with absolute URL:`, {
            quality: quality.name,
            storagePath,
            absoluteUrl: absoluteUrl.substring(0, 100) + '...'
          });
          masterPlaylistContent.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${quality.bandwidth},RESOLUTION=${quality.resolution}`,
            absoluteUrl
          );
        });
      
      // Write master playlist locally
      const masterPlaylistLocal = path.join(os.tmpdir(), `master_${base}.m3u8`);
      fs.writeFileSync(masterPlaylistLocal, masterPlaylistContent.join('\n') + '\n');
      
      // Upload master playlist
      const masterPlaylistStorage = `${hlsBasePath}master.m3u8`;
      await bucket.upload(masterPlaylistLocal, {
        destination: masterPlaylistStorage,
        metadata: {
          contentType: 'application/vnd.apple.mpegurl',
          cacheControl: 'public,max-age=31536000,immutable',
          metadata: { firebaseStorageDownloadTokens: sharedToken }
        },
      });
      
      // Cleanup master playlist local file
      fs.unlinkSync(masterPlaylistLocal);
      
      // Use first quality (720p) as fallback single manifest for backward compatibility
      const fallbackHlsPath = qualityResults.find(r => r.quality.name === '720p')?.storagePath || qualityResults[0].storagePath;
      
      if (!fallbackHlsPath) {
        throw new Error(`❌ [ADAPTIVE] No fallback HLS path found for ${mediaRef.id}`);
      }
      
      console.log(`🔍 [ADAPTIVE] Starting final Firestore update for ${mediaRef.id}`, {
        masterPlaylist: masterPlaylistStorage,
        fallbackHls: fallbackHlsPath,
        qualityCount: qualityLevels.length
      });
      
      // Manual merge approach: Read current document, merge sources object, then update
      console.log(`🔍 [ADAPTIVE] Reading current Firestore document for ${mediaRef.id}`);
      const currentDoc = await mediaRef.get();
      if (!currentDoc.exists) {
        console.warn(`⚠️ [ADAPTIVE] Media document ${mediaRef.id} deleted during processing - skipping Firestore update.`);
        await cleanupHlsArtifacts();
        return;
      }
      const currentData = currentDoc.data() || {};
      const currentSources = currentData?.sources || {};
      
      console.log(`🔍 [ADAPTIVE] Current document data:`, {
        hasSources: !!currentData?.sources,
        sourcesKeys: currentData?.sources ? Object.keys(currentData.sources) : [],
        transcodeStatus: currentData?.transcodeStatus
      });
      
      // Merge sources object manually
      const mergedSources = {
        ...currentSources,
        hlsMaster: masterPlaylistStorage,
        hls: fallbackHlsPath
      };
      
      console.log(`🔍 [ADAPTIVE] About to update Firestore with merged sources:`, {
        mergedSourcesKeys: Object.keys(mergedSources),
        hasHlsMaster: !!mergedSources.hlsMaster,
        hasHls: !!mergedSources.hls
      });
      
      // Final write - use manual merge approach
      const updateData = {
        sources: mergedSources,
        transcodeStatus: 'ready',
        transcodeUpdatedAt: FieldValue.serverTimestamp(),
        qualityLevels: qualityLevels.map(q => ({
          name: q.name,
          label: q.label,
          resolution: q.resolution,
          bandwidth: q.bandwidth
        }))
      };
      
      await mediaRef.set(updateData, { merge: true });
      
      // Verify the update
      const verifyDoc = await mediaRef.get();
      const verifyData = verifyDoc.exists ? verifyDoc.data() : {};
      console.log(`✅ [ADAPTIVE] Firestore updated with sources:`, {
        hasSources: !!verifyData?.sources,
        sourcesKeys: verifyData?.sources ? Object.keys(verifyData.sources) : [],
        hasHlsMaster: !!verifyData?.sources?.hlsMaster,
        hasHls: !!verifyData?.sources?.hls,
        hlsMasterValue: verifyData?.sources?.hlsMaster,
        hlsValue: verifyData?.sources?.hls
      });
      
      console.log(`✅ [ADAPTIVE] Multi-quality HLS ready for ${mediaRef.id}:`, {
        masterPlaylist: masterPlaylistStorage,
        fallbackHls: fallbackHlsPath,
        qualityCount: qualityLevels.length,
        qualities: qualityLevels.map(q => q.label).join(', ')
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('exceeded');
      
      console.error(`❌ Transcode error for ${name}:`, {
        error: errorMessage,
        isTimeout,
        mediaId: mediaRef?.id,
        videoDuration: videoDuration,
        resolution: `${videoWidth}x${videoHeight}`
      });
      
      try {
        const errorDetails = {
          transcodeStatus: 'failed',
          transcodeError: errorMessage,
          transcodeFailedAt: FieldValue.serverTimestamp(),
          transcodingMessage: isTimeout 
            ? 'Processing timed out - video may be too large. Please try uploading a smaller file.' 
            : 'Processing failed. Please try uploading again.'
        };
        await mediaRef.set(errorDetails, { merge: true });
        console.log(`✅ Marked ${mediaRef.id} as failed with error details`);
      } catch (updateError) {
        console.error('Failed to update media document with error status:', updateError);
      }
    } finally {
      try { if (fs.existsSync(tmpOriginal)) fs.unlinkSync(tmpOriginal); } catch {}
    }
  }
);

// ───────────────── FAMILY MEMBER: Clean up linked attendees ─────────────────
export const onFamilyMemberDeleted = onDocumentDeleted("users/{userId}/familyMembers/{familyMemberId}", async (event) => {
  const { userId, familyMemberId } = event.params;
  
  console.log(`🧹 Family member deleted: ${familyMemberId} for user ${userId}`);
  
  try {
    // Find all events where this user has attendees linked to this family member
    const eventsSnapshot = await db.collection('events').get();
    
    const batch = db.batch();
    let totalUpdated = 0;
    
    for (const eventDoc of eventsSnapshot.docs) {
      const attendeesSnapshot = await db.collection('events')
        .doc(eventDoc.id)
        .collection('attendees')
        .where('userId', '==', userId)
        .where('familyMemberId', '==', familyMemberId)
        .get();
      
      attendeesSnapshot.docs.forEach(attendeeDoc => {
        // Option 1: Clear the familyMemberId but keep the attendee record
        batch.update(attendeeDoc.ref, {
          familyMemberId: null,
          updatedAt: FieldValue.serverTimestamp()
        });
        totalUpdated++;
        
        // Option 2: Delete the attendee entirely (uncomment if preferred)
        // batch.delete(attendeeDoc.ref);
        // totalUpdated++;
      });
    }
    
    await batch.commit();
    console.log(`✅ Updated ${totalUpdated} attendee records after family member deletion`);
    
  } catch (error) {
    console.error('❌ Failed to clean up attendees after family member deletion:', error);
  }
});

// Lightweight handler for exercise media uploads. This does not transcode; it records
// the upload against the exercise document so an admin pipeline can process it.
export const onExerciseMediaUpload = onObjectFinalized({
  region: 'us-east1',
  timeoutSeconds: 540,
  memory: '2GiB',
}, async (event) => {
  const object = event.data;
  const name = object.name || '';
  const contentType = object.contentType || '';
  if (!name.startsWith('exercise-media/uploads/')) return;
  const parts = name.split('/');
  // expected: exercise-media/uploads/{slug}/{filename}
  const slug = parts[2];
  if (!slug) return;

  const bucketName = object.bucket; // use event bucket
  const bucket = getStorage().bucket(bucketName);

  // Ensure doc exists and record raw upload path
  await db.collection('exercises').doc(slug).set({
    slug,
    status: 'draft',
    media: { rawUploadPath: name },
    lastReviewedAt: new Date(),
  }, { merge: true });

  // Prepare local tmp paths
  const base = path.parse(name).name.replace(/[^a-zA-Z0-9_-]/g, '') || `ex_${Date.now()}`;
  const tmpSrc = path.join(os.tmpdir(), `ex-src-${base}-${Date.now()}`);
  const tmpPoster = path.join(os.tmpdir(), `ex-poster-${base}.jpg`);
  const tmpLoop = path.join(os.tmpdir(), `ex-loop-${base}.mp4`);
  const outPoster = `exercise-media/processed/${slug}/poster.jpg`;
  const outLoop = `exercise-media/processed/${slug}/loop.mp4`;
  const outHlsDir = `exercise-media/processed/${slug}/hls/`;
  const outHlsIndex = `${outHlsDir}index.m3u8`;

  try {
    // Download source
    await bucket.file(name).download({ destination: tmpSrc });

    // Generate poster and loop if video
    if (contentType.startsWith('video/')) {
      try {
        await new Promise<void>((resolve, reject) => {
          const command = ffmpeg(tmpSrc).inputOptions(['-ss 1']).output(tmpPoster);
          if (typeof (command as any).frames === 'function') {
            (command as any).frames(1);
          }
          command
            .on('end', () => resolve())
            .on('error', (err: Error) => reject(err))
            .run();
        });
        await bucket.upload(tmpPoster, { destination: outPoster, metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' } });
      } catch (e) {
        console.warn('[ExerciseMedia] Poster generation failed', (e as any)?.message);
      }
      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(tmpSrc)
            .inputOptions(['-ss 1'])
            .outputOptions(['-t 3', '-an', '-movflags +faststart'])
            .videoCodec('libx264')
            .output(tmpLoop)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
        });
        await bucket.upload(tmpLoop, { destination: outLoop, metadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000' } });
      } catch (e) {
        console.warn('[ExerciseMedia] Loop generation failed', (e as any)?.message);
      }

      // Minimal HLS (single rendition 720p)
      try {
        const hlsLocalDir = path.join(os.tmpdir(), `ex-hls-${base}-${Date.now()}`);
        fs.mkdirSync(hlsLocalDir, { recursive: true });
        const hlsLocalIndex = path.join(hlsLocalDir, 'index.m3u8');
        await new Promise<void>((resolve, reject) => {
          ffmpeg(tmpSrc)
            .size('?x720')
            .videoCodec('libx264')
            .outputOptions([
              '-preset veryfast',
              '-profile:v main',
              '-crf 23',
              '-sc_threshold 0',
              '-g 48',
              '-keyint_min 48',
              '-hls_time 4',
              '-hls_playlist_type vod',
              '-hls_segment_filename', path.join(hlsLocalDir, 'seg_%03d.ts'),
            ])
            .audioCodec('aac')
            .audioBitrate('128k')
            .output(hlsLocalIndex)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
        });
        // Upload HLS files
        const files = fs.readdirSync(hlsLocalDir);
        for (const f of files) {
          const full = path.join(hlsLocalDir, f);
          const dest = `${outHlsDir}${f}`;
          const ct = f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t';
          await bucket.upload(full, { destination: dest, metadata: { contentType: ct, cacheControl: 'public, max-age=3600' } });
        }
      } catch (e) {
        console.warn('[ExerciseMedia] HLS generation failed', (e as any)?.message);
      }
    } else if (contentType.startsWith('image/')) {
      // Normalize poster using sharp
      try {
        const posterLocal = tmpPoster;
        await sharp(tmpSrc).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(posterLocal);
        await bucket.upload(posterLocal, { destination: outPoster, metadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=31536000' } });
      } catch (e) {
        console.warn('[ExerciseMedia] Poster normalize failed', (e as any)?.message);
      }
    }

    // Store storage paths (client resolves to download URLs at render time)
    await db.collection('exercises').doc(slug).set({
      media: {
        posterPath: outPoster,
        loopPath: outLoop,
        hlsPath: outHlsIndex,
        rawUploadPath: name,
      },
      lastReviewedAt: new Date(),
    }, { merge: true });

    console.log('[ExerciseMedia] Processed upload for', slug, name);
  } catch (error) {
    console.error('[ExerciseMedia] Failed to process upload', { slug, name, error: (error as any)?.message });
  } finally {
    try { fs.existsSync(tmpSrc) && fs.unlinkSync(tmpSrc); } catch {}
    try { fs.existsSync(tmpPoster) && fs.unlinkSync(tmpPoster); } catch {}
    try { fs.existsSync(tmpLoop) && fs.unlinkSync(tmpLoop); } catch {}
  }
});

// ───────────────── MANUAL FIX: Reset Stuck Processing Videos ─────────────────
export const resetStuckProcessing = onDocumentCreated("manual_fixes/{fixId}", async (event) => {
  const data = event.data?.data();
  if (!data || data.type !== 'reset_stuck_processing') return;

  console.log('🔄 Manual fix triggered: resetting stuck processing videos');

  try {
    await event.data?.ref.set({ status: 'processing' }, { merge: true });

    const stuckMedia = await db.collection('media')
      .where('transcodeStatus', '==', 'processing')
      .where('type', '==', 'video')
      .get();

    console.log(`Found ${stuckMedia.docs.length} stuck processing videos`);

    const updates = stuckMedia.docs.map(async (doc) => {
      const mediaData = doc.data();
      const hasHls = mediaData.sources?.hls;

      await doc.ref.set({
        transcodeStatus: hasHls ? 'ready' : 'failed',
        lastManualFix: FieldValue.serverTimestamp(),
        manualFixReason: hasHls ? 'HLS exists but status was stuck' : 'No HLS found, marking as failed'
      }, { merge: true });

      console.log(`✅ Reset ${doc.id} to ${hasHls ? 'ready' : 'failed'}`);
    });

    await Promise.all(updates);
    console.log(`✅ Successfully reset ${stuckMedia.docs.length} stuck videos`);

    await event.data?.ref.set({
      status: 'completed',
      processedCount: stuckMedia.docs.length,
      completedAt: FieldValue.serverTimestamp()
    }, { merge: true });

  } catch (error) {
    console.error('❌ Failed to reset stuck processing videos:', error);
    await event.data?.ref.set({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      failedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
});

// ───────────────── WORKER FUNCTION: Process Quality Level (Cloud Tasks) ─────────────────

/**
 * Worker function that processes a single quality level
 * Triggered by Cloud Tasks via HTTP POST
 */
export const processQualityLevel = onRequestWithCors({
  region: 'us-east1',
  memory: '8GiB',
  timeoutSeconds: 900, // 15 minutes - increased to support 4K processing (2160p needs up to 14 minutes)
  cpu: 2,
  maxInstances: 15, // Increased from 10 to handle bulk uploads (102+ files) with better throughput
}, async (request, response) => {
  // Only allow POST requests
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let taskPayload: any;
  try {
    // Parse task payload from request body
    if (request.body.message && request.body.message.data) {
      // Cloud Tasks sends base64 encoded payload
      const decodedData = Buffer.from(request.body.message.data, 'base64').toString('utf-8');
      taskPayload = JSON.parse(decodedData);
    } else {
      taskPayload = request.body;
    }
  } catch (error) {
    console.error('❌ [WORKER] Failed to parse task payload:', error);
    response.status(400).json({ error: 'Invalid task payload' });
    return;
  }

  const { mediaId, qualityLevel, filePath, storageFolder, hlsBasePath, sharedToken, originalResolution, remainingQualities, qualityConfig } = taskPayload;

  if (!mediaId || !qualityLevel || !filePath || !qualityConfig) {
    console.error('❌ [WORKER] Missing required task parameters:', { mediaId, qualityLevel, filePath, hasQualityConfig: !!qualityConfig });
    response.status(400).json({ error: 'Missing required parameters' });
    return;
  }

  console.log(`🎬 [WORKER] Processing quality level: ${qualityLevel} for media: ${mediaId}`);

  const bucketName = process.env.STORAGE_BUCKET || 'momsfitnessmojo-65d00.firebasestorage.app';
  const bucket = getStorage().bucket(bucketName);
  const mediaRef = db.doc(`media/${mediaId}`);
  const tmpOriginal = path.join(os.tmpdir(), `${path.basename(filePath)}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const TRANSCODE_TIMEOUTS: Record<string, number> = {
    '720p': 300000,  // 5 minutes
    '1080p': 600000, // 10 minutes - increased to handle large videos and resource contention during bulk uploads
    '2160p': 840000  // 14 minutes - increased from 12 to ensure completion before function timeout (15 min)
  };

  try {
    // Verify media document exists
    const mediaDoc = await mediaRef.get();
    if (!mediaDoc.exists) {
      console.error(`❌ [WORKER] Media document ${mediaId} not found`);
      response.status(404).json({ error: 'Media document not found' });
      return;
    }

    const mediaData = mediaDoc.data();
    const tokenToUse = sharedToken || mediaData?.hlsSharedToken || uuidv4();

    // Download original file from Storage
    console.log(`📥 [WORKER] Downloading original file: ${filePath}`);
    await bucket.file(filePath).download({ destination: tmpOriginal });
    console.log(`✅ [WORKER] Original file downloaded to: ${tmpOriginal}`);

    // Process the quality level
    const base = path.parse(filePath).name;
    const qualityDirLocal = path.join(os.tmpdir(), `hls_${base}_${qualityLevel}_${Date.now()}`);
    fs.mkdirSync(qualityDirLocal, { recursive: true });
    const qualityDirStorage = `${hlsBasePath}${qualityLevel}/`;

    console.log(`🎬 [WORKER] Starting ${qualityConfig.label} transcoding...`);
    const transcodeStartTime = Date.now();

    await new Promise<void>((res, rej) => {
      const timeoutForQuality = TRANSCODE_TIMEOUTS[qualityLevel] ?? TRANSCODE_TIMEOUTS['720p'];
      const timeoutId = setTimeout(() => {
        rej(new Error(`Transcode timeout for ${qualityConfig.label}: Processing exceeded ${timeoutForQuality / 1000} seconds`));
      }, timeoutForQuality);

      ffmpeg(tmpOriginal)
        .addOptions([
          '-preset', qualityConfig.preset,
          '-crf', String(qualityConfig.crf),
          '-profile:v', 'main',
          '-vf', qualityConfig.scaleFilter,
          // Audio quality improvements
          '-c:a', 'aac',
          '-b:a', '192k',
          '-ar', '48000',
          '-ac', '2',
          // Optimized HLS settings for better adaptive streaming
          '-start_number', '0',
          '-hls_time', '6',              // 6-second segments (better for adaptation)
          '-hls_list_size', '10',        // Keep last 10 segments (reduces manifest size)
          '-hls_flags', 'independent_segments', // Better seeking
          '-hls_segment_type', 'mpegts',  // Explicit segment type
          '-f', 'hls'
        ])
        .output(path.join(qualityDirLocal, 'index.m3u8'))
        .on('start', (cmdline) => {
          console.log(`🎬 [WORKER] ${qualityConfig.label} FFmpeg started:`, cmdline.substring(0, 100) + '...');
        })
        .on('progress', (progress) => {
          const elapsed = (Date.now() - transcodeStartTime) / 1000;
          if (elapsed % 30 < 1) {
            console.log(`📊 [WORKER] ${qualityConfig.label} progress: ${progress.percent || 'unknown'}% (${elapsed.toFixed(1)}s)`);
          }
        })
        .on('end', () => {
          clearTimeout(timeoutId);
          console.log(`✅ [WORKER] ${qualityConfig.label} transcoding completed`);
          res();
        })
        .on('error', (err) => {
          clearTimeout(timeoutId);
          console.error(`❌ [WORKER] ${qualityConfig.label} FFmpeg error:`, err);
          rej(err);
        })
        .run();
    });

    // Rewrite manifest with absolute URLs
    const manifestLocalPath = path.join(qualityDirLocal, 'index.m3u8');
    rewriteManifestWithAbsoluteUrls(manifestLocalPath, bucket.name, qualityDirStorage, tokenToUse);

    // Upload all HLS files with retry logic for network errors
    const files = fs.readdirSync(qualityDirLocal);
    
    const uploadWithRetry = async (filePath: string, dest: string, contentType: string, maxRetries = 3) => {
      let lastError: any;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await bucket.upload(filePath, {
            destination: dest,
            metadata: {
              contentType,
              cacheControl: 'public,max-age=31536000,immutable',
              metadata: { firebaseStorageDownloadTokens: tokenToUse }
            },
            // Enable resumable uploads (default, but explicit for clarity)
            resumable: true,
          });
          if (attempt > 1) {
            console.log(`✅ [WORKER] Upload succeeded on retry ${attempt} for ${dest}`);
          }
          return;
        } catch (error: any) {
          lastError = error;
          const isNetworkError = error.code === 'ECONNRESET' || 
                                 error.code === 'ETIMEDOUT' || 
                                 error.code === 'ENOTFOUND' ||
                                 error.message?.includes('socket hang up') ||
                                 error.message?.includes('timeout');
          
          if (isNetworkError && attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
            console.warn(`⚠️ [WORKER] Upload failed (attempt ${attempt}/${maxRetries}) for ${dest}: ${error.message}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
      }
      throw lastError;
    };
    
    await Promise.all(files.map(f => {
      const dest = `${qualityDirStorage}${f}`;
      const ct = f.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : 'video/mp2t';
      return uploadWithRetry(path.join(qualityDirLocal, f), dest, ct);
    }));

    // Cleanup local files
    fs.rmSync(qualityDirLocal, { recursive: true, force: true });
    fs.unlinkSync(tmpOriginal);

    const qualityStoragePath = `${qualityDirStorage}index.m3u8`;
    console.log(`✅ [WORKER] ${qualityConfig.label} uploaded to: ${qualityStoragePath}`);

    // Get current media document to read existing quality levels
    const currentDoc = await mediaRef.get();
    const currentData = currentDoc.exists ? currentDoc.data() : {};
    const currentQualityLevels = currentData?.qualityLevels || [];
    const currentSources = currentData?.sources || {};

    // Check for duplicate quality level (prevent duplicates from retries or race conditions)
    const existingQualityIndex = currentQualityLevels.findIndex((q: any) => q.name === qualityConfig.name);
    let updatedQualityLevels: any[];
    
    if (existingQualityIndex !== -1) {
      console.log(`⚠️ [WORKER] Quality level ${qualityConfig.name} already exists, updating instead of duplicating`);
      // Update existing entry instead of creating duplicate
      updatedQualityLevels = [...currentQualityLevels];
      updatedQualityLevels[existingQualityIndex] = {
        name: qualityConfig.name,
        label: qualityConfig.label,
        resolution: qualityConfig.resolution,
        bandwidth: qualityConfig.bandwidth,
        storagePath: qualityStoragePath,
        completedAt: Timestamp.now()
      };
    } else {
      // Update Firestore with new quality level (include storagePath for master playlist reconstruction)
      // Note: Cannot use FieldValue.serverTimestamp() inside arrays, so use Timestamp.now()
      const completedAtTimestamp = Timestamp.now();
      updatedQualityLevels = [
        ...currentQualityLevels,
        {
          name: qualityConfig.name,
          label: qualityConfig.label,
          resolution: qualityConfig.resolution,
          bandwidth: qualityConfig.bandwidth,
          storagePath: qualityStoragePath, // Store path for master playlist
          completedAt: completedAtTimestamp
        }
      ];
    }

    // Create/update master playlist with all completed qualities
    const createAbsoluteUrl = (storagePath: string) => {
      const encodedPath = encodeURIComponent(storagePath);
      return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${tokenToUse}`;
    };

    const masterPlaylistContent = [
      '#EXTM3U',
      '#EXT-X-VERSION:3'
    ];

    // Remove duplicates by quality name before generating master playlist
    const uniqueQualities = updatedQualityLevels.reduce((acc: any[], q: any) => {
      const existing = acc.find((existing: any) => existing.name === q.name);
      if (!existing) {
        acc.push(q);
      } else {
        // Keep the most recent one (with latest completedAt)
        const existingIndex = acc.indexOf(existing);
        if (q.completedAt && existing.completedAt) {
          const qTime = q.completedAt.toMillis ? q.completedAt.toMillis() : q.completedAt;
          const existingTime = existing.completedAt.toMillis ? existing.completedAt.toMillis() : existing.completedAt;
          if (qTime > existingTime) {
            acc[existingIndex] = q; // Replace with newer entry
          }
        }
      }
      return acc;
    }, []);

    // Sort qualities by bandwidth (lowest first)
    uniqueQualities
      .sort((a, b) => (a.bandwidth || 0) - (b.bandwidth || 0))
      .forEach((q: any) => {
        // Use storagePath from quality level (stored in Firestore)
        const qualityPath = q.storagePath || `${hlsBasePath}${q.name}/index.m3u8`;
        const absoluteUrl = createAbsoluteUrl(qualityPath);
        masterPlaylistContent.push(
          `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth || 0},RESOLUTION=${q.resolution || '1280x720'}`,
          absoluteUrl
        );
      });

    const masterPlaylistLocal = path.join(os.tmpdir(), `master_${base}_${Date.now()}.m3u8`);
    fs.writeFileSync(masterPlaylistLocal, masterPlaylistContent.join('\n') + '\n');
    const masterPlaylistStorage = `${hlsBasePath}master.m3u8`;
    await bucket.upload(masterPlaylistLocal, {
      destination: masterPlaylistStorage,
      metadata: {
        contentType: 'application/vnd.apple.mpegurl',
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: { firebaseStorageDownloadTokens: tokenToUse }
      },
    });
    fs.unlinkSync(masterPlaylistLocal);

    // Remove duplicates from qualityLevels before storing (in case of existing duplicates)
    const uniqueQualityLevels = updatedQualityLevels.reduce((acc: any[], q: any) => {
      const existing = acc.find((existing: any) => existing.name === q.name);
      if (!existing) {
        acc.push(q);
      } else {
        // Keep the most recent one (with latest completedAt)
        const existingIndex = acc.indexOf(existing);
        if (q.completedAt && existing.completedAt) {
          const qTime = q.completedAt.toMillis ? q.completedAt.toMillis() : q.completedAt;
          const existingTime = existing.completedAt.toMillis ? existing.completedAt.toMillis() : existing.completedAt;
          if (qTime > existingTime) {
            acc[existingIndex] = q; // Replace with newer entry
          }
        }
      }
      return acc;
    }, []);

    // Update Firestore
    const updateData: any = {
      sources: {
        ...currentSources,
        hlsMaster: masterPlaylistStorage
      },
      qualityLevels: uniqueQualityLevels, // Store unique qualities only
    };

    // Check if this was the last quality
    if (remainingQualities.length === 0) {
      updateData.backgroundProcessingStatus = 'completed';
      updateData.backgroundProcessingCompleted = FieldValue.serverTimestamp();
      updateData.transcodingMessage = 'All qualities ready';
      
      // Get unique quality names to calculate accurate summary (use uniqueQualityLevels from above)
      const uniqueQualityNames = new Set(uniqueQualityLevels.map((q: any) => q.name));
      const uniqueQualityCount = uniqueQualityNames.size;
      
      updateData.backgroundProcessingSummary = {
        totalExpected: currentData?.backgroundProcessingTargetQualities?.length || 1,
        succeeded: uniqueQualityCount, // Use unique count to avoid duplicates
        failed: currentData?.failedQualities?.length || 0,
        completedAt: Timestamp.now() // Use Timestamp.now() instead of FieldValue for nested objects
      };
      
      // Set transcodeStatus to 'ready' when all background processing completes
      // This ensures status sync between transcodeStatus and backgroundProcessingStatus
      updateData.transcodeStatus = 'ready';
      updateData.transcodeUpdatedAt = FieldValue.serverTimestamp();
      
      console.log(`✅ [WORKER] All background processing completed - setting transcodeStatus to 'ready'`);
    } else {
      updateData.transcodingMessage = `${uniqueQualityLevels.length} quality levels ready, ${remainingQualities.length} remaining...`;
    }

    await mediaRef.set(updateData, { merge: true });

    console.log(`✅ [WORKER] ${qualityConfig.label} completed and Firestore updated`);

    // Enqueue next quality if there are remaining qualities
    if (remainingQualities.length > 0) {
      const nextQuality = remainingQualities[0];
      const nextRemaining = remainingQualities.slice(1);
      
      // Get quality config from Firestore (stored during initialization)
      const qualityConfigs = currentData?.qualityConfigs || {};
      const nextQualityConfig = qualityConfigs[nextQuality];
      
      if (!nextQualityConfig) {
        console.error(`❌ [WORKER] Quality config not found for ${nextQuality} in Firestore`);
        response.status(500).json({ 
          error: 'Quality config not found',
          qualityLevel: nextQuality
        });
        return;
      }
      
      console.log(`🔄 [WORKER] Enqueuing next quality: ${nextQuality}`);
      try {
        await enqueueQualityTask(mediaId, nextQuality, {
          mediaId,
          qualityLevel: nextQuality,
          filePath,
          storageFolder,
          hlsBasePath,
          sharedToken: tokenToUse,
          originalResolution,
          remainingQualities: nextRemaining,
          qualityConfig: nextQualityConfig
        });
        console.log(`✅ [WORKER] Successfully enqueued next quality: ${nextQuality}`);
      } catch (enqueueError) {
        console.error(`❌ [WORKER] Failed to enqueue next quality ${nextQuality}:`, enqueueError);
        // Don't fail the current task if enqueueing next fails - log and continue
      }
    }

    response.status(200).json({ 
      success: true, 
      qualityLevel,
      message: `${qualityConfig.label} processing completed` 
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [WORKER] Error processing ${qualityLevel} for ${mediaId}:`, error);

    // Update Firestore with failure
    try {
      const currentDoc = await mediaRef.get();
      const currentData = currentDoc.exists ? currentDoc.data() : {};
      const currentFailedQualities = currentData?.failedQualities || [];

      // Cannot use FieldValue.serverTimestamp() inside arrays, so use Timestamp.now()
      const failedAtTimestamp = Timestamp.now();
      await mediaRef.set({
        failedQualities: [
          ...currentFailedQualities,
          {
            name: qualityLevel,
            label: qualityConfig.label,
            error: errorMessage,
            failedAt: failedAtTimestamp
          }
        ]
      }, { merge: true });
    } catch (updateError) {
      console.error(`❌ [WORKER] Failed to update failedQualities:`, updateError);
    }

    // Cleanup
    try {
      if (fs.existsSync(tmpOriginal)) fs.unlinkSync(tmpOriginal);
    } catch {}

    response.status(500).json({ 
      error: 'Processing failed', 
      qualityLevel,
      message: errorMessage 
    });
  }
});

// Long-running transcription for multi-minute audio (GCS URI or base64 -> upload then transcribe)
export const transcribeLongAudio = onCallWithCors({ region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const { gcsUri, audioContent, encoding, sampleRateHertz, languageCode } = request.data as {
    gcsUri?: string;
    audioContent?: string; // base64
    encoding?: string;
    sampleRateHertz?: number;
    languageCode?: string;
  };
  let uri = gcsUri;
  const bucketName = process.env.STORAGE_BUCKET;
  if (!uri && !audioContent) throw new HttpsError('invalid-argument', 'Provide gcsUri or audioContent');
  try {
    if (!uri && audioContent) {
      if (!bucketName) throw new HttpsError('failed-precondition', 'STORAGE_BUCKET env not set');
      const b = getStorage().bucket(bucketName);
      const id = `temp/voice-notes/${request.auth.uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.webm`;
      const buf = Buffer.from(audioContent, 'base64');
      await b.file(id).save(buf, { contentType: 'audio/webm', resumable: false, metadata: { cacheControl: 'no-cache' } });
      uri = `gs://${bucketName}/${id}`;
    }

    const config: any = {
      languageCode: languageCode || 'en-US',
      enableAutomaticPunctuation: true,
    };
    if (encoding) config.encoding = encoding;
    if (sampleRateHertz) config.sampleRateHertz = sampleRateHertz;

    const [operation] = await speechClient.longRunningRecognize({
      config,
      audio: { uri },
    } as any);
    const [response] = await operation.promise();
    const transcript = (response.results || [])
      .map((r: any) => (r.alternatives && r.alternatives[0] ? r.alternatives[0].transcript : ''))
      .join(' ')
      .trim();
    return { transcript };
  } catch (err: any) {
    console.error('[transcribeLongAudio] failed', err);
    throw new HttpsError('internal', err?.message || 'Failed to transcribe');
  }
});

// Mirror attendees into per-user attendances for faster profile queries
export const onAttendeeMirror = onDocumentWritten('events/{eventId}/attendees/{userId}', async (event) => {
  const eventId = event.params.eventId;
  const userId = event.params.userId;
  const after = event.data?.after?.data();
  const before = event.data?.before?.data();
  const userRef = db.collection('users').doc(userId).collection('attendances').doc(eventId);
  try {
    if (after && event.data?.after?.exists) {
      await userRef.set({
        eventId,
        userId,
        rsvpStatus: after.rsvpStatus || after.status || 'going',
        createdAt: after.createdAt || new Date(),
        updatedAt: new Date(),
      }, { merge: true });
    } else if (before && event.data?.before?.exists) {
      await userRef.delete();
    }
  } catch (error) {
    console.error('[onAttendeeMirror] error', { eventId, userId, error: (error as any)?.message });
  }
});

// ───────────────── PHONE NUMBER VALIDATION ─────────────────
export const checkPhoneNumberExists = onCallWithCors({}, async (request) => {
  console.log('🔍 checkPhoneNumberExists called with:', request.data);
  
  const { phoneNumber } = request.data;
  
  if (!phoneNumber) {
    console.log('❌ No phone number provided');
    return { exists: false, error: 'Phone number is required' };
  }
  
  try {
    console.log('🔍 Checking if phone number exists:', phoneNumber);
    
    // Query Firestore for users with this phone number
    const usersSnapshot = await db.collection('users')
      .where('phoneNumber', '==', phoneNumber)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      console.log('🔍 Phone number not found - new user can register');
      return { 
        exists: false, 
        phoneNumber,
        message: 'Phone number not found'
      };
    }
    
    // User exists - check status
    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    const userStatus = userData.status || 'pending';
    
    console.log('🔍 User found with status:', userStatus);
    
    // If user is rejected, check if cooldown period has passed
    if (userStatus === 'rejected' && userData.rejectedAt) {
      const rejectedAt = (userData.rejectedAt as Timestamp).toDate();
      const cooldownDays = 30;
      const reapplyDate = new Date(rejectedAt);
      reapplyDate.setDate(reapplyDate.getDate() + cooldownDays);
      const now = new Date();
      
      console.log('🔍 Rejected user - checking cooldown:', {
        rejectedAt: rejectedAt.toISOString(),
        reapplyDate: reapplyDate.toISOString(),
        now: now.toISOString(),
        canReapply: now >= reapplyDate
      });
      
      // If cooldown has passed, allow reapplication
      if (now >= reapplyDate) {
        console.log('✅ Cooldown expired - user can reapply');
        return { 
          exists: false,  // Allow reapplication
          phoneNumber,
          canReapply: true,
          message: 'You can reapply now',
          userStatus: 'rejected'
        };
      } else {
        // Still in cooldown period
        const daysRemaining = Math.ceil((reapplyDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        console.log('⏳ Cooldown active - user cannot reapply yet', { daysRemaining });
        return { 
          exists: true,  // Block registration
          phoneNumber,
          canReapply: false,
          reapplyDate: reapplyDate.toISOString(),
          daysRemaining,
          message: `You can reapply after ${reapplyDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          userStatus: 'rejected'
        };
      }
    }
    
    // For all other statuses (pending, approved, needs_clarification), block registration
    console.log('🔍 User exists with status:', userStatus, '- blocking registration');
    return { 
      exists: true, 
      phoneNumber,
      message: userStatus === 'pending' 
        ? 'This phone number is already registered. Your account is pending approval.'
        : userStatus === 'approved'
        ? 'This phone number is already registered. Please sign in instead.'
        : 'This phone number is already registered. Please sign in instead.',
      userStatus
    };
    
  } catch (error) {
    console.error('❌ Error checking phone number:', error);
    return { 
      exists: false, 
      error: 'Failed to check phone number',
      phoneNumber 
    };
  }
});

// Send notification SMS using Twilio
// SECURITY: Restricted to admins only, with validation and App Check
export const sendNotificationSMS = onCall(
  {
    // App Check is now configured in Firebase Console - enforce it
    // App Check provides additional security layer to verify legitimate app instances
    enforceAppCheck: true, // App Check is registered - enforce it
  },
  async (request) => {
    // 1. Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to send SMS');
    }
    
    // 2. App Check verification is handled automatically by Firebase when enforceAppCheck: true
    // If App Check token is invalid or missing, the function won't be called
    // request.app contains App Check verification result if needed for logging

    const { phoneNumber, message, userId, type } = request.data;
    
    // 3. Validate input
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    throw new HttpsError('invalid-argument', 'phoneNumber is required and must be a string');
  }
  
  if (!message || typeof message !== 'string') {
    throw new HttpsError('invalid-argument', 'message is required and must be a string');
  }
  
  // Validate phone number format (E.164)
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  if (!phoneRegex.test(phoneNumber)) {
    throw new HttpsError('invalid-argument', 'phoneNumber must be in E.164 format (e.g., +1234567890)');
  }
  
  // Validate message length (Twilio limit is 1600 characters)
  if (message.length > 1600) {
    throw new HttpsError('invalid-argument', 'message must be 1600 characters or less');
  }
  
  if (message.length === 0) {
    throw new HttpsError('invalid-argument', 'message cannot be empty');
  }
  
    // 4. Check user role - only admins can send SMS
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('permission-denied', 'User not found');
  }
  
  const userData = userDoc.data();
  if (userData?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can send SMS notifications');
  }

  // 5. Rate limiting: Max 10 SMS per admin per hour to prevent abuse
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  const rateLimitRef = db.collection('sms_rate_limits').doc(request.auth.uid);
  const rateLimitDoc = await rateLimitRef.get();
  
  if (rateLimitDoc.exists) {
    const rateLimitData = rateLimitDoc.data();
    const recentCalls = (rateLimitData?.calls || []).filter((timestamp: number) => timestamp > oneHourAgo);
    
    if (recentCalls.length >= 10) {
      throw new HttpsError('resource-exhausted', 'Rate limit exceeded: Maximum 10 SMS per hour. Please try again later.');
    }
    
    // Update rate limit tracking
    recentCalls.push(now);
    await rateLimitRef.set({
      calls: recentCalls,
      lastCallAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } else {
    // First call - initialize rate limit tracking
    await rateLimitRef.set({
      calls: [now],
      lastCallAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  }
  
    // 5. If userId provided, verify it exists and check SMS preference
  if (userId) {
    const targetUserDoc = await db.collection('users').doc(userId).get();
    if (targetUserDoc.exists) {
      const targetUserData = targetUserDoc.data();
      const smsEnabled = targetUserData?.notificationPreferences?.smsEnabled !== false; // Default to true
      
      if (!smsEnabled) {
        console.log(`⚠️ SMS disabled for user ${userId}, skipping send`);
        return {
          success: false,
          error: 'SMS notifications are disabled for this user',
          phoneNumber,
          userId
        };
      }
    }
  }
  
    console.log('📱 sendNotificationSMS called by admin:', {
      adminId: request.auth.uid,
      phoneNumber: phoneNumber.substring(0, 4) + '***', // Partial logging for privacy
      messageLength: message.length,
      userId,
      type,
      appVerified: !!request.app
    });
    
    try {
      const result = await sendSMSViaTwilio(phoneNumber, message);
      
      if (result.success) {
        return {
          success: true,
          message: 'SMS notification sent',
          phoneNumber: phoneNumber.substring(0, 4) + '***', // Don't return full number
          userId,
          sid: result.sid
        };
      } else {
        return {
          success: false,
          error: result.error || 'SMS delivery failed',
          phoneNumber: phoneNumber.substring(0, 4) + '***',
          userId
        };
      }
    } catch (error) {
      console.error('❌ Error sending notification SMS:', error);
      throw new HttpsError('internal', 'Failed to send SMS notification');
    }
  }
);

// SMS Delivery Status Checker
// Mark all notifications as read for a user (server-side for performance)
export const markAllNotificationsAsRead = onCallWithCors({ region: 'us-east1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid;
  
  try {
    // Query all unread notifications for the user
    const unreadQuery = db.collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false);
    
    const unreadSnapshot = await unreadQuery.get();
    
    if (unreadSnapshot.empty) {
      return { success: true, count: 0, message: 'No unread notifications' };
    }
    
    // Process in batches of 500 (Firestore batch limit)
    const BATCH_SIZE = 500;
    const batches: any[] = [];
    let batch = db.batch();
    let operationCount = 0;
    let totalProcessed = 0;
    
    unreadSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        read: true,
        readAt: FieldValue.serverTimestamp()
      });
      operationCount++;
      
      if (operationCount === BATCH_SIZE) {
        batches.push(batch);
        batch = db.batch();
        operationCount = 0;
      }
    });
    
    // Add final batch if there are remaining operations
    if (operationCount > 0) {
      batches.push(batch);
    }
    
    // Commit all batches
    for (const batchToCommit of batches) {
      await batchToCommit.commit();
      totalProcessed += Math.min(BATCH_SIZE, unreadSnapshot.size - totalProcessed);
    }
    
    console.log(`✅ Marked ${totalProcessed} notifications as read for user ${userId}`);
    
    return {
      success: true,
      count: totalProcessed,
      message: `Marked ${totalProcessed} notifications as read`
    };
  } catch (error: any) {
    console.error('❌ Error marking all notifications as read:', error);
    throw new HttpsError('internal', error.message || 'Failed to mark all notifications as read');
  }
});

export const checkSMSDeliveryStatus = onCall(async (request) => {
  const { phoneNumber, verificationId } = request.data;
  
  console.log('🔍 checkSMSDeliveryStatus called with:', { phoneNumber, verificationId });
  
  try {
    // Check if phone number is valid format
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return {
        success: false,
        error: 'Invalid phone number format',
        phoneNumber,
        verificationId
      };
    }
    
    // Check Firebase project configuration
    const projectId = process.env.GCLOUD_PROJECT || 'momfitnessmojo';
    
    // Log detailed information for debugging
    const debugInfo = {
      phoneNumber,
      verificationId,
      projectId,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      region: process.env.FUNCTION_REGION || 'us-central1'
    };
    
    console.log('🔍 SMS Delivery Debug Info:', debugInfo);
    
    return {
      success: true,
      message: 'SMS delivery status checked',
      debugInfo,
      recommendations: [
        'Check Firebase Console → Authentication → Usage for SMS quota',
        'Verify phone provider is enabled in Firebase Console',
        'Check billing is enabled for SMS in Firebase Console',
        'Try a different phone number to test',
        'Check phone carrier for SMS filtering',
        'Wait 1-2 minutes for SMS delivery'
      ]
    };
    
  } catch (error) {
    console.error('❌ Error checking SMS delivery status:', error);
    return {
      success: false,
      error: 'Failed to check SMS delivery status',
      phoneNumber,
      verificationId
    };
  }
});

// Generate testimonial suggestions using AI (tries Gemini first, falls back to OpenAI)
export const generateTestimonialSuggestions = onCallWithCors({}, async (request) => {
  try {
    const { prompt, userContext, highlight } = request.data;
    
    if (!prompt || typeof prompt !== 'string') {
      return {
        success: false,
        error: 'Prompt is required'
      };
    }

    // Fetch admin-configured prompts from Firestore (with cache)
    const getAIPrompts = async () => {
      try {
        const db = getFirestore();
        const promptsDoc = await db.collection('aiPrompts').doc('testimonialGeneration').get();
        
        if (promptsDoc.exists) {
          const data = promptsDoc.data();
          return {
            communityContext: data?.communityContext || '',
            guidelines: data?.guidelines || '',
            exampleActivities: data?.exampleActivities || [],
            exampleEvents: data?.exampleEvents || [],
            tone: data?.tone || '',
            updatedAt: data?.updatedAt?.toDate() || null,
          };
        }
        
        // Fallback to default if not configured
        return {
          communityContext: 'Moms Fitness Mojo is a fitness and wellness community for moms in Short Hills, Millburn, and surrounding New Jersey areas. We offer workouts (yoga, pilates, HIIT, strength training), hikes, tennis, dance sessions, fitness challenges, social events (brunches, dinners, cocktail nights), and festival celebrations. The community values friendship, accountability, wellness, and helping moms rediscover themselves beyond their roles as mothers.',
          guidelines: `- Be authentic and heartfelt
- Mention specific experiences, events, or moments when possible
- Share a fuller story (aim for 600-1500 characters)
- Make it personal and relatable
- Focus on community, fitness, empowerment, and friendship
- Each testimonial should be unique`,
          exampleActivities: ['Saturday morning walks', 'yoga sessions', 'hiking trails', 'tennis matches', 'dance classes', 'fitness challenges', 'brunch meetups', 'cocktail nights'],
          exampleEvents: ['community hikes', 'fitness workshops', 'social brunches', 'dance sessions', 'wellness events'],
          tone: 'warm, supportive, empowering, authentic',
          updatedAt: null,
        };
      } catch (error) {
        console.error('❌ [AI] Error fetching prompts from Firestore:', error);
        // Return defaults on error
        return {
          communityContext: 'Moms Fitness Mojo is a fitness and wellness community for moms.',
          guidelines: '- Be authentic and heartfelt\n- Share a fuller story (aim for 600-1500 characters)\n- Make it personal and relatable',
          exampleActivities: [],
          exampleEvents: [],
          tone: 'warm and supportive',
          updatedAt: null,
        };
      }
    };

    // Build context-aware prompt using admin-configured settings
    const buildPrompt = async () => {
      const aiPrompts = await getAIPrompts();
      
      let userPrompt = `You are helping a member of Moms Fitness Mojo write a testimonial. 

COMMUNITY CONTEXT:
${aiPrompts.communityContext}

${aiPrompts.exampleActivities.length > 0 ? `\nEXAMPLE ACTIVITIES (mention when relevant): ${aiPrompts.exampleActivities.join(', ')}` : ''}
${aiPrompts.exampleEvents.length > 0 ? `\nEXAMPLE EVENTS (mention when relevant): ${aiPrompts.exampleEvents.join(', ')}` : ''}

GUIDELINES FOR TESTIMONIAL GENERATION:
${aiPrompts.guidelines}

${aiPrompts.tone ? `\nTONE: ${aiPrompts.tone}` : ''}`;

      if (userContext) {
        userPrompt += `\n\nUser context: ${userContext}`;
      }

      if (highlight) {
        userPrompt += `\n\nUser wants to highlight: ${highlight}`;
      }

      userPrompt += `\n\nUSER'S INPUT/EXPERIENCE: "${prompt}"`;
      userPrompt += `\n\nGenerate 2-3 testimonials based on the user's input above. Format each on a new line starting with "1.", "2.", "3.". Each should be between 600-1500 characters so the story feels complete while staying focused. Make them feel authentic and specific to their experience.`;
      
      return userPrompt;
    };

    // Helper to parse testimonials from response text
    const parseTestimonials = (text: string): string[] => {
      const testimonials = text
        .split(/\n+/)
        .map((line: string) => line.replace(/^\d+\.\s*/, '').trim().replace(/^["']|["']$/g, ''))
        .filter((line: string) => line.length >= 40 && line.length <= 2000)
        .slice(0, 3);

      if (testimonials.length === 0) {
        const fallback = text.trim().substring(0, 200);
        testimonials.push(fallback);
      }
      return testimonials;
    };

    // Try Gemini first (with v1 API and correct model names)
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

    if (geminiApiKey) {
      try {
        console.log('🤖 [Gemini] Attempting to generate suggestions...');
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        
        // Try different model names - gemini-2.5-flash is the current recommended model (per Firebase AI Logic docs)
        const modelsToTry = [
          'gemini-2.5-flash', // Current recommended model from Firebase AI Logic
          'gemini-2.0-flash-exp', // Experimental version
          'gemini-pro', // Legacy model name
          'gemini-1.0-pro', // Versioned name
        ];

        let text = '';
        let lastError: Error | null = null;

        for (const modelName of modelsToTry) {
          try {
              console.log(`🤖 [Gemini] Trying model: ${modelName}`);
              const model = genAI.getGenerativeModel({ model: modelName });
              const systemPrompt = await buildPrompt();
              const result = await model.generateContent(systemPrompt);
            const response = await result.response;
            text = response.text();
            console.log(`✅ [Gemini] Success with model: ${modelName}`);
            break;
          } catch (modelError: any) {
            lastError = modelError;
            console.log(`❌ [Gemini] Model ${modelName} failed:`, modelError?.message);
            continue; // Try next model
          }
        }

        if (text) {
          const testimonials = parseTestimonials(text);
          console.log('✅ [Gemini] Generated', testimonials.length, 'suggestions');
          return {
            success: true,
            suggestions: testimonials
          };
        } else {
          console.log('⚠️ [Gemini] All models failed, falling back to OpenAI');
        }
      } catch (geminiError: any) {
        console.error('❌ [Gemini] Error:', geminiError?.message);
        console.log('⚠️ [Gemini] Falling back to OpenAI');
      }
    }

    // Fallback to OpenAI
    let openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const functions = require('firebase-functions');
        const config = functions.config();
        openaiApiKey = config?.openai?.api_key;
      } catch (error) {
        // functions.config() not available in v2
      }
    }

    if (!openaiApiKey) {
      console.error('❌ Neither GEMINI_API_KEY nor OPENAI_API_KEY configured');
      return {
        success: false,
        error: 'AI service not configured. Please add GEMINI_API_KEY or OPENAI_API_KEY to .env file.'
      };
    }

    console.log('🤖 [OpenAI] Generating testimonial suggestions...');
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: openaiApiKey });

          const userPrompt = await buildPrompt();
          const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are helping a member of Moms Fitness Mojo write a testimonial. Be authentic, concise, and heartfelt.'
              },
              {
                role: 'user',
                content: userPrompt
              }
            ],
      temperature: 0.7,
      max_tokens: 600
    });

    const text = completion.choices[0]?.message?.content || '';
    const testimonials = parseTestimonials(text);
    console.log('✅ [OpenAI] Generated', testimonials.length, 'suggestions');

    return {
      success: true,
      suggestions: testimonials
    };

  } catch (error: any) {
    console.error('❌ [AI Service] Error generating suggestions:', error);
    return {
      success: false,
      error: error?.message || 'Failed to generate suggestions. Please try again or write your own testimonial.'
    };
  }
});

type ToneClassification = {
  label: string;
  confidence?: number;
  keywords?: string[];
};

const TONE_LABELS = [
  'Empowering',
  'Motivational',
  'Heartfelt',
  'Celebratory',
  'Supportive',
  'Transformational',
];

const HEURISTIC_TONES: Array<{ label: string; keywords: string[] }> = [
  { label: 'Empowering', keywords: ['strong', 'power', 'challenge', 'confident', 'bold', 'fearless', 'resilient', 'unstoppable'] },
  { label: 'Motivational', keywords: ['motivate', 'inspire', 'drive', 'push', 'energy', 'uplift', 'momentum', 'goal'] },
  { label: 'Heartfelt', keywords: ['grateful', 'thank', 'love', 'heart', 'emotion', 'touched', 'meaningful', 'gratitude'] },
  { label: 'Celebratory', keywords: ['celebrat', 'party', 'dance', 'festive', 'joyful', 'gala', 'confetti', 'toast'] },
  { label: 'Supportive', keywords: ['support', 'together', 'team', 'community', 'encourage', 'accountability', 'sisterhood'] },
  { label: 'Transformational', keywords: ['transform', 'journey', 'growth', 'progress', 'evolution', 'change', 'milestone'] },
];

function normalizeToneLabel(raw: string): string {
  if (!raw) return 'Heartfelt';
  const lower = raw.toLowerCase();
  if (lower.includes('empower') || lower.includes('strong')) return 'Empowering';
  if (lower.includes('motiv')) return 'Motivational';
  if (lower.includes('celebr') || lower.includes('party') || lower.includes('fest')) return 'Celebratory';
  if (lower.includes('support') || lower.includes('encourag') || lower.includes('community')) return 'Supportive';
  if (lower.includes('transform') || lower.includes('journey') || lower.includes('growth')) return 'Transformational';
  if (lower.includes('heart') || lower.includes('gratitude') || lower.includes('love')) return 'Heartfelt';
  for (const label of TONE_LABELS) {
    if (lower.includes(label.toLowerCase())) {
      return label;
    }
  }
  return 'Heartfelt';
}

function clampConfidence(value?: number): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  if (value > 1.2) {
    return Math.min(1, value / 100);
  }
  return Math.max(0, Math.min(1, value));
}

function parseToneResponse(raw: string): ToneClassification | null {
  if (!raw) return null;
  const candidates: string[] = [];
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    candidates.push(jsonMatch[0]);
  }
  candidates.push(raw);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed !== 'object' || !parsed) continue;
      const label = normalizeToneLabel(String(parsed.label || parsed.tone || '').trim());
      if (!label) continue;
      let confidence: number | undefined = undefined;
      if (typeof parsed.confidence === 'number') {
        confidence = clampConfidence(parsed.confidence);
      } else if (typeof parsed.confidence === 'string') {
        confidence = clampConfidence(parseFloat(parsed.confidence));
      }
      let keywords: string[] | undefined;
      if (Array.isArray(parsed.keywords)) {
        keywords = parsed.keywords
          .map((keyword: any) => (typeof keyword === 'string' ? keyword.trim() : null))
          .filter(Boolean)
          .slice(0, 5) as string[];
      } else if (typeof parsed.highlights === 'string') {
        keywords = parsed.highlights
          .split(',')
          .map((item: string) => item.trim())
          .filter(Boolean)
          .slice(0, 5);
      }
      return {
        label,
        confidence,
        keywords,
      };
    } catch {
      continue;
    }
  }

  return null;
}

function heuristicTone(quote: string): ToneClassification {
  const lower = quote.toLowerCase();
  let bestScore = 0;
  let bestEntry = HEURISTIC_TONES[2]; // Heartfelt default
  let matchedKeywords: string[] = [];

  for (const entry of HEURISTIC_TONES) {
    const matches = entry.keywords.filter((keyword) => lower.includes(keyword));
    const score = matches.length / Math.max(1, entry.keywords.length);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
      matchedKeywords = matches.slice(0, 5);
    }
  }

  const confidence = clampConfidence(0.35 + Math.min(bestScore * 2, 0.5));

  return {
    label: bestEntry.label,
    confidence,
    keywords: matchedKeywords,
  };
}

async function classifyToneWithGemini(quote: string, apiKey: string): Promise<ToneClassification | null> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
    const prompt = `You are classifying the tone of a testimonial written by moms in a supportive fitness and lifestyle community.
Return ONLY valid JSON with the shape {"label": "...", "confidence": number_between_0_and_1, "keywords": ["..."]}.
The label MUST be one of: ${TONE_LABELS.join(', ')}.
Confidence must be 0-1. Provide 1-4 short keywords that justify your choice.

QUOTE:
"""${quote.trim()}"""`;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const response = await model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 300,
          },
        });
        const text =
          response?.response?.text?.() ||
          response?.response?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text ?? '').join('');
        const parsed = parseToneResponse(text || '');
        if (parsed) {
          return parsed;
        }
      } catch (error) {
        console.warn(`⚠️ [GeminiTone] Model ${modelName} failed:`, (error as Error)?.message);
        continue;
      }
    }
  } catch (error) {
    console.error('❌ [GeminiTone] Failed to load Gemini SDK:', (error as Error)?.message);
  }
  return null;
}

async function classifyToneWithOpenAI(quote: string, apiKey: string): Promise<ToneClassification | null> {
  try {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });
    const prompt = `Classify the tone of this testimonial from a women's fitness community.
Respond strictly in JSON with keys "label", "confidence", "keywords".
Label MUST be one of: ${TONE_LABELS.join(', ')}.
Confidence is a number between 0 and 1. Keywords is an array of 1-4 short strings.

QUOTE:
"""${quote.trim()}"""`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You analyze tone of testimonials for a supportive moms fitness community. Respond only with JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 300,
    });

    const text = completion.choices[0]?.message?.content ?? '';
    const parsed = parseToneResponse(text);
    if (parsed) {
      return parsed;
    }
  } catch (error) {
    console.error('❌ [OpenAITone] Error classifying tone:', (error as Error)?.message);
  }
  return null;
}

export const classifyTestimonialTone = onCallWithCors({
  region: 'us-east1',
  timeoutSeconds: 120,
  memory: '1GiB',
}, async (request) => {
  const quote = typeof request.data?.quote === 'string' ? request.data.quote.trim() : '';

  if (!quote) {
    throw new HttpsError('invalid-argument', 'quote is required');
  }

  if (quote.length < 40) {
    throw new HttpsError('invalid-argument', 'quote must be at least 40 characters to classify tone.');
  }

  const sanitizedQuote = quote.replace(/\s+/g, ' ').trim();

  let geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const functions = require('firebase-functions');
      const config = functions.config();
      geminiApiKey = config?.gemini?.api_key;
    } catch {
      // ignore
    }
  }

  let tone: ToneClassification | null = null;

  if (geminiApiKey) {
    tone = await classifyToneWithGemini(sanitizedQuote, geminiApiKey);
  }

  if (!tone) {
    let openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const functions = require('firebase-functions');
        const config = functions.config();
        openaiApiKey = config?.openai?.api_key;
      } catch {
        // ignore
      }
    }
    if (openaiApiKey) {
      tone = await classifyToneWithOpenAI(sanitizedQuote, openaiApiKey);
    }
  }

  const heuristic = heuristicTone(sanitizedQuote);

  if (!tone) {
    tone = heuristic;
  } else {
    tone.label = normalizeToneLabel(tone.label);
    tone.confidence = clampConfidence(tone.confidence ?? heuristic.confidence);
    if (!tone.keywords || tone.keywords.length === 0) {
      tone.keywords = heuristic.keywords;
    }
  }

  return {
    success: true,
    label: tone.label,
    confidence: tone.confidence,
    keywords: tone.keywords,
  };
});

// ───────────────── WATERMARKED DOWNLOADS ─────────────────

const escapeSvgText = (text: string): string =>
  text.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

const sanitizeFilename = (name: string): string => {
  const normalized = name
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'media';
};

const determineMediaType = (mediaData: DocumentData): 'image' | 'video' | null => {
  const declaredType = typeof mediaData.type === 'string' ? mediaData.type.toLowerCase() : '';
  if (declaredType === 'image' || declaredType === 'video') {
    return declaredType;
  }

  const mime = (mediaData.mimeType || mediaData.contentType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';

  const ext = path.extname(mediaData.filePath || '').toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.m4v', '.webm', '.mkv'].includes(ext)) return 'video';

  return null;
};

const buildWatermarkPaths = (
  originalPath: string,
  mediaData: DocumentData,
  mediaId: string,
  mediaType: 'image' | 'video'
) => {
  const fallbackExt = mediaType === 'image' ? '.jpg' : '.mp4';
  const ext = path.extname(originalPath) || fallbackExt;
  const baseDir = originalPath.includes('/') ? originalPath.substring(0, originalPath.lastIndexOf('/')) : '';
  const storageFileName = `${path.basename(originalPath, ext) || mediaId}_watermarked${ext}`;
  const storagePath = baseDir
    ? `${baseDir}/${WATERMARK_FOLDER}/${storageFileName}`
    : `${WATERMARK_FOLDER}/${storageFileName}`;
  const downloadBase = sanitizeFilename(mediaData.originalFileName || mediaData.title || path.basename(originalPath, ext));
  const downloadName = `${downloadBase}_watermarked${ext}`;

  return { storagePath, downloadName, ext };
};

const guessMimeType = (ext: string, defaultType: 'image' | 'video'): string => {
  const normalized = ext.toLowerCase();
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska'
  };
  if (map[normalized]) return map[normalized];
  return defaultType === 'image' ? 'image/jpeg' : 'video/mp4';
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const buildWatermarkSvg = (targetWidth: number): string => {
  const width = Math.max(Math.round(targetWidth), 320);
  const fontSize = clamp(Math.round(width * 0.045), 36, 72);
  const paddingX = Math.round(fontSize * 1.1);
  const paddingY = Math.round(fontSize * 0.75);
  const height = Math.round(fontSize * 2.6);
  const cornerRadius = Math.round(height * 0.3);
  const text = escapeSvgText(WATERMARK_TEXT);
  const textX = width - paddingX;
  const textY = height - paddingY;

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" rx="${cornerRadius}" fill="#000" fill-opacity="0.32" />
  <text x="${textX}" y="${textY}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}"
    text-anchor="end" fill="#FFFFFF" fill-opacity="0.92" font-weight="700">${text}</text>
</svg>
`.trim();
};

const cleanupTempFiles = async (...pathsToDelete: Array<string | undefined>): Promise<void> => {
  await Promise.all(
    pathsToDelete
      .filter((p): p is string => Boolean(p))
      .map((tempPath) => fsp.unlink(tempPath).catch(() => undefined))
  );
};

const applyImageWatermark = async (sourcePath: string, outputPath: string): Promise<void> => {
  const metadata = await sharp(sourcePath).metadata();
  const orientation = metadata.orientation || 1;
  const rawWidth = metadata.width || 1600;
  const rawHeight = metadata.height || Math.max(Math.round(rawWidth * 0.75), 900);
  const rotated = [5, 6, 7, 8].includes(orientation);
  const effectiveWidth = rotated ? rawHeight : rawWidth;
  const targetWidth = clamp(effectiveWidth * 0.35, 480, 1280);
  const svg = buildWatermarkSvg(targetWidth);

  await sharp(sourcePath)
    .rotate() // honor EXIF orientation before compositing
    .composite([{ input: Buffer.from(svg), gravity: 'southeast' }])
    .withMetadata() // preserve metadata after rotation
    .toFile(outputPath);
};

const createWatermarkOverlayFile = async (): Promise<string> => {
  const svg = buildWatermarkSvg(720);
  const overlayPath = path.join(os.tmpdir(), `wm-overlay-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  await sharp(Buffer.from(svg)).png().toFile(overlayPath);
  return overlayPath;
};

const applyVideoWatermark = async (sourcePath: string, outputPath: string): Promise<void> => {
  const overlayPath = await createWatermarkOverlayFile();

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(sourcePath)
        .input(overlayPath)
        .complexFilter([
          {
            filter: 'overlay',
            options: {
              x: 'main_w-overlay_w-48',
              y: 'main_h-overlay_h-48',
            },
          },
        ])
        .outputOptions([
          '-c:v libx264',
          `-preset ${WATERMARK_VIDEO_PRESET}`,
          '-crf 21',
          '-c:a copy',
          '-movflags +faststart',
        ])
        .output(outputPath)
        .on('error', reject)
        .on('end', resolve)
        .run();
    });
  } finally {
    await cleanupTempFiles(overlayPath);
  }
};

const tryReuseCachedWatermark = async (bucket: StorageBucket, pathToFile?: string) => {
  if (!pathToFile) return null;
  const file = bucket.file(pathToFile);
  const [exists] = await file.exists();
  if (!exists) return null;

  const expiresAt = Date.now() + WATERMARK_URL_TTL_SECONDS * 1000;
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: new Date(expiresAt),
  });

  return { url, expiresAt };
};

export const getWatermarkedMedia = onCallWithCors({
  region: 'us-east1',
  memory: '4GiB',
  timeoutSeconds: 540,
  cpu: 2,
  maxInstances: 10,
}, async (request) => {
  const mediaId = typeof request.data?.mediaId === 'string' ? request.data.mediaId.trim() : '';

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Please sign in to download media.');
  }

  if (!mediaId) {
    throw new HttpsError('invalid-argument', 'mediaId is required.');
  }

  const docRef = db.collection('media').doc(mediaId);
  const mediaSnap = await docRef.get();

  if (!mediaSnap.exists) {
    throw new HttpsError('not-found', 'Media not found.');
  }

  const mediaData = mediaSnap.data() || {};
  const mediaType = determineMediaType(mediaData);
  const filePath: string | undefined = mediaData.filePath;

  if (!mediaType) {
    throw new HttpsError('failed-precondition', 'Unsupported media type.');
  }

  if (!filePath) {
    throw new HttpsError('failed-precondition', 'Media is missing storage path.');
  }

  // Require STORAGE_BUCKET env var - fail fast if not set
  const bucketName = process.env.STORAGE_BUCKET;
  if (!bucketName) {
    throw new HttpsError('internal', 'Storage bucket not configured. STORAGE_BUCKET environment variable is required.');
  }
  const bucket = getStorage().bucket(bucketName);
  const { storagePath, downloadName, ext } = buildWatermarkPaths(filePath, mediaData, mediaId, mediaType);

  const cached =
    (await tryReuseCachedWatermark(bucket, mediaData?.watermarkedDownload?.path)) ||
    (await tryReuseCachedWatermark(bucket, storagePath));

  if (cached) {
    console.log('📦 [WATERMARK] Using cached copy for media:', mediaId);
    if (!mediaData?.watermarkedDownload?.path) {
      await docRef.set(
        {
          watermarkedDownload: {
            path: storagePath,
            cacheSource: 'bucket-only',
            updatedAt: FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    }
    // Return cached URL with flag indicating it's cached
    return { ...cached, isCached: true };
  }

  console.log('🆕 [WATERMARK] Generating new watermarked copy for media:', mediaId);

  const tmpOriginal = path.join(os.tmpdir(), `wm-source-${mediaId}-${Date.now()}${ext}`);
  const tmpWatermarked = path.join(os.tmpdir(), `wm-output-${mediaId}-${Date.now()}${ext}`);

  try {
    await bucket.file(filePath).download({ destination: tmpOriginal });
  } catch (error) {
    console.error('❌ [WATERMARK] Failed to download source file', { mediaId, filePath, error });
    await cleanupTempFiles(tmpOriginal, tmpWatermarked);
    throw new HttpsError('internal', 'Unable to download source media.');
  }

  try {
    if (mediaType === 'image') {
      await applyImageWatermark(tmpOriginal, tmpWatermarked);
    } else {
      await applyVideoWatermark(tmpOriginal, tmpWatermarked);
    }

    const contentType = mediaData.mimeType || mediaData.contentType || guessMimeType(ext, mediaType);

    await bucket.upload(tmpWatermarked, {
      destination: storagePath,
      metadata: {
        contentType,
        cacheControl: 'private, max-age=3600',
        contentDisposition: `attachment; filename="${downloadName}"`,
        metadata: {
          watermark: 'true',
          originalMediaId: mediaId,
        },
      },
    });

    const fileStat = await fsp.stat(tmpWatermarked).catch(() => null);

    await docRef.set(
      {
        watermarkedDownload: {
          path: storagePath,
          size: fileStat?.size ?? null,
          mediaType,
          updatedAt: FieldValue.serverTimestamp(),
          generatedBy: request.auth.uid || null,
        },
      },
      { merge: true }
    );

    const expiresAt = Date.now() + WATERMARK_URL_TTL_SECONDS * 1000;
    const [url] = await bucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires: new Date(expiresAt),
    });

    console.log('✅ [WATERMARK] Ready for download', { mediaId, path: storagePath });

    // Return URL with flag indicating it was newly generated
    return { url, expiresAt, isCached: false };
  } catch (error) {
    console.error('❌ [WATERMARK] Failed to generate watermark', { mediaId, error });
    throw new HttpsError('internal', 'Failed to generate watermarked copy.');
  } finally {
    await cleanupTempFiles(tmpOriginal, tmpWatermarked);
  }
});

export { generatePostSuggestionsV2 } from './postAI';

// ───────────────── AI WORKOUTS: Plan + Daily Suggestion (MVP) ─────────────────

type PlanIntake = {
  goal: 'fat_loss' | 'strength' | 'mobility' | 'general';
  daysPerWeek: 2 | 3 | 4 | 5;
  minutesPerSession: 10 | 20 | 30 | 45;
  level: 'beginner' | 'intermediate' | 'advanced';
  equipment: string[];
  postpartum?: boolean;
  environment?: 'home'|'gym'|'outdoors';
  restrictions?: string[];
};

type ReadinessInput = {
  sleep: 1 | 2 | 3 | 4 | 5; // 1=poor, 5=great
  stress: 1 | 2 | 3 | 4 | 5; // 1=high, 5=low
  timeAvailable: 5 | 10 | 20 | 30 | 45;
  soreness?: 0 | 1 | 2 | 3;  // 0=none
};

// Simple library of blocks
const BLOCK_LIBRARY = {
  warmup: { name: 'Warm-up Mobility', items: ['Cat-Cow 30s', 'World’s Greatest Stretch 2/side', 'Glute Bridge 10'] },
  core: { name: 'Core Stability', items: ['Dead Bug 10/side', 'Side Plank 20s/side'] },
  hiit: { name: 'HIIT Circuit', items: ['Air Squats 40s', 'Down-Ups 30s', 'Marching Plank 30s'] },
  strengthA: { name: 'Strength A', items: ['Goblet Squat 3x10', 'DB Row 3x10/side', 'Hip Hinge 3x12'] },
  strengthB: { name: 'Strength B', items: ['Reverse Lunge 3x10/side', 'Push-up 3x8', 'Glute Bridge 3x12'] },
  mobility: { name: 'Full-Body Mobility', items: ['90/90 30s/side', 'Couch Stretch 30s/side', 'T-Spine Opener 10'] },
  walk: { name: 'Brisk Walk', items: ['Outdoor/Stepper 15–30 min'] },
  cooldown: { name: 'Cool Down', items: ['Box Breathing 2 min', 'Calf/Hamstring Stretch 30s'] },
};

const buildSession = (type: 'strength'|'hiit'|'mobility'|'walk', minutes: number, ctx?: { environment?: string; equipment?: string[]; restrictions?: string[]; postpartum?: boolean }) => {
  const base = [BLOCK_LIBRARY.warmup];
  const env = (ctx?.environment||'home').toLowerCase();
  const restrict = (ctx?.restrictions||[]).map(x=>String(x||'').toLowerCase());
  const lowImpact = !!ctx?.postpartum || restrict.includes('knee') || restrict.includes('low back') || restrict.includes('back');
  if (type === 'strength') base.push(BLOCK_LIBRARY.strengthA, BLOCK_LIBRARY.core);
  if (type === 'hiit') base.push(lowImpact ? (BLOCK_LIBRARY as any).hiitLow || BLOCK_LIBRARY.core : BLOCK_LIBRARY.hiit);
  if (type === 'mobility') base.push(BLOCK_LIBRARY.mobility);
  if (type === 'walk') base.push(BLOCK_LIBRARY.walk);
  if (env === 'gym' && type === 'walk') {
    base.splice(1, 1, { name: 'Treadmill Walk', items: ['Treadmill 15-30 min'] } as any);
  }
  // Environment hint (light nudge): replace walk with mobility when indoors/home and lowImpact
  if (env === 'home' && type === 'walk' && lowImpact) {
    base.splice(1, 1, BLOCK_LIBRARY.mobility);
  }
  base.push(BLOCK_LIBRARY.cooldown);
  return {
    type,
    minutes,
    title: type === 'walk' ? 'Brisk Walk' : type.charAt(0).toUpperCase()+type.slice(1),
    blocks: base,
  };
};

export const generateWorkoutPlan = onCallWithCors({ region: 'us-east1' }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const uid = auth.uid;
  const intake = request.data as PlanIntake;
  if (!intake || !intake.daysPerWeek || !intake.minutesPerSession) throw new HttpsError('invalid-argument', 'Missing fields');

  const weeks = 6;
  const sessionsPerWeek = intake.daysPerWeek;
  const minutes = intake.minutesPerSession;

  const sessions: any[] = [];
  for (let w=1; w<=weeks; w++) {
    for (let d=1; d<=sessionsPerWeek; d++) {
      // Simple rotation: Strength / HIIT / Mobility / Walk
      const idx = (d-1) % 4;
      const map: Array<'strength'|'hiit'|'mobility'|'walk'> = ['strength', 'hiit', 'mobility', 'walk'];
      const t = intake.postpartum ? (idx===1 ? 'mobility' : (idx===0 ? 'strength' : 'walk')) : map[idx];
      sessions.push(buildSession(t as any, minutes, { environment: intake.environment, equipment: intake.equipment, restrictions: intake.restrictions, postpartum: intake.postpartum }));
    }
  }

  const planDoc = {
    title: `${intake.level.replace(/\b\w/g, c=>c.toUpperCase())} ${intake.goal.replace('_',' ')} Plan`,
    goal: intake.goal,
    level: intake.level,
    daysPerWeek: intake.daysPerWeek,
    minutesPerSession: intake.minutesPerSession,
    equipment: intake.equipment,
    environment: intake.environment || 'home',
    restrictions: intake.restrictions || [],
    postpartum: !!intake.postpartum,
    weeks,
    sessions,
    createdAt: new Date(),
  };

  const ref = await db.collection('users').doc(uid).collection('plans').add(planDoc);
  return { planId: ref.id };
});

export const getDailyWorkoutSuggestion = onCallWithCors({ region: 'us-east1' }, async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const data = request.data as ReadinessInput;
  if (!data || !data.sleep || !data.stress || !data.timeAvailable) throw new HttpsError('invalid-argument', 'Missing fields');

  // Very simple readiness logic
  const energy = (data.sleep + (6 - data.stress)) / 2; // higher is better
  const sore = data.soreness ?? 0;
  let type: 'strength'|'hiit'|'mobility'|'walk' = 'strength';

  if (energy <= 2 || sore >= 3) type = 'mobility';
  else if (energy < 3) type = 'walk';
  else if (energy >= 4 && data.timeAvailable >= 20) type = 'hiit';
  else type = 'strength';

  const minutes = Math.min(Math.max(data.timeAvailable, 5), 45);
  const session = buildSession(type, minutes);
  return { suggestion: { ...session, note: type==='mobility' && energy<=2 ? 'Keep it gentle today' : undefined } };
});

// ───────────────── CHALLENGES MVP ─────────────────

export const createChallenge = onCallWithCors({ region: 'us-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  // Only approved users can create challenges
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists || (userDoc.data()?.status && userDoc.data()?.status !== 'approved')) {
    throw new HttpsError('failed-precondition', 'Account pending approval. Please wait until your account is approved.');
  }
  const data = request.data as {
    title: string;
    category?: 'exercise' | 'nutrition' | 'lifestyle' | 'wellness' | 'custom';
    type?: string;
    goal?: 'sessions' | 'minutes'; // Legacy support
    target: number;
    unit?: string;
    startAt: number;
    endAt: number;
    description?: string;
    instructions?: string;
    visibility?: string;
  };
  
  // Validate required fields - check for undefined/null, not truthy (0 is valid for target)
  if (!data?.title || data.target === undefined || data.target === null || 
      data.startAt === undefined || data.startAt === null || 
      data.endAt === undefined || data.endAt === null) {
    console.error('❌ createChallenge: Missing required fields', {
      hasTitle: !!data?.title,
      target: data?.target,
      startAt: data?.startAt,
      endAt: data?.endAt,
      fullData: data
    });
    throw new HttpsError('invalid-argument', 'Missing required fields: title, target, startAt, and endAt are required');
  }

  // Backward compatibility: map old 'goal' to new structure
  let category: string = data.category || 'exercise';
  let type: string = data.type || 'workout_sessions';
  let unit: string = data.unit || 'sessions';

  if (data.goal) {
    // Legacy format - convert to new format
    category = 'exercise';
    if (data.goal === 'sessions') {
      type = 'workout_sessions';
      unit = 'sessions';
    } else if (data.goal === 'minutes') {
      type = 'workout_minutes';
      unit = 'minutes';
    }
  }

  // Default unit based on type if not provided
  if (!data.unit && !data.goal) {
    const unitMap: Record<string, string> = {
      'workout_sessions': 'sessions',
      'workout_minutes': 'minutes',
      'steps': 'steps',
      'distance': 'miles',
      'healthy_meals': 'meals',
      'water_intake': 'glasses',
      'no_sugar': 'days',
      'vegetarian_days': 'days',
      'meal_prep': 'days',
      'meditation': 'minutes',
      'sleep_hours': 'hours',
      'gratitude': 'entries',
      'reading': 'minutes',
      'screen_time': 'hours',
      'self_care': 'days',
      'social_connection': 'days',
      'outdoor_time': 'hours',
      'custom': 'units',
    };
    unit = unitMap[type] || 'units';
  }

  const challenge = {
    title: data.title.trim(),
    category: category,
    type: type,
    target: Math.max(1, Number(data.target) || 1),
    unit: unit,
    startAt: new Date(data.startAt),
    endAt: new Date(data.endAt),
    description: data.description?.trim() || null,
    instructions: data.instructions?.trim() || null,
    visibility: data.visibility || 'members',
    createdBy: request.auth.uid,
    createdAt: new Date(),
    // Legacy support - keep goal for backward compatibility
    goal: data.goal || (type === 'workout_sessions' ? 'sessions' : type === 'workout_minutes' ? 'minutes' : null),
  };
  
  const ref = await db.collection('challenges').add(challenge);
  return { id: ref.id };
});

export const joinChallenge = onCallWithCors({ region: 'us-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists || (userDoc.data()?.status && userDoc.data()?.status !== 'approved')) {
    throw new HttpsError('failed-precondition', 'Account pending approval. Please wait until your account is approved.');
  }
  const { challengeId } = request.data as { challengeId: string };
  if (!challengeId) throw new HttpsError('invalid-argument', 'challengeId required');

  const challengeRef = db.collection('challenges').doc(challengeId);
  const challengeSnap = await challengeRef.get();
  if (!challengeSnap.exists) {
    throw new HttpsError('not-found', 'Challenge not found');
  }
  const challengeData = challengeSnap.data() || {};

  const user = await db.collection('users').doc(request.auth.uid).get();
  const displayName = user.data()?.displayName || 'Member';

  await challengeRef.collection('participants').doc(request.auth.uid).set(
    {
      userId: request.auth.uid,
      displayName,
      progressCount: 0,
      progressValue: 0,
      minutesSum: 0, // Legacy support
      joinedAt: new Date(),
      updatedAt: new Date(),
    },
    { merge: true }
  );

  await db
    .collection('users')
    .doc(request.auth.uid)
    .collection('challengeMemberships')
    .doc(challengeId)
    .set(
      {
        challengeId,
        title: challengeData.title || '',
        category: challengeData.category || 'exercise',
        type: challengeData.type || 'workout_sessions',
        unit: challengeData.unit || 'sessions',
        goal: challengeData.goal || 'sessions', // Legacy support
        target: challengeData.target || 1,
        startAt: challengeData.startAt || null,
        endAt: challengeData.endAt || null,
        visibility: challengeData.visibility || 'members',
        progressCount: 0,
        progressValue: 0,
        minutesSum: 0, // Legacy support
        joinedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

  return { ok: true };
});

async function applyChallengeProgressInternal(params: { userId: string; challengeId: string; count?: number; value?: number; sessions?: number; minutes?: number }) {
  const { userId, challengeId } = params;
  
  // Support both new format (count/value) and legacy format (sessions/minutes)
  let count = Math.max(0, Number(params.count || params.sessions || 0));
  let value = Math.max(0, Number(params.value || params.minutes || 0));
  
  if (!count && !value) {
    return;
  }

  // Get challenge to determine if it's count-based or value-based
  const challengeRef = db.collection('challenges').doc(challengeId);
  const challengeSnap = await challengeRef.get();
  const challengeData = challengeSnap.exists ? challengeSnap.data() : {};
  
  const challengeType = challengeData?.type || challengeData?.goal || 'workout_sessions';
  const isValueBased = challengeType === 'workout_minutes' || 
                       challengeType === 'meditation' || 
                       challengeType === 'sleep_hours' || 
                       challengeType === 'reading' || 
                       challengeType === 'screen_time' || 
                       challengeType === 'outdoor_time' ||
                       challengeType === 'water_intake' ||
                       challengeType === 'minutes';

  const partRef = challengeRef.collection('participants').doc(userId);
  const membershipRef = db.collection('users').doc(userId).collection('challengeMemberships').doc(challengeId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(partRef);
    if (!snap.exists) throw new HttpsError('failed-precondition', 'Not a participant');
    const data = snap.data() || {};
    
    const next: any = {
      updatedAt: new Date(),
    };
    
    if (isValueBased) {
      // Value-based progress (minutes, hours, glasses, etc.)
      const increment = value || count; // Use value if provided, otherwise count
      next.progressValue = (data.progressValue || data.minutesSum || 0) + increment;
      next.minutesSum = next.progressValue; // Legacy support
      if (count > 0) {
        next.progressCount = (data.progressCount || 0) + 1; // Increment count for tracking
      }
    } else {
      // Count-based progress (sessions, meals, days, etc.)
      const increment = count || (value > 0 ? 1 : 0); // Use count if provided, otherwise 1 if value > 0
      next.progressCount = (data.progressCount || 0) + increment;
      if (value > 0) {
        next.progressValue = (data.progressValue || 0) + value; // Track value for count-based too
      }
    }
    
    tx.update(partRef, next);

    const membershipSnap = await tx.get(membershipRef);
    if (membershipSnap.exists) {
      const membershipData = membershipSnap.data() || {};
      const membershipUpdate: any = {
        updatedAt: new Date(),
      };
      
      if (isValueBased) {
        const increment = value || count;
        membershipUpdate.progressValue = (membershipData.progressValue || membershipData.minutesSum || 0) + increment;
        membershipUpdate.minutesSum = membershipUpdate.progressValue; // Legacy support
        if (count > 0) {
          membershipUpdate.progressCount = (membershipData.progressCount || 0) + 1;
        }
      } else {
        const increment = count || (value > 0 ? 1 : 0);
        membershipUpdate.progressCount = (membershipData.progressCount || 0) + increment;
        if (value > 0) {
          membershipUpdate.progressValue = (membershipData.progressValue || 0) + value;
        }
      }
      
      tx.update(membershipRef, membershipUpdate);
    } else {
      const initialData: any = {
        challengeId,
        progressCount: isValueBased ? (count > 0 ? 1 : 0) : count,
        progressValue: isValueBased ? (value || count) : (value || 0),
        minutesSum: isValueBased ? (value || count) : 0, // Legacy support
        joinedAt: new Date(),
        updatedAt: new Date(),
      };
      tx.set(membershipRef, initialData, { merge: true });
    }
  });
}

export const incrementChallengeProgress = onCallWithCors({ region: 'us-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists || (userDoc.data()?.status && userDoc.data()?.status !== 'approved')) {
    throw new HttpsError('failed-precondition', 'Account pending approval. Please wait until your account is approved.');
  }
  const { challengeId, count, value, sessions, minutes } = request.data as { 
    challengeId: string; 
    count?: number; 
    value?: number; 
    sessions?: number; 
    minutes?: number;
  };
  if (!challengeId) throw new HttpsError('invalid-argument', 'challengeId required');

  await applyChallengeProgressInternal({
    userId: request.auth.uid,
    challengeId,
    count,
    value,
    sessions, // Legacy support
    minutes, // Legacy support
  });

  return { ok: true };
});

export const logChallengeCheckIn = onCallWithCors({ region: 'us-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists || (userDoc.data()?.status && userDoc.data()?.status !== 'approved')) {
    throw new HttpsError('failed-precondition', 'Account pending approval. Please wait until your account is approved.');
  }
  const { challengeId, count, value, note } = request.data as {
    challengeId: string;
    count?: number;
    value?: number;
    note?: string;
  };
  if (!challengeId) throw new HttpsError('invalid-argument', 'challengeId required');

  const challengeRef = db.collection('challenges').doc(challengeId);
  const participantRef = challengeRef.collection('participants').doc(request.auth.uid);
  const participantSnap = await participantRef.get();
  if (!participantSnap.exists) {
    throw new HttpsError('failed-precondition', 'Join the challenge first');
  }

  // Compute streaks
  const checkInsRef = participantRef.collection('checkIns');
  const now = new Date();
  const todayKey = now.toDateString();
  const yesterdayKey = new Date(now.getTime() - 24 * 60 * 60 * 1000).toDateString();
  const recentSnap = await checkInsRef.orderBy('createdAt', 'desc').limit(1).get();
  let currentStreak = 0;
  let longestStreak = participantSnap.data()?.longestStreak || 0;
  if (!recentSnap.empty) {
    const last = recentSnap.docs[0].data();
    const lastDate = (last.createdAt as FirebaseFirestore.Timestamp)?.toDate() || new Date(last.createdAt);
    const lastKey = lastDate.toDateString();
    if (lastKey === todayKey) {
      currentStreak = last.streak || 1;
    } else if (lastKey === yesterdayKey) {
      currentStreak = (last.streak || 0) + 1;
    } else {
      currentStreak = 1;
    }
  } else {
    currentStreak = 1;
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  await applyChallengeProgressInternal({
    userId: request.auth.uid,
    challengeId,
    count,
    value,
    sessions: undefined,
    minutes: undefined,
  });

  // Record the check-in for history/audit
  await participantRef.collection('checkIns').add({
    userId: request.auth.uid,
    challengeId,
    count: count ?? null,
    value: value ?? null,
    note: note?.trim() || null,
    createdAt: new Date(),
    streak: currentStreak,
    longestStreak: longestStreak,
  });

  // Update participant streaks
  await participantRef.set(
    {
      currentStreak,
      longestStreak,
      lastCheckIn: new Date(),
    },
    { merge: true }
  );

  return { ok: true };
});

const toDateOrNull = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === 'number') {
    return new Date(value);
  }
  return null;
};

export const onSessionCreatedUpdateChallenges = onDocumentCreated('users/{userId}/sessions/{sessionId}', async (event) => {
  const userId = event.params.userId;
  const data = event.data?.data();
  if (!data) return;

  const minutes = Math.max(0, Number(data.minutes || 0));
  const completedAt = toDateOrNull(data.completedAt) ?? new Date();

  try {
    const membershipsSnap = await db.collection('users').doc(userId).collection('challengeMemberships').get();
    if (membershipsSnap.empty) {
      return;
    }

    const tasks: Array<Promise<void>> = [];
    membershipsSnap.forEach((docSnap) => {
      const membership = docSnap.data() || {};
      const startAt = toDateOrNull(membership.startAt);
      const endAt = toDateOrNull(membership.endAt);
      if (startAt && completedAt < startAt) return;
      if (endAt && completedAt > endAt) return;

      const goal: 'sessions' | 'minutes' = membership.goal || 'sessions';
      const payload: { sessions?: number; minutes?: number } = {};
      if (goal === 'minutes') {
        if (minutes <= 0) return;
        payload.minutes = minutes;
      } else {
        payload.sessions = 1;
      }

      tasks.push(
        applyChallengeProgressInternal({
          userId,
          challengeId: docSnap.id,
          ...payload,
        }).catch((error) => {
          console.error('❌ [ChallengeProgress] Auto-update failed', {
            userId,
            challengeId: docSnap.id,
            goal,
            error: (error as Error)?.message,
          });
        })
      );
    });

    if (tasks.length) {
      await Promise.all(tasks);
    }
  } catch (error) {
    console.error('❌ [ChallengeProgress] Failed to process session trigger', {
      userId,
      sessionId: event.params.sessionId,
      error: (error as Error)?.message,
    });
  }
});

export const generateChallengeShareCard = onCallWithCors({
  region: 'us-east1',
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const { challengeId } = request.data as { challengeId: string };
  if (!challengeId) throw new HttpsError('invalid-argument', 'challengeId required');

  const uid = request.auth.uid;
  const challengeRef = db.collection('challenges').doc(challengeId);
  const challengeSnap = await challengeRef.get();
  if (!challengeSnap.exists) throw new HttpsError('not-found', 'Challenge not found');
  const challenge = challengeSnap.data() || {};

  const participantSnap = await challengeRef.collection('participants').doc(uid).get();
  if (!participantSnap.exists) throw new HttpsError('failed-precondition', 'Join the challenge to share progress.');
  const participant = participantSnap.data() || {};

  const membershipSnap = await db.collection('users').doc(uid).collection('challengeMemberships').doc(challengeId).get();
  const membership = membershipSnap.exists ? (membershipSnap.data() || {}) : {};

  // Support both new flexible structure and legacy structure
  const challengeType = challenge.type || challenge.goal || 'workout_sessions';
  const isValueBased = challengeType === 'workout_minutes' || 
                      challengeType === 'meditation' || 
                      challengeType === 'sleep_hours' || 
                      challengeType === 'reading' || 
                      challengeType === 'screen_time' || 
                      challengeType === 'outdoor_time' ||
                      challengeType === 'water_intake' ||
                      challengeType === 'minutes';
  
  const unit = challenge.unit || (challenge.goal === 'minutes' ? 'minutes' : 'sessions');
  const target = Math.max(1, Number(challenge.target) || 1);
  
  const progressValue = isValueBased
    ? Number(participant.progressValue || participant.minutesSum || membership.progressValue || membership.minutesSum || 0)
    : Number(participant.progressCount || membership.progressCount || 0);
  
  const percentComplete = Math.min(100, Math.max(0, Math.round((progressValue / target) * 100)));
  const remaining = Math.max(0, target - progressValue);

  const userName = (participant.displayName || membership.displayName || 'Member').toString();
  const title = (challenge.title || 'Challenge').toString();
  const progressLabel = `${progressValue} / ${target} ${unit}`;
  const remainingLabel = `${remaining} ${unit} to go`;

  const now = new Date();
  const startAt = challenge.startAt?.toDate?.() || (challenge.startAt instanceof Date ? challenge.startAt : null);
  const endAt = challenge.endAt?.toDate?.() || (challenge.endAt instanceof Date ? challenge.endAt : null);

  const timeWindow = [
    startAt ? startAt.toLocaleDateString() : 'Start TBD',
    endAt ? endAt.toLocaleDateString() : 'End TBD',
  ].join(' → ');

  const width = 1080;
  const height = 1350;

  const gradientId = `grad-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="100%" stop-color="#F25129"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#F8F5FF"/>
  <rect x="60" y="140" width="${width - 120}" height="${height - 240}" rx="48" fill="url(#${gradientId})" opacity="0.85"/>
  <text x="90" y="230" font-size="36" font-family="Inter, Arial" fill="#442A12" font-weight="600">Moms Fitness Mojo</text>
  <text x="90" y="300" font-size="54" font-family="Inter, Arial" fill="#1F2937" font-weight="700">${escapeSvgText(title)}</text>
  <text x="90" y="360" font-size="34" font-family="Inter, Arial" fill="#1F2937">${escapeSvgText(userName)} • ${percentComplete}% complete</text>
  <text x="90" y="440" font-size="80" font-family="Inter, Arial" fill="#111827" font-weight="800">${escapeSvgText(progressLabel)}</text>
  <text x="90" y="510" font-size="32" font-family="Inter, Arial" fill="#111827">${escapeSvgText(remainingLabel)}</text>
  <text x="90" y="570" font-size="26" font-family="Inter, Arial" fill="#4B5563">Window: ${escapeSvgText(timeWindow)}</text>
  <rect x="90" y="620" width="${width - 180}" height="40" rx="20" fill="#F9FAFB" opacity="0.65"/>
  <rect x="90" y="620" width="${Math.max(12, Math.round((width - 180) * (percentComplete / 100)))}" height="40" rx="20" fill="#1F2937" opacity="0.9"/>
  <text x="90" y="710" font-size="28" font-family="Inter, Arial" fill="#1F2937">Keep going—your community is cheering you on!</text>
  <text x="90" y="${height - 140}" font-size="24" font-family="Inter, Arial" fill="#4B5563">Generated ${now.toLocaleDateString()}</text>
</svg>
  `.trim();

  const baseBuffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 249, g: 250, b: 251, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const cardBuffer = await sharp(baseBuffer)
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();

  const tmpCardPath = path.join(os.tmpdir(), `challenge-card-${uid}-${Date.now()}.png`);
  const tmpWatermarked = path.join(os.tmpdir(), `challenge-card-wm-${uid}-${Date.now()}.png`);
  await fsp.writeFile(tmpCardPath, cardBuffer);

  try {
    await applyImageWatermark(tmpCardPath, tmpWatermarked);

    const bucketName = process.env.STORAGE_BUCKET || `${process.env.GCLOUD_PROJECT}.firebasestorage.app`;
    const bucket = getStorage().bucket(bucketName);
    const storagePath = `share/cards/${uid}/${challengeId}-${Date.now()}.png`;
    const downloadToken = uuidv4();

    await bucket.upload(tmpWatermarked, {
      destination: storagePath,
      metadata: {
        contentType: 'image/png',
        cacheControl: 'private, max-age=3600',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
          watermark: 'true',
          generatedBy: uid,
          challengeId,
        },
      },
    });

    const encodedPath = encodeURIComponent(storagePath);
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    const storageFolder = storagePath.substring(0, storagePath.lastIndexOf('/') + 1);
    const titleForCard = `${userName} • ${percentComplete}% ${unit}`;

    const mediaDoc: Record<string, any> = {
      title: titleForCard,
      type: 'image',
      url: downloadUrl,
      filePath: storagePath,
      storageFolder,
      thumbnailPath: storagePath,
      thumbnails: {
        originalPath: storagePath,
        originalReady: true,
        largePath: storagePath,
        largeReady: true,
        mediumPath: storagePath,
        mediumReady: true,
        smallPath: storagePath,
        smallReady: true,
      },
      width,
      height,
      sizeBytes: cardBuffer.length,
      uploadedBy: uid,
      uploadedByName: userName,
      isPublic: true,
      visibility: 'community',
      allowDownload: true,
      allowComments: true,
      allowReactions: true,
      description: `Challenge progress for ${challenge.title || 'Challenge'}`,
      tags: ['challenge', 'share-card', challengeType, challenge.category || 'exercise'],
      challengeId,
      challengeTitle: challenge.title || '',
      challengeCategory: challenge.category || 'exercise',
      challengeType: challengeType,
      challengeGoal: challenge.goal || challengeType, // Legacy support
      challengeTarget: target,
      challengePercentComplete: percentComplete,
      challengeProgressValue: progressValue,
      challengeRemaining: remaining,
      challengeShare: {
        generatedAt: new Date(),
        percentComplete,
        progressLabel,
        remainingLabel,
        timeWindow,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      likesCount: 0,
      commentsCount: 0,
      viewCount: 0,
      source: 'challengeShareCard',
      transcodeStatus: 'ready',
      isGenerated: true,
      shareCard: true,
    };

    const mediaRef = await db.collection('media').add(mediaDoc);

    console.log('✅ [ChallengeShareCard] Generated card', { challengeId, userId: uid, storagePath, mediaId: mediaRef.id });
    return { url: downloadUrl, mediaId: mediaRef.id };
  } catch (error) {
    console.error('❌ [ChallengeShareCard] Failed to generate card', { challengeId, userId: uid, error });
    throw new HttpsError('internal', 'Failed to generate share card.');
  } finally {
    await cleanupTempFiles(tmpCardPath, tmpWatermarked);
  }
});

// ───────────────── Adaptive Progression (rule-based) ─────────────────

export const applyAdaptiveProgression = onCallWithCors({ region: 'us-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required');
  const uid = request.auth.uid;
  const planId = (request.data as any)?.planId as string | undefined;

  // Fetch last 4 sessions
  const last = await db.collection('users').doc(uid).collection('sessions').orderBy('completedAt', 'desc').limit(4).get();
  const items = last.docs.map(d => d.data());
  const rpes = items.map(s => Number(s.rpe)).filter(v => !isNaN(v)) as number[];
  const avgRpe = rpes.length ? (rpes.reduce((a,b)=>a+b,0)/rpes.length) : 7;

  let minutesDelta = 0;
  let suggestion: 'increase'|'hold'|'decrease'|'swap_mobility' = 'hold';
  if (avgRpe <= 6) { minutesDelta = 5; suggestion = 'increase'; }
  if (avgRpe >= 8) { minutesDelta = -5; suggestion = 'decrease'; }

  const adjustment = {
    avgRpe: Math.round(avgRpe*10)/10,
    minutesDelta,
    suggestion,
    evaluatedAt: new Date(),
  };

  try {
    const coachNote = await generateAdaptiveCoachNote(
      {
        avgRpe: adjustment.avgRpe,
        minutesDelta,
        suggestion,
      },
      items
    );
    if (coachNote) {
      (adjustment as any).coachNote = coachNote;
    }
  } catch (error) {
    console.error('⚠️ [AdaptiveProgression] Coach note generation failed:', (error as Error)?.message);
  }

  if (planId) {
    await db.collection('users').doc(uid).collection('plans').doc(planId).set({ nextAdjustment: adjustment }, { merge: true });
  }
  return { adjustment };
});

const buildFallbackCoachNote = (suggestion: 'increase'|'hold'|'decrease'|'swap_mobility', minutesDelta: number): string => {
  switch (suggestion) {
    case 'increase':
      return `Great work staying consistent! Let's gently add ${minutesDelta} more minutes next session—keep breathing and stay mindful of form.`;
    case 'decrease':
      return `You’ve been pushing hard. Ease back ${Math.abs(minutesDelta)} minutes, focus on quality movement, and let recovery lead the way.`;
    case 'swap_mobility':
      return 'Body needs a mobility reset today. Lean into slower flows, deep breathing, and restorative moves to keep momentum gentle.';
    default:
      return 'Keep your current rhythm—consistency is winning. Stay present, hydrate, and celebrate every rep you show up for.';
  }
};

async function generateAdaptiveCoachNote(
  adjustment: { avgRpe: number; minutesDelta: number; suggestion: 'increase'|'hold'|'decrease'|'swap_mobility' },
  recentSessions: any[]
): Promise<string | null> {
  const sessionSummary = recentSessions
    .map((session: any, idx: number) => {
      const type = session?.type || 'Workout';
      const minutes = session?.minutes ?? session?.duration ?? '?';
      const rpe = session?.rpe !== undefined ? session.rpe : 'n/a';
      return `Session ${idx + 1}: ${type} • ${minutes} min • RPE ${rpe}`;
    })
    .join('\n');

  const basePrompt = `
You are an encouraging fitness coach for Moms Fitness Mojo—a supportive community for moms balancing energy, recovery, and family life.

User data:
- Average RPE: ${adjustment.avgRpe}
- Suggested change: ${adjustment.suggestion} (${adjustment.minutesDelta >= 0 ? '+' : ''}${adjustment.minutesDelta} minutes)
- Recent sessions:
${sessionSummary || 'None logged yet.'}

Write 2 short supportive sentences (max 280 characters total) that celebrate progress and give a next-step tip. 
If suggestion is "increase", encourage confidence and mindful pacing. 
If "decrease", emphasize recovery and tuning into the body. 
If "swap_mobility", invite restorative movement. 
If "hold", celebrate consistency.
Keep tone warm, empowering, and mom-to-mom. Respond with plain text only.
`.trim();

  let note: string | null = null;

  let geminiApiKey = process.env.GEMINI_API_KEY || null;
  if (!geminiApiKey) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const functions = require('firebase-functions');
      geminiApiKey = functions.config()?.gemini?.api_key || null;
    } catch (error) {
      // ignore config lookup failure
    }
  }

  if (geminiApiKey) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-pro', 'gemini-1.0-pro'];
      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(basePrompt);
          const response = await result.response;
          note = response.text().trim();
          if (note) break;
        } catch (modelError) {
          console.warn(`⚠️ [AdaptiveCoach] Gemini model ${modelName} failed:`, (modelError as Error)?.message);
        }
      }
    } catch (error) {
      console.error('❌ [AdaptiveCoach] Gemini invocation failed:', (error as Error)?.message);
    }
  }

  if (!note) {
    let openaiApiKey = process.env.OPENAI_API_KEY || null;
    if (!openaiApiKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const functions = require('firebase-functions');
        openaiApiKey = functions.config()?.openai?.api_key || null;
      } catch (error) {
        // ignore config lookup failure
      }
    }

    if (openaiApiKey) {
      try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: openaiApiKey });
        const response = await openai.responses.create({
          model: 'gpt-4o-mini',
          input: basePrompt,
          max_output_tokens: 200,
        });
        note = response?.output_text?.trim() || null;
      } catch (error) {
        console.error('❌ [AdaptiveCoach] OpenAI invocation failed:', (error as Error)?.message);
      }
    }
  }

  if (!note) {
    note = buildFallbackCoachNote(adjustment.suggestion, adjustment.minutesDelta);
  }

  if (!note) return null;
  const sanitized = note.replace(/\s+/g, ' ').trim();
  if (sanitized.length <= 320) return sanitized;
  return `${sanitized.slice(0, 317).trim()}…`;
}

// ───────────────── ACCOUNT APPROVALS: Notifications ─────────────────

/**
 * Helper function: Send push notification with SMS fallback for admins
 * Strategy: Try push first, if fails or disabled, send SMS
 */
async function sendAdminNotificationWithFallback(
  adminId: string,
  adminData: any,
  title: string,
  body: string,
  smsMessage: string,
  data?: Record<string, string>
): Promise<void> {
  const fcmToken = adminData?.fcmToken;
  const phoneNumber = adminData?.phoneNumber;
  const pushEnabled = adminData?.notificationPreferences?.pushEnabled !== false; // Default to true if not set
  
  // Try push notification first if enabled and token exists
  if (pushEnabled && fcmToken) {
    try {
      const { getMessaging } = await import('firebase-admin/messaging');
      const messaging = getMessaging();
      await messaging.send({
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: data || {},
      });
      console.log(`✅ Push notification sent to admin ${adminId}`);
      return; // Success - no need for SMS
    } catch (pushError: any) {
      console.warn(`⚠️ Push notification failed for admin ${adminId}:`, pushError?.message || pushError);
      // Continue to SMS fallback
    }
  }

  // SMS Fallback: Send SMS immediately if push failed or disabled (admins need immediate notification)
  if (phoneNumber) {
    try {
      const result = await sendSMSViaTwilio(phoneNumber, smsMessage);
      if (result.success) {
        console.log(`✅ SMS sent immediately to admin ${adminId} (push ${fcmToken && pushEnabled ? 'failed' : 'disabled'})`);
      } else {
        console.error(`❌ SMS failed for admin ${adminId}:`, result.error);
      }
    } catch (smsError) {
      console.error(`❌ Failed to send SMS for admin ${adminId}:`, smsError);
    }
  } else {
    console.warn(`⚠️ No phone number found for admin ${adminId} - cannot send SMS fallback`);
  }
}

// Notify admins when new approval request is created
export const onAccountApprovalCreated = onDocumentCreated(
  {
    document: "accountApprovals/{approvalId}",
    region: 'us-east1'
  },
  async (event) => {
  try {
    console.log('🔔 onAccountApprovalCreated: Function triggered', {
      approvalId: event.params.approvalId,
      hasData: !!event.data?.data()
    });

    const approvalData = event.data?.data();
    if (!approvalData) {
      console.warn('⚠️ onAccountApprovalCreated: No approval data found');
      return;
    }

    const userId = approvalData.userId;
    const userName = `${approvalData.firstName} ${approvalData.lastName}`;
    
    console.log('🔔 onAccountApprovalCreated: Processing approval request', {
      userId,
      userName,
      approvalId: event.params.approvalId
    });
    
    // Get all admins
    const adminsSnapshot = await db.collection('users')
      .where('role', '==', 'admin')
      .get();

    console.log('🔔 onAccountApprovalCreated: Found admins', {
      adminCount: adminsSnapshot.size,
      adminIds: adminsSnapshot.docs.map(doc => doc.id)
    });

    if (adminsSnapshot.empty) {
      console.warn('⚠️ onAccountApprovalCreated: No admins found to notify');
      return;
    }

    // Create in-app notifications for all admins
    const notifications = adminsSnapshot.docs.map(adminDoc => {
      return {
        userId: adminDoc.id,
        type: 'account_approval_request',
        title: 'New Account Approval Request',
        message: `${userName} has submitted an account approval request.`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        metadata: {
          approvalId: event.params.approvalId,
          userId: userId,
          userName: userName
        }
      };
    });

    // Batch write in-app notifications
    const batch = db.batch();
    notifications.forEach(notif => {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, notif);
      console.log('🔔 onAccountApprovalCreated: Queued notification for admin', {
        adminId: notif.userId,
        notificationId: notifRef.id
      });
    });
    await batch.commit();
    console.log('✅ onAccountApprovalCreated: In-app notifications created successfully', {
      notificationCount: notifications.length
    });

    // Send push notifications with SMS fallback for each admin
    const notificationPromises = adminsSnapshot.docs.map(async (adminDoc) => {
      const adminData = adminDoc.data();
      const adminId = adminDoc.id;

      await sendAdminNotificationWithFallback(
        adminId,
        adminData,
        'New Account Approval Request',
        `${userName} has submitted an account approval request.`,
        `MOMS FITNESS MOJO: New account approval request from ${userName}. Check admin console.`,
        {
          type: 'account_approval_request',
          approvalId: event.params.approvalId,
          userId: userId,
        }
      );
    });

    const results = await Promise.allSettled(notificationPromises);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;
    
    console.log(`✅ onAccountApprovalCreated: Notified ${adminsSnapshot.size} admins`, {
      successCount,
      failureCount,
      totalAdmins: adminsSnapshot.size
    });
    
    if (failureCount > 0) {
      console.error('❌ onAccountApprovalCreated: Some notifications failed', {
        failures: results
          .map((r, i) => r.status === 'rejected' ? { adminIndex: i, error: r.reason } : null)
          .filter(Boolean)
      });
    }
  } catch (error) {
    console.error('❌ onAccountApprovalCreated: Error in function', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      approvalId: event.params.approvalId
    });
    throw error; // Re-throw to ensure Firebase logs the error
  }
});

// Notify users when approval status changes
export const onAccountApprovalUpdated = onDocumentWritten(
  {
    document: "accountApprovals/{approvalId}",
    region: 'us-east1'
  },
  async (event) => {
  try {
    const beforeData = event.data?.before?.exists ? event.data?.before.data() : null;
    const afterData = event.data?.after?.exists ? event.data?.after.data() : null;

    if (!beforeData || !afterData) return;

    const beforeStatus = beforeData.status;
    const afterStatus = afterData.status;
    const userId = afterData.userId;

    // Only process if status changed
    if (beforeStatus === afterStatus) return;

    // Status changed to approved
    if (afterStatus === 'approved' && beforeStatus !== 'approved') {
      const userName = `${afterData.firstName || ''} ${afterData.lastName || ''}`.trim() || 'User';
      
      // Create in-app notification for user - capture DocumentReference to avoid race condition
      const notificationRef = db.collection('notifications').doc();
      await notificationRef.set({
        userId: userId,
        type: 'account_approved',
        title: '🎉 Account Approved!',
        message: 'Your account has been approved! Welcome to Moms Fitness Mojo!',
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        metadata: {
          approvalId: event.params.approvalId
        }
      });
      
      const notificationId = notificationRef.id; // Use the ID directly, no query needed

      // Queue SMS with 5-minute delay (cost-saving: check if notification.read before sending)
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        if (userData?.phoneNumber) {
          // Check if user has SMS notifications enabled (default to true)
          const smsEnabled = userData?.notificationPreferences?.smsEnabled !== false;
          
          if (smsEnabled) {
            
            // Queue SMS with 5-minute delay
            const dispatchAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
            await db.collection('sms_dispatch_queue').add({
              userId: userId,
              phoneNumber: userData.phoneNumber,
              message: `🎉 MOMS FITNESS MOJO: Your account has been approved! Welcome ${userName}! You can now access all features.`,
              notificationId: notificationId,
              type: 'account_approved',
              status: 'pending',
              createdAt: FieldValue.serverTimestamp(),
              dispatchAt: Timestamp.fromDate(dispatchAt),
            });
            console.log(`✅ SMS approval notification queued with 5-minute delay for user ${userId}`);
          } else {
            console.log(`ℹ️ SMS notifications disabled for user ${userId}, skipping SMS`);
          }
        } else {
          console.warn(`⚠️ No phone number found for user ${userId} - cannot send SMS`);
        }
      } catch (smsError) {
        console.error('❌ Failed to queue SMS for user:', smsError);
      }

      // Send push notification if user has it enabled
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const fcmToken = userData?.fcmToken;
        const pushEnabled = userData?.notificationPreferences?.pushEnabled !== false;
        
        if (pushEnabled && fcmToken) {
          const { getMessaging } = await import('firebase-admin/messaging');
          const messaging = getMessaging();
          await messaging.send({
            token: fcmToken,
            notification: {
              title: '🎉 Account Approved!',
              body: 'Your account has been approved! Welcome to Moms Fitness Mojo!',
            },
            data: {
              type: 'account_approved',
              approvalId: event.params.approvalId,
            },
          });
          console.log(`✅ Push notification sent to user ${userId}`);
        }
      } catch (pushError: any) {
        console.warn(`⚠️ Push notification failed for user ${userId}:`, pushError?.message || pushError);
        // Push failure is not critical - SMS and in-app notifications are enough
      }
    }

    // Status changed to rejected
    if (afterStatus === 'rejected' && beforeStatus !== 'rejected') {
      const rejectionReason = afterData.rejectionReason || 'No reason provided.';
      const userName = `${afterData.firstName || ''} ${afterData.lastName || ''}`.trim() || 'User';

      // Create in-app notification for user
      await db.collection('notifications').add({
        userId: userId,
        type: 'account_rejected',
        title: 'Account Request Not Approved',
        message: `Your account request was not approved. Reason: ${rejectionReason}`,
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        metadata: {
          approvalId: event.params.approvalId,
          rejectionReason: rejectionReason
        }
      });

      // Send SMS immediately for rejections (critical, user needs to know)
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        if (userData?.phoneNumber) {
          // Check if user has SMS notifications enabled (default to true)
          const smsEnabled = userData?.notificationPreferences?.smsEnabled !== false;
          
          if (smsEnabled) {
            // Send SMS immediately (rejections are critical)
            const smsMessage = `MOMS FITNESS MOJO: Your account request was not approved. Reason: ${rejectionReason}. You can view details and reapply after 30 days.`;
            const result = await sendSMSViaTwilio(userData.phoneNumber, smsMessage);
            
            if (result.success) {
              console.log(`✅ SMS rejection notification sent immediately to user ${userId}`);
            } else {
              console.error(`❌ Failed to send SMS rejection to user ${userId}:`, result.error);
            }
          } else {
            console.log(`ℹ️ SMS notifications disabled for user ${userId}, skipping SMS`);
          }
        } else {
          console.warn(`⚠️ No phone number found for user ${userId} - cannot send SMS`);
        }
      } catch (smsError) {
        console.error('❌ Failed to send SMS for user:', smsError);
      }

      // Send push notification if user has it enabled
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();
        const fcmToken = userData?.fcmToken;
        const pushEnabled = userData?.notificationPreferences?.pushEnabled !== false;
        
        if (pushEnabled && fcmToken) {
          const { getMessaging } = await import('firebase-admin/messaging');
          const messaging = getMessaging();
          await messaging.send({
            token: fcmToken,
            notification: {
              title: 'Account Request Not Approved',
              body: `Your account request was not approved. Reason: ${rejectionReason}`,
            },
            data: {
              type: 'account_rejected',
              approvalId: event.params.approvalId,
            },
          });
          console.log(`✅ Push notification sent to user ${userId}`);
        }
      } catch (pushError: any) {
        console.warn(`⚠️ Push notification failed for user ${userId}:`, pushError?.message || pushError);
        // Push failure is not critical - SMS and in-app notifications are enough
      }
    }
  } catch (error) {
    console.error('Error in onAccountApprovalUpdated:', error);
  }
});

// NOTE: Server-side moderation triggers are now handled by contentModerationTriggers.ts
// The old onPostCreated and onMediaCreated triggers have been removed to prevent duplicate processing.
// See: onPostCreatedModeration, onMediaCreatedModeration in contentModerationTriggers.ts

// REMOVED: Duplicate onPostCreated trigger (lines 5334-5410)
// REMOVED: Duplicate onMediaCreated trigger (lines 5412-5626)
// These were causing double processing. Use the Moderation versions from contentModerationTriggers.ts instead.

/* REMOVED - Duplicate trigger
export const onMediaCreated = onDocumentCreated(
  {
    document: "media/{mediaId}",
    region: 'us-east1'
  },
  async (event) => {
    try {
      const mediaData = event.data?.data();
      if (!mediaData) return;

      const mediaId = event.params.mediaId;
      const mediaRef = event.data?.ref;

      console.log('🔍 [ServerModeration] Re-moderating media:', mediaId);

      // Always re-moderate server-side, even if description is empty
      const descriptionToModerate = (mediaData.description || '').trim();
      const contentToModerate = descriptionToModerate || 'Media upload with no description';
      
      // Call moderation logic directly (server-side)
      const moderationModule = await import('./contentModeration');
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        // If no API key, require approval for safety (especially for media without description)
        await mediaRef.update({
          moderationStatus: 'pending',
          moderationReason: 'Moderation service not configured - requires manual review',
          serverModerated: true,
          moderatedAt: FieldValue.serverTimestamp()
        });
        return;
      }
      
      // CRITICAL: Analyze actual image/video content if URL is available
      // COST OPTIMIZATION: Since users are pre-verified by admin, we can be selective
      // Only analyze when there's a higher risk indicator
      let imageAnalysisResult = null;
      
      // Check if user is trusted (reduce costs for verified community members)
      const userDoc = await db.collection('users').doc(mediaData.uploadedBy).get();
      const userData = userDoc.data();
      const isAdmin = userData?.role === 'admin';
      const isApprovedUser = userData?.status === 'approved' || !userData?.status; // Legacy users without status are approved
      const requiresUserApproval = userData?.moderationSettings?.requireApproval === true;
      
      // Check if user is in admin-managed trusted list
      let isInTrustedList = false;
      if (!isAdmin) {
        try {
          const trustedUsersQuery = db.collection('trustedUsers')
            .where('userId', '==', mediaData.uploadedBy)
            .limit(1);
          const trustedUsersSnapshot = await trustedUsersQuery.get();
          isInTrustedList = !trustedUsersSnapshot.empty;
        } catch (error) {
          console.warn('⚠️ [ServerModeration] Error checking trusted list:', error);
          // On error, assume not trusted (safer)
        }
      }
      
      // Analyze text description first (cheaper than image analysis)
      const aiResult = await moderationModule.analyzeContentWithGemini(
        contentToModerate,
        'media',
        apiKey
      );
      
      // Apply keyword check as well
      const keywordCheck = moderationModule.checkNegativeKeywords(contentToModerate);
      
      // Since all users are pre-verified by admin, we can be more selective
      // Only analyze images when there's a risk indicator
      const hasTextIssues = aiResult.requiresApproval || keywordCheck.requiresApproval;
      const hasNoDescription = !descriptionToModerate;
      
      // COST SAVING STRATEGY for verified community:
      // 1. Admins: Skip image analysis entirely (fully trusted)
      // 2. Users in trusted list: Skip image analysis (admin-managed trusted list)
      // 3. Approved users: Only analyze if text has issues OR no description
      // 4. Users requiring approval: Always analyze (higher risk)
      // 5. Videos: Only analyze thumbnail if available (not full video)
      
      const shouldAnalyzeImage = !isAdmin && // Skip for admins
                                 !isInTrustedList && // Skip for users in admin-managed trusted list
                                 (requiresUserApproval || // Always check users flagged for approval
                                  hasTextIssues || // Text has issues - verify image
                                  hasNoDescription); // No description - need to check image
      
      // Only analyze images (not videos) to save costs
      // Videos are expensive to analyze frame-by-frame
      if (mediaData.url && mediaData.type === 'image' && shouldAnalyzeImage) {
        try {
          console.log('🖼️ [ServerModeration] Analyzing image content (risk-based):', mediaData.url);
          imageAnalysisResult = await analyzeMediaContent(mediaData.url, mediaData.type, apiKey);
          console.log('✅ [ServerModeration] Image analysis result:', imageAnalysisResult);
        } catch (imageError: any) {
          console.error('❌ [ServerModeration] Image analysis failed:', imageError);
          // If image analysis fails, require approval for safety
          imageAnalysisResult = {
            requiresApproval: true,
            isBlocked: false,
            detectedIssues: ['Image analysis failed - requires manual review'],
            reason: 'Unable to analyze image content automatically'
          };
        }
      } else if (mediaData.type === 'image' && !shouldAnalyzeImage) {
        if (isAdmin) {
          console.log('💰 [ServerModeration] Skipping image analysis - admin user');
        } else if (isInTrustedList) {
          console.log('💰 [ServerModeration] Skipping image analysis - user in admin-managed trusted list');
        } else {
          console.log('💰 [ServerModeration] Skipping image analysis - verified user with clean content');
        }
      } else if (mediaData.type === 'video') {
        // For videos, only analyze thumbnail if there are text issues
        // Video frame analysis is too expensive
        if (mediaData.thumbnailUrl && (hasTextIssues || hasNoDescription)) {
          try {
            console.log('🖼️ [ServerModeration] Analyzing video thumbnail (risk-based):', mediaData.thumbnailUrl);
            imageAnalysisResult = await analyzeMediaContent(mediaData.thumbnailUrl, 'image', apiKey);
            console.log('✅ [ServerModeration] Thumbnail analysis result:', imageAnalysisResult);
          } catch (imageError: any) {
            console.warn('⚠️ [ServerModeration] Thumbnail analysis failed (non-critical):', imageError);
            // Thumbnail analysis failure is non-critical for videos
          }
        }
      }
      
      // Analyze text description
      const aiResult = await moderationModule.analyzeContentWithGemini(
        contentToModerate,
        'media',
        apiKey
      );
      
      // Apply keyword check as well
      const keywordCheck = moderationModule.checkNegativeKeywords(contentToModerate);
      
      // Combine text and image analysis results
      const hasImageViolation = imageAnalysisResult && (imageAnalysisResult.isBlocked || imageAnalysisResult.requiresApproval);
      const imageIssues = imageAnalysisResult?.detectedIssues || [];
      
      // Determine final moderation decision
      // If no description, always require approval
      const requiresApprovalForEmptyDescription = !descriptionToModerate;
      const requiresApproval = aiResult.requiresApproval || keywordCheck.requiresApproval || requiresApprovalForEmptyDescription || (imageAnalysisResult?.requiresApproval || false);
      const isBlocked = aiResult.isBlocked || keywordCheck.isBlocked || (imageAnalysisResult?.isBlocked || false);
      
      const moderationResult = {
        requiresApproval,
        isBlocked,
        reason: requiresApprovalForEmptyDescription
          ? 'Media uploaded without description - requires manual review'
          : (isBlocked 
            ? 'Content contains inappropriate material and cannot be published.'
            : (requiresApproval
              ? 'Content may require review before publication.'
              : undefined)),
        detectedIssues: [
          ...aiResult.detectedIssues, 
          ...keywordCheck.detectedIssues,
          ...(requiresApprovalForEmptyDescription ? ['No description provided'] : [])
        ]
      };

      // Basic media content checks (file type, size)
      const mediaChecks = {
        hasValidType: mediaData.type === 'image' || mediaData.type === 'video',
        hasUrl: !!mediaData.url,
        hasDescription: !!descriptionToModerate
      };

      // If no description, require approval (can't verify content without description)
      const requiresApprovalForEmptyDescription = !descriptionToModerate;

      // Update moderation status server-side
      const serverModerationStatus = moderationResult.isBlocked 
        ? 'rejected' 
        : (moderationResult.requiresApproval || requiresApprovalForEmptyDescription ? 'pending' : 'approved');

      await mediaRef.update({
        moderationStatus: serverModerationStatus,
        requiresApproval: moderationResult.requiresApproval || requiresApprovalForEmptyDescription,
        moderationReason: requiresApprovalForEmptyDescription 
          ? 'Media uploaded without description - requires manual review'
          : (moderationResult.reason || 'Server-side moderation'),
        moderationDetectedIssues: [
          ...(moderationResult.detectedIssues || []),
          ...(requiresApprovalForEmptyDescription ? ['No description provided'] : [])
        ],
        moderatedAt: FieldValue.serverTimestamp(),
        moderatedBy: 'system',
        serverModerated: true, // Flag to indicate server moderation
        mediaChecks // Store basic media validation results
      });

      console.log(`✅ [ServerModeration] Media ${mediaId} moderated: ${serverModerationStatus}`);
    } catch (error: any) {
      console.error('❌ [ServerModeration] Error moderating media:', error);
      // On error, set to pending for manual review (safer than auto-approve)
      try {
        const mediaRef = event.data?.ref;
        await mediaRef.update({
          moderationStatus: 'pending',
          moderationReason: 'Server moderation failed - requires manual review',
          serverModerated: true,
          moderationError: error.message
        });
      } catch (updateError) {
        console.error('❌ [ServerModeration] Failed to update media on error:', updateError);
      }
    }
  }
);
*/

/**
 * Analyze image/video content using Gemini Vision API
 * Detects inappropriate content in actual media files
 */
async function analyzeMediaContent(
  mediaUrl: string,
  mediaType: 'image' | 'video',
  apiKey: string
): Promise<{
  requiresApproval: boolean;
  isBlocked: boolean;
  detectedIssues: string[];
  reason?: string;
}> {
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Use Gemini 1.5 Pro or Flash for vision capabilities
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash' // Supports image analysis
    });

    // Download image from Firebase Storage URL
    const { getStorage } = await import('firebase-admin/storage');
    const storage = getStorage();
    const bucket = storage.bucket();
    
    // Extract file path from URL
    let filePath = '';
    try {
      // Firebase Storage URL format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media
      const urlMatch = mediaUrl.match(/\/o\/([^?]+)/);
      if (urlMatch) {
        filePath = decodeURIComponent(urlMatch[1]);
      } else {
        // Try direct path
        filePath = mediaUrl.split('/').pop() || '';
      }
    } catch (e) {
      console.warn('⚠️ [ServerModeration] Could not extract file path from URL:', mediaUrl);
    }

    let imageData: Buffer | null = null;
    if (filePath) {
      try {
        const file = bucket.file(filePath);
        const [exists] = await file.exists();
        if (exists) {
          const [buffer] = await file.download();
          imageData = buffer;
        }
      } catch (downloadError) {
        console.warn('⚠️ [ServerModeration] Could not download file from Storage:', downloadError);
      }
    }

    // If we couldn't download, try fetching from URL directly
    if (!imageData && mediaUrl) {
      try {
        const response = await fetch(mediaUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          imageData = Buffer.from(arrayBuffer);
        }
      } catch (fetchError) {
        console.warn('⚠️ [ServerModeration] Could not fetch image from URL:', fetchError);
      }
    }

    if (!imageData) {
      // If we can't analyze the image, require approval
      return {
        requiresApproval: true,
        isBlocked: false,
        detectedIssues: ['Unable to download image for analysis'],
        reason: 'Image could not be analyzed automatically - requires manual review'
      };
    }

    // Convert to base64 for Gemini
    const base64Image = imageData.toString('base64');
    const mimeType = mediaType === 'image' ? 'image/jpeg' : 'image/jpeg'; // Default, could detect actual type

    const prompt = `Analyze this ${mediaType} and determine if it contains:
1. Sexual or explicit content
2. Violence or graphic content
3. Hate speech symbols or imagery
4. Self-harm imagery
5. Inappropriate content for a family-friendly fitness community

Return ONLY valid JSON:
{
  "sexualContent": true/false,
  "violence": true/false,
  "hateSpeech": true/false,
  "selfHarm": true/false,
  "inappropriate": true/false,
  "confidence": 0.0-1.0,
  "explanation": "brief description of what you see"
}`;

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500,
      },
    });

    const response = result.response.text().trim();
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('No JSON found in image analysis response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      sexualContent?: boolean;
      violence?: boolean;
      hateSpeech?: boolean;
      selfHarm?: boolean;
      inappropriate?: boolean;
      confidence?: number;
      explanation?: string;
    };

    const hasViolation = 
      parsed.sexualContent === true ||
      parsed.violence === true ||
      parsed.hateSpeech === true ||
      parsed.selfHarm === true ||
      parsed.inappropriate === true;

    const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));
    const detectedIssues: string[] = [];
    
    if (parsed.sexualContent) detectedIssues.push('Sexual or explicit content detected in image');
    if (parsed.violence) detectedIssues.push('Violence or graphic content detected in image');
    if (parsed.hateSpeech) detectedIssues.push('Hate speech symbols/imagery detected in image');
    if (parsed.selfHarm) detectedIssues.push('Self-harm imagery detected in image');
    if (parsed.inappropriate) detectedIssues.push('Inappropriate content for community detected in image');

    return {
      requiresApproval: hasViolation || confidence < 0.7, // Low confidence requires review
      isBlocked: hasViolation && confidence > 0.7, // High confidence violations are blocked
      detectedIssues,
      reason: parsed.explanation || (hasViolation ? 'Inappropriate content detected in image' : undefined)
    };

  } catch (error: any) {
    console.error('❌ [ServerModeration] Image analysis error:', error);
    // On error, require approval for safety
    return {
      requiresApproval: true,
      isBlocked: false,
      detectedIssues: ['Image analysis failed'],
      reason: 'Unable to analyze image content - requires manual review'
    };
  }
}

// Notify when approval message is created
export const onApprovalMessageCreated = onDocumentCreated(
  {
    document: "approvalMessages/{messageId}",
    region: 'us-east1'
  },
  async (event) => {
  try {
    const messageData = event.data?.data();
    if (!messageData) return;

    const approvalId = messageData.approvalId;
    const senderRole = messageData.senderRole;
    const senderUserId = messageData.userId;

    // Get approval data
    const approvalDoc = await db.collection('accountApprovals').doc(approvalId).get();
    if (!approvalDoc.exists) return;

    const approvalData = approvalDoc.data()!;
    const targetUserId = senderRole === 'admin' 
      ? approvalData.userId  // Admin sent message, notify user
      : null; // User sent message, notify admins

    if (senderRole === 'admin') {
      // Admin asked question - notify user
      // Use doc() to capture notification ID directly (avoid race condition)
      const notificationRef = db.collection('notifications').doc();
      await notificationRef.set({
        userId: approvalData.userId,
        type: 'approval_question',
        title: 'Admin Question',
        message: 'An admin has a question about your account request. Please check your pending approval page.',
        createdAt: FieldValue.serverTimestamp(),
        read: false,
        metadata: {
          approvalId: approvalId,
          messageId: event.params.messageId
        }
      });
      const notificationId = notificationRef.id; // Capture ID directly

      // Reset user unread to ensure they see a badge
      await db.collection('accountApprovals').doc(approvalId).update({
        'unreadCount.user': FieldValue.increment(1),
        awaitingResponseFrom: 'user',
        lastMessageAt: FieldValue.serverTimestamp(),
      });

      // Queue SMS for admin questions (time-sensitive - user needs to respond, but use queue for consistency)
      try {
        const userDoc = await db.collection('users').doc(approvalData.userId).get();
        const userData = userDoc.data();
        if (userData?.phoneNumber) {
          const smsEnabled = userData?.notificationPreferences?.smsEnabled !== false; // Default to true
          
          if (smsEnabled) {
            // Queue SMS immediately (no delay for time-sensitive questions)
            const dispatchAt = new Date(); // Immediate dispatch
            await db.collection('sms_dispatch_queue').add({
              userId: approvalData.userId,
              phoneNumber: userData.phoneNumber,
              message: `MOMS FITNESS MOJO: An admin has a question about your account request. Please check your pending approval page to respond.`,
              notificationId: notificationId,
              type: 'approval_question',
              status: 'pending',
              createdAt: FieldValue.serverTimestamp(),
              dispatchAt: Timestamp.fromDate(dispatchAt),
            });
            console.log(`✅ SMS question notification queued for user: ${approvalData.userId}`);
          } else {
            console.log(`ℹ️ SMS notifications disabled for user ${approvalData.userId}, skipping SMS`);
          }
        } else {
          console.warn(`⚠️ No phone number found for user ${approvalData.userId} - cannot send SMS`);
        }
      } catch (smsError) {
        console.error('❌ Failed to queue SMS question notification:', smsError);
      }
    } else {
      // User responded - notify all admins with push + SMS fallback
      const adminsSnapshot = await db.collection('users')
        .where('role', '==', 'admin')
        .get();

      if (!adminsSnapshot.empty) {
        // Create in-app notifications for all admins
        const senderName = messageData.senderName || 
                          `${approvalData.firstName || ''} ${approvalData.lastName || ''}`.trim() || 
                          'User';
        
        const notifications = adminsSnapshot.docs.map(adminDoc => ({
          userId: adminDoc.id,
          type: 'approval_response',
          title: 'User Response',
          message: `${senderName} has responded to your question about their account request.`,
          createdAt: FieldValue.serverTimestamp(),
          read: false,
          metadata: {
            approvalId: approvalId,
            messageId: event.params.messageId,
            userId: approvalData.userId
          }
        }));

        const batch = db.batch();
        notifications.forEach(notif => {
          const notifRef = db.collection('notifications').doc();
          batch.set(notifRef, notif);
        });
        await batch.commit();
        
        // Send push notifications with SMS fallback for each admin
        const notificationPromises = adminsSnapshot.docs.map(async (adminDoc) => {
          const adminData = adminDoc.data();
          const adminId = adminDoc.id;
          
          await sendAdminNotificationWithFallback(
            adminId,
            adminData,
            'User Response',
            `${senderName} has responded to your question about their account request.`,
            `MOMS FITNESS MOJO: ${senderName} has responded to your question. Check admin console.`,
            {
              type: 'approval_response',
              approvalId: approvalId,
              messageId: event.params.messageId,
              userId: approvalData.userId,
            }
          );
        });
        
        await Promise.allSettled(notificationPromises);
        console.log(`✅ Notified ${adminsSnapshot.size} admins of user response (push + SMS fallback)`);
      }

      // Reset admin unread to ensure admin badge clears for this message
      await db.collection('accountApprovals').doc(approvalId).update({
        'unreadCount.admin': FieldValue.increment(1),
        awaitingResponseFrom: 'admin',
        lastMessageAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('Error in onApprovalMessageCreated:', error);
  }
});

// ───────────────── SCHEDULED FUNCTION: Check and Dispatch Delayed SMS ─────────────────

/**
 * Scheduled function that runs every 5 minutes
 * Checks sms_dispatch_queue for pending SMS that are ready to send
 * Only sends SMS if the associated notification has NOT been read (cost-saving)
 */
export const checkAndDispatchPendingSms = onSchedule({
  schedule: 'every 5 minutes',
  timeZone: 'America/New_York',
  region: 'us-east1'
}, async (event) => {
  try {
    console.log('⏰ Checking for pending SMS in dispatch queue...');
    
    const now = new Date();
    const nowTimestamp = Timestamp.fromDate(now);
    
    // Query for pending SMS that are ready to dispatch
    // Also check for "processing" status that's been stuck > 10 minutes (recovery)
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const tenMinutesAgoTimestamp = Timestamp.fromDate(tenMinutesAgo);
    
    const pendingSmsSnapshot = await db.collection('sms_dispatch_queue')
      .where('status', '==', 'pending')
      .where('dispatchAt', '<=', nowTimestamp)
      .get();
    
    // Also recover stuck "processing" items (in case a worker crashed)
    const stuckProcessingSnapshot = await db.collection('sms_dispatch_queue')
      .where('status', '==', 'processing')
      .where('processingStartedAt', '<=', tenMinutesAgoTimestamp)
      .get();
    
    // Combine both snapshots
    const allSmsDocs = [...pendingSmsSnapshot.docs, ...stuckProcessingSnapshot.docs];
    
    if (allSmsDocs.length === 0) {
      console.log('ℹ️ No pending SMS ready to dispatch');
      return;
    }
    
    console.log(`📱 Found ${pendingSmsSnapshot.size} pending and ${stuckProcessingSnapshot.size} stuck processing SMS ready to dispatch`);
    
    if (pendingSmsSnapshot.empty) {
      console.log('ℹ️ No pending SMS ready to dispatch');
      return;
    }
    
    let sentCount = 0;
    let skippedCount = 0;
    
    for (const smsDoc of allSmsDocs) {
      const smsData = smsDoc.data();
      const notificationId = smsData.notificationId;
      const currentStatus = smsData.status;
      
      try {
        const processingRef = smsDoc.ref;
        const processingDoc = await processingRef.get();
        const docStatus = processingDoc.data()?.status;
        
        // Handle stuck "processing" items - reset to pending and process in same iteration
        let shouldProcess = false;
        if (currentStatus === 'processing' && docStatus === 'processing') {
          console.log(`🔄 Recovering stuck processing SMS ${smsDoc.id}, resetting to pending`);
          await processingRef.update({
            status: 'pending',
            recoveryAttemptedAt: FieldValue.serverTimestamp(),
            previousStatus: 'processing'
          });
          // Re-fetch to verify update succeeded
          const updatedDoc = await processingRef.get();
          const updatedStatus = updatedDoc.data()?.status;
          if (updatedStatus === 'pending') {
            shouldProcess = true; // Successfully recovered, process it now
            console.log(`✅ SMS ${smsDoc.id} recovered to pending, will process now`);
          } else {
            console.log(`⏭️ SMS ${smsDoc.id} status changed during recovery (${updatedStatus}), skipping`);
            continue;
          }
        } else if (currentStatus === 'pending' && docStatus === 'pending') {
          // Normal pending item - process it
          shouldProcess = true;
        } else if (currentStatus === 'pending' && docStatus !== 'pending') {
          // Status changed between query and now - another worker claimed it
          console.log(`⏭️ SMS ${smsDoc.id} already processed by another worker (status: ${docStatus}), skipping`);
          continue;
        } else {
          // Not in a processable state
          console.log(`⏭️ SMS ${smsDoc.id} not in processable status (current: ${currentStatus}, doc: ${docStatus}), skipping`);
          continue;
        }
        
        // Only proceed if we should process this item
        if (!shouldProcess) {
          continue;
        }
        
        // Atomically mark as processing (use transaction to prevent race conditions)
        await processingRef.update({
          status: 'processing',
          processingStartedAt: FieldValue.serverTimestamp(),
          processingWorkerId: event.scheduleTime || 'unknown' // Use schedule time as worker ID
        });
        
        // Verify the update succeeded and status is actually processing
        const verifyDoc = await processingRef.get();
        if (verifyDoc.data()?.status !== 'processing') {
          console.log(`⏭️ SMS ${smsDoc.id} status changed during processing claim, skipping`);
          continue;
        }
        
        // Check if notification was read
        let shouldSkip = false;
        
        if (notificationId) {
          const notificationDoc = await db.collection('notifications').doc(notificationId).get();
          if (notificationDoc.exists) {
            const notificationData = notificationDoc.data();
            if (notificationData?.read === true) {
              // User already read the notification - skip SMS to save cost
              await processingRef.update({
                status: 'skipped_seen',
                skippedAt: FieldValue.serverTimestamp(),
                reason: 'Notification was read before SMS dispatch'
              });
              skippedCount++;
              console.log(`⏭️ Skipped SMS for ${smsData.userId} - notification already read`);
              shouldSkip = true;
            }
          }
        }
        
        if (!shouldSkip) {
          // Send SMS
          const result = await sendSMSViaTwilio(smsData.phoneNumber, smsData.message);
          
          if (result.success) {
            await processingRef.update({
              status: 'dispatched_sms',
              dispatchedAt: FieldValue.serverTimestamp(),
              twilioSid: result.sid
            });
            sentCount++;
            console.log(`✅ SMS dispatched to ${smsData.userId} (SID: ${result.sid})`);
          } else {
            await processingRef.update({
              status: 'failed',
              failedAt: FieldValue.serverTimestamp(),
              error: result.error
            });
            console.error(`❌ SMS dispatch failed for ${smsData.userId}:`, result.error);
          }
        }
      } catch (error: any) {
        console.error(`❌ Error processing SMS dispatch for ${smsData.userId}:`, error);
        // Reset to pending on error so it can be retried
        try {
          await smsDoc.ref.update({
            status: 'pending',
            error: error?.message || 'Unknown error',
            failedAt: FieldValue.serverTimestamp()
          });
        } catch (updateError) {
          console.error(`❌ Failed to reset SMS status on error:`, updateError);
        }
      }
    }
    
    console.log(`✅ SMS dispatch check complete: ${sentCount} sent, ${skippedCount} skipped (read), ${pendingSmsSnapshot.size - sentCount - skippedCount} failed`);
  } catch (error) {
    console.error('❌ Error in checkAndDispatchPendingSms:', error);
  }
});

// Grandfather existing users - set all to approved status
export const grandfatherExistingUsers = onCallWithCors({ region: 'us-east1' }, async (request) => {
  try {
    console.log('grandfatherExistingUsers: Starting...');
    
    // Ensure admin only
    if (!request.auth || !request.auth.uid) {
      console.log('grandfatherExistingUsers: No auth');
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    console.log('grandfatherExistingUsers: Checking admin status for user:', request.auth.uid);
    const adminDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
      console.log('grandfatherExistingUsers: Not admin', { exists: adminDoc.exists, role: adminDoc.data()?.role });
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    console.log('grandfatherExistingUsers: Admin verified, fetching users...');
    // Get all users without status field or with status null
    // Process in batches to avoid timeout
    let updated = 0;
    let batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500;
    const QUERY_BATCH_SIZE = 1000; // Fetch users in batches
    let lastDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    let hasMore = true;

    while (hasMore) {
      let query = db.collection('users').limit(QUERY_BATCH_SIZE);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
      
      const usersSnapshot = await query.get();
      console.log(`grandfatherExistingUsers: Fetched ${usersSnapshot.docs.length} users in this batch`);
      
      if (usersSnapshot.empty) {
        hasMore = false;
        break;
      }

      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        
        // Only update if status is missing or null
        if (!userData.status || userData.status === null || userData.status === undefined) {
          batch.update(userDoc.ref, {
            status: 'approved',
            updatedAt: FieldValue.serverTimestamp()
          });
          updated++;
          batchCount++;

          // Commit batch every 500 updates and create new batch
          if (batchCount >= BATCH_SIZE) {
            console.log(`grandfatherExistingUsers: Committing batch of ${batchCount} updates (total: ${updated})`);
            await batch.commit();
            batch = db.batch(); // Create new batch for next set of updates
            batchCount = 0;
          }
        }
      }

      // Check if we have more users to process
      if (usersSnapshot.docs.length < QUERY_BATCH_SIZE) {
        hasMore = false;
      } else {
        lastDoc = usersSnapshot.docs[usersSnapshot.docs.length - 1];
      }
    }

    // Commit remaining updates
    if (batchCount > 0) {
      console.log(`grandfatherExistingUsers: Committing final batch of ${batchCount} updates`);
      await batch.commit();
    }

    console.log(`grandfatherExistingUsers: Complete! Updated ${updated} users`);
    return {
      success: true,
      updatedCount: updated,
      message: `Updated ${updated} users to approved status`
    };
  } catch (error: any) {
    console.error('Error in grandfatherExistingUsers:', error);
    console.error('Error stack:', error.stack);
    console.error('Error code:', error.code);
    console.error('Error details:', error.details);
    
    // Return more specific error if possible
    if (error instanceof HttpsError) {
      throw error;
    }
    
    throw new HttpsError('internal', error.message || 'Failed to grandfather users');
  }
});

export { chatAsk, synthesizeSpeech, transcribeAudio } from './assistant';
export {
  removeKnowledgeChunksOnDelete, syncChallengeToKnowledgeBase, syncEventToKnowledgeBase, syncPostToKnowledgeBase
} from './knowledgeBase';

export { moderateContent } from './contentModeration';
export {
  onMediaCommentCreatedModeration, onMediaCreatedModeration,
  onPostCommentCreatedModeration, onPostCreatedModeration, onTestimonialCreatedModeration
} from './contentModerationTriggers';

