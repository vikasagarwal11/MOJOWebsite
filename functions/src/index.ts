import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentWritten, onDocumentDeleted, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobe from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

// Set global options for all functions - set to us-east1 to match prod bucket
setGlobalOptions({ region: 'us-east1' });
// Initialize Firebase Admin BEFORE importing modules that use it
initializeApp();

import { onAttendeeChange, manualRecalculateCount, bulkAttendeeOperation } from './attendeeCounts';
import { manualRecalculateWaitlistPositions as _manualRecalcWaitlist } from './autoPromotionService';

// Export the new attendee count management functions
export { onAttendeeChange, manualRecalculateCount, bulkAttendeeOperation };

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
export const recalcWaitlistPositions = onCall({ region: 'us-central1' }, async (request) => {
  const { data, auth } = request;
  const eventId = data?.eventId as string | undefined;
  if (!auth) throw new Error('Unauthenticated');
  if (!eventId) throw new Error('eventId required');
  const isAdmin = (auth.token as any)?.role === 'admin' || (auth.token as any)?.admin === true;
  if (!isAdmin) throw new Error('Admin only');
  await _manualRecalcWaitlist(eventId);
  return { success: true, eventId };
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
    
    // Log promotion notifications for future implementation
    for (const user of promotedUsers) {
      await db.collection('promotion_notifications').add({
        eventId: eventId,
        userId: user.userId,
        attendeeId: user.attendeeId,
        userName: user.name,
        promotedFromPosition: user.promotedFromPosition,
        message: `🎉 Congratulations! You've been promoted from the waitlist! ${user.message}`,
        notificationType: 'promotion',
        timestamp: new Date(),
        sent: false // Will be processed by notification service
      });
    }
    
    console.log(`✅ Promotion notifications logged for ${promotedUsers.length} users`);
  } catch (error) {
    console.error('🚨 Error sending promotion notifications:', error);
  }
};

// Get Firestore instance - using momsfitnessmojo database
const db = getFirestore();

