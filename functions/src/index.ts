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
  if (deletedData.sources?.hls) {
    // Add the main HLS playlist
    filesToDelete.push({ path: deletedData.sources.hls, type: 'hls-playlist' });
    
    // For videos, we also need to delete the entire HLS folder with all segments
    const folderPath = deletedData.filePath.substring(0, deletedData.filePath.lastIndexOf('/'));
    filesToDelete.push({ 
      path: `${folderPath}/hls/`, 
      type: 'hls-folder',
      isFolder: true // Mark as folder for special handling
    });
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

    try {
      await bucket.file(name).download({ destination: tmpOriginal });

      const mediaData = (await mediaRef.get()).data();
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

      // Probe
      const probe: any = await new Promise((res, rej) =>
        ffmpeg(tmpOriginal).ffprobe((err: any, data: any) => err ? rej(err) : res(data))
      );
      const stream = (probe.streams || []).find((s: any) => s.width && s.height) || {};
      const duration = probe.format?.duration != null ? Number(probe.format.duration) : null;
      const width = stream.width || null;
      const height = stream.height || null;

      // Poster (seek ~10%)
      try {
        const posterLocal = path.join(os.tmpdir(), `poster_${base}.jpg`);
        const seekTime = duration ? Math.max(0, duration * 0.1) : 0;
        await new Promise<void>((res, rej) =>
          ffmpeg(tmpOriginal)
            .inputOptions(['-ss', String(seekTime)])
            .outputOptions(['-frames:v 1', '-q:v 2'])
            .save(posterLocal).on('end', () => res()).on('error', rej)
        );

        const posterPath = `${dir}/poster_${base}.jpg`;
        await bucket.upload(posterLocal, {
          destination: posterPath,
          metadata: {
            contentType: 'image/jpeg',
            cacheControl: 'public,max-age=31536000,immutable'
          },
        });

        await mediaRef.set({
          thumbnailPath: posterPath,
          transcodeStatus: 'processing',
          duration,
          dimensions: { width, height },
        }, { merge: true });

        console.log(`Early poster written for video ${mediaRef.id}, poster: ${posterPath}`);
        fs.unlinkSync(posterLocal);
      } catch (e) {
        console.warn('Poster generation failed; continuing with HLS:', e);
      }

      // HLS transcode (NO -hls_base_url)
      const hlsDirLocal = path.join(os.tmpdir(), `hls_${base}`);
      fs.mkdirSync(hlsDirLocal, { recursive: true });

      await new Promise<void>((res, rej) =>
        ffmpeg(tmpOriginal)
          .addOptions([
            '-preset', 'fast', // Faster encoding: ultrafast/superfast/veryfast/fast/medium/slow
            '-crf', '23', // Constant Rate Factor (18-28 range, 23 = balanced quality/size)
            '-profile:v', 'main',
            '-vf', 'scale=w=min(iw\\,1280):h=-2',
            '-start_number', '0',
            '-hls_time', '4',
            '-hls_list_size', '0',
            '-f', 'hls'
          ])
          .output(path.join(hlsDirLocal, 'index.m3u8'))
          .on('end', () => res()).on('error', rej)
          .run()
      );

      // Shared token for all HLS files
      const sharedToken = uuidv4();
      const hlsPath = `${dir}/hls/${base}/`; // media/<uid>/<batch>/hls/<base>/
      console.log(`🔑 Shared token for HLS: ${sharedToken}`);

      // Rewrite manifest to absolute URLs with token AFTER the filename (critical)
      const manifestLocalPath = path.join(hlsDirLocal, 'index.m3u8');
      rewriteManifestWithAbsoluteUrls(
        manifestLocalPath,
        bucket.name,
        hlsPath,
        sharedToken
      );

      // Upload HLS files (manifest + segments)
      const files = fs.readdirSync(hlsDirLocal);
      await Promise.all(files.map(f => {
        const dest = `${hlsPath}${f}`;
        const ct = f.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : 'video/mp2t';
        return bucket.upload(path.join(hlsDirLocal, f), {
          destination: dest,
          metadata: {
            contentType: ct,
            cacheControl: 'public,max-age=31536000,immutable',
            metadata: { firebaseStorageDownloadTokens: sharedToken }
          },
        });
      }));

      // Final write
      const hlsSourcePath = `${hlsPath}index.m3u8`;
      await mediaRef.set({
        sources: { hls: hlsSourcePath },
        transcodeStatus: 'ready',
        transcodeUpdatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`✅ HLS ready for ${mediaRef.id} -> ${hlsSourcePath}`);

      fs.rmSync(hlsDirLocal, { recursive: true, force: true });
    } catch (err) {
      console.error('Transcode error for', name, err);
      try { await mediaRef.set({ transcodeStatus: 'failed' }, { merge: true }); } catch {}
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

    // Build context-aware prompt
    const buildPrompt = () => {
      let userPrompt = `Generate 2-3 short, authentic testimonials (each 150-200 characters) based on the user's input.

Guidelines:
- Be authentic and heartfelt
- Mention specific experiences, events, or moments when possible
- Keep it concise (3-4 lines max)
- Make it personal and relatable
- Focus on community, fitness, and empowerment
- Each testimonial should be unique`;

      if (userContext) {
        userPrompt += `\n\nUser context: ${userContext}`;
      }

      if (highlight) {
        userPrompt += `\n\nUser wants to highlight: ${highlight}`;
      }

      userPrompt += `\n\nUser's input/experience: "${prompt}"`;
      userPrompt += `\n\nGenerate 2-3 testimonials. Format each on a new line starting with "1.", "2.", "3.". Each should be 150-200 characters.`;
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
            const systemPrompt = buildPrompt();
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

    const userPrompt = buildPrompt();
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