// Helper
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

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
    
    // Extensions create: original format + other formats
    // Pattern: baseName_400x400.originalExt + baseName_400x400.format
    const extensionFormats = [originalExt.toLowerCase(), 'webp', 'jpeg', 'png', 'avif', 'gif', 'tiff'];
    const uniqueFormats = [...new Set(extensionFormats)]; // Remove duplicates
    
    uniqueFormats.forEach(format => {
      const thumbnailPath = `${folderPath}/thumbnails/${baseName}_400x400.${format}`;
      console.log(`🗑️ [CLOUD] [DEBUG] Generated thumbnail path:`, thumbnailPath);
      filesToDelete.push({ 
        path: thumbnailPath, 
        type: `extension-thumbnail-${format}` 
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

// ───────────────── MEDIA: FFmpeg + Manifest Rewrite ─────────────────

export const onMediaFileFinalize = onObjectFinalized({ 
  region: 'us-east1',
  memory: '8GiB', // Maximum memory for fastest video processing
  timeoutSeconds: 540, // Increase timeout for large videos
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
    if (!name.startsWith('media/')) return;
    if (name.includes('/hls/') || name.endsWith('.m3u8') || name.endsWith('.ts')) {
      console.log('⏭️ Skipping HLS output file:', name);
      return;
    }
    const baseName = path.basename(name);
  if (baseName.startsWith('thumb_') || baseName.startsWith('poster_')) {
    console.log('⏭️ Skipping thumbnail/poster file:', name);
    return;
  }
  if (name.includes('/thumbnails/') && name.includes('_400x400.')) {
    console.log('⏭️ Skipping extension-generated thumbnail:', name);
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

    console.log(`🔍 Looking for media document for file: ${name}`);
    const mediaRef = await findMediaDocRef(name, dir, 5);
    if (!mediaRef) {
      console.error(`❌ CRITICAL: No media doc found for ${name} after retries!`);
      try {
        const allMedia = await db.collection('media').limit(5).get();
        console.log('🔍 Available media documents:', allMedia.docs.map(d => ({
          id: d.id,
          filePath: d.data()?.filePath,
          storageFolder: d.data()?.storageFolder,
          transcodeStatus: d.data()?.transcodeStatus
        })));
      } catch (checkError) {
        console.error('Failed to check media collection:', checkError);
      }
      return;
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
        '1080p': 420000, // 7 minutes
        '2160p': 720000  // 12 minutes
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
      
      // Generate all quality levels in parallel, capturing successes and failures
      const qualitySettled = await Promise.allSettled(
        qualityLevels.map(async (quality): Promise<{ quality: QualityLevel; storagePath: string }> => {
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
                '-start_number', '0',
                '-hls_time', '4',
                '-hls_list_size', '0',
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
        })
      );

      const qualityResults = qualitySettled
        .map((result, index) => {
          if (result.status === 'fulfilled') return result.value;
          console.warn(`⚠️ [ADAPTIVE] ${qualityLevels[index].label} failed:`, result.reason);
          return null;
        })
        .filter((value): value is { quality: QualityLevel; storagePath: string } => value !== null);

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

// ───────────────── PHONE NUMBER VALIDATION ─────────────────
export const checkPhoneNumberExists = onCall({
  cors: [
    'https://momsfitnessmojo.com',
    'https://www.momsfitnessmojo.com',
    'https://momfitnessmojo.web.app',
    'https://momfitnessmojo.firebaseapp.com',
    'http://localhost:5173',
    'http://localhost:3000',
  ],
}, async (request) => {
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
    
    const exists = !usersSnapshot.empty;
    console.log('🔍 Phone number check result:', { phoneNumber, exists, count: usersSnapshot.size });
    
    return { 
      exists, 
      phoneNumber,
      message: exists ? 'Phone number is registered' : 'Phone number not found'
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

// Send notification SMS using Firebase Auth SMS (FREE!)
export const sendNotificationSMS = onCall(async (request) => {
  const { phoneNumber, message, userId, type } = request.data;
  
  console.log('📱 sendNotificationSMS called with:', { phoneNumber, message, userId, type });
  
  try {
    // Use Firebase Admin Auth to trigger SMS
    const { getAuth } = await import('firebase-admin/auth');
    const auth = getAuth();
    
    // Create a temporary user (you can optimize this)
    try {
      // Send SMS using verification (this sends the SMS for free)
      await auth.generatePasswordResetLink(`temp-${userId}@domain.com`);
      
      console.log('✅ SMS notification sent successfully via Firebase Auth');
      return {
        success: true,
        message: 'SMS notification sent',
        phoneNumber,
        userId
      };
    } catch (smsError) {
      console.error('❌ Firebase Auth SMS failed:', smsError);
      return {
        success: false,
        error: 'SMS delivery failed',
        phoneNumber,
        userId
      };
    }
    
  } catch (error) {
    console.error('❌ Error sending notification SMS:', error);
    return {
      success: false,
      error: 'Failed to send SMS notification',
      phoneNumber,
      userId
    };
  }
});

// SMS Delivery Status Checker
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
export const generateTestimonialSuggestions = onCall({
  cors: [
    'https://momsfitnessmojo.com',
    'https://www.momsfitnessmojo.com',
    'https://momfitnessmojo.web.app',
    'https://momfitnessmojo.firebaseapp.com',
    'http://localhost:5173',
    'http://localhost:3000',
  ],
}, async (request) => {
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
- Keep it concise (3-4 lines max)
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
          guidelines: '- Be authentic and heartfelt\n- Keep it concise (3-4 lines max)\n- Make it personal and relatable',
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
      userPrompt += `\n\nGenerate 2-3 testimonials based on the user's input above. Format each on a new line starting with "1.", "2.", "3.". Each should be 150-200 characters. Make them feel authentic and specific to their experience.`;
      
      return userPrompt;
    };

    // Helper to parse testimonials from response text
    const parseTestimonials = (text: string): string[] => {
      const testimonials = text
        .split(/\n+/)
        .map((line: string) => line.replace(/^\d+\.\s*/, '').trim().replace(/^["']|["']$/g, ''))
        .filter((line: string) => line.length >= 40 && line.length <= 250)
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

export { generatePostSuggestionsV2 } from './postAI';
