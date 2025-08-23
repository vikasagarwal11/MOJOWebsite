// functions/src/index.ts
import { setGlobalOptions } from "firebase-functions/v2";
import { onDocumentWritten, onDocumentDeleted, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
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

// Init
initializeApp();
const db = getFirestore();

// Helper functions for robust media processing
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function findMediaDocRef(name: string, dir: string, tries = 5): Promise<FirebaseFirestore.DocumentReference | null> {
  console.log(`🔍 Searching for media doc:`, { name, dir });
  
  for (let i = 0; i < tries; i++) {
    console.log(`🔍 Attempt ${i + 1}/${tries}:`);
    
    // First try: exact filePath match
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

    // Second try: storageFolder match (ensure trailing slash)
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

    // Debug: show what documents exist in this collection
    if (i === 0) {
      const allDocs = await db.collection('media').limit(10).get();
      console.log(`🔍 Available media docs:`, allDocs.docs.map(d => ({
        id: d.id,
        filePath: d.data()?.filePath,
        storageFolder: d.data()?.storageFolder,
        transcodeStatus: d.data()?.transcodeStatus
      })));
    }

    await sleep(500 * Math.pow(2, i)); // 0.5s, 1s, 2s, 4s, 8s
  }
  
  console.log(`❌ Failed to find media doc after ${tries} attempts`);
  return null;
}

// Setup FFmpeg paths
ffmpeg.setFfmpegPath(ffmpegStatic as string);
ffmpeg.setFfprobePath(ffprobe.path);

// Gen 2 defaults
setGlobalOptions({
  region: "us-central1",
  memory: "256MiB",
  cpu: 1,
  maxInstances: 10,
});

// ---------------- MEDIA counters ----------------
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
  
  if (delta === 0) {
    console.log('🔍 No change detected, skipping update');
    return;
  }
  
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
    delta,
    beforeData: event.data?.before.exists ? event.data.before.data() : null,
    afterData: event.data?.after.exists ? event.data.after.data() : null
  });
  
  if (delta === 0) {
    console.log('🔍 No change detected, skipping update');
    return;
  }
  
  try {
    await db.doc(`media/${event.params.mediaId}`)
      .update({ commentsCount: FieldValue.increment(delta) });
    console.log('✅ Comment count updated successfully:', { mediaId: event.params.mediaId, delta });
  } catch (error) {
    console.error('❌ Failed to update comment count:', error);
  }
});

// ---------------- POSTS counters ----------------
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

// ---------------- EVENTS: RSVP counter ----------------
// Include this if your app tracks `attendingCount` on events for RSVPs with "going" status
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

// ---------------- EVENTS: teaser sync ----------------
// Include this if your app uses `event_teasers` for public previews of non-public, non-past events
export const onEventTeaserSync = onDocumentWritten("events/{eventId}", async (event) => {
  const teaserRef = db.doc(`event_teasers/${event.params.eventId}`);
  // Deleted event → delete teaser
  if (!event.data?.after.exists) {
    await teaserRef.delete().catch(() => {});
    return;
  }
  const data = event.data.after.data()!;
  const isPublic = !!data.public;
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

// ---------------- EVENTS: RSVP notifications ----------------
// Enhanced RSVP notification with push notifications (FCM)
export const notifyRsvp = onDocumentWritten("events/{eventId}/rsvps/{userId}", async (event) => {
  const beforeData = event.data?.before.exists ? event.data?.before.data() : null;
  const afterData = event.data?.after.exists ? event.data?.after.data() : null;
  
  // Only notify for "going" status changes
  const wasGoing = beforeData?.status === "going";
  const isGoing = afterData?.status === "going";
  
  // Skip if status didn't change to "going"
  if (!isGoing || wasGoing) return;
  
  try {
    const eventId = event.params.eventId;
    const userId = event.params.userId;
    
    // Get event details
    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) return;
    
    const eventData = eventDoc.data()!;
    const eventCreatorId = eventData.createdBy;
    
    // Don't notify if user is RSVPing to their own event
    if (eventCreatorId === userId) return;
    
    // Get user details for personalized message
    const userDoc = await db.collection('users').doc(userId).get();
    let userName = 'Member';
    if (userDoc.exists) {
      const userData = userDoc.data()!;
      userName = userData.displayName || userData.firstName || userData.lastName || 'Member';
    }
    
    // Create Firestore notification
    await db.collection('notifications').add({
      userId: eventCreatorId,
      message: `${userName} is going to ${eventData.title}!`,
      createdAt: FieldValue.serverTimestamp(),
      eventId: eventId,
      read: false,
      type: 'rsvp',
      rsvpUserId: userId,
      rsvpStatus: 'going'
    });
    
    // Send push notification if FCM token exists
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
            body: `${userName} is going to ${eventData.title}!`,
          },
          data: { 
            eventId,
            type: 'rsvp',
            userId: userId
          },
        });
        
        console.log(`Push notification sent to ${eventCreatorId} for event ${eventId}`);
      }
    } catch (fcmError) {
      console.warn('FCM notification failed, but Firestore notification was created:', fcmError);
    }
    
    console.log(`Notification created for event ${eventId}: ${userName} is going`);
  } catch (error) {
    console.error('Error creating RSVP notification:', error);
  }
});

// Legacy function name for backward compatibility
export const onRsvpNotification = notifyRsvp;

// ---------------- MEDIA: Like/Comment Counters ----------------
// REMOVED: Duplicate onMediaLikeCreated/Deleted and onMediaCommentCreated/Deleted
// These were causing double-counting. Using onLikeWrite and onCommentWrite instead.

// ---------------- MEDIA: Storage Cleanup ----------------
export const onMediaDeletedCleanup = onDocumentDeleted("media/{mediaId}", async (event) => {
  const data = event.data?.data() as any;
  if (!data) return;
  
  const storage = getStorage().bucket();

  // Prefer `storageFolder` saved on the doc during upload
  const folder = data.storageFolder as string | undefined;
  if (!folder) {
    console.log(`No storageFolder found for media ${event.params.mediaId}, skipping cleanup`);
    return;
  }

  try {
    const [files] = await storage.getFiles({ prefix: folder });
    if (files.length > 0) {
      await Promise.all(files.map(f => f.delete().catch(() => {})));
      console.log(`Cleaned up ${files.length} files from folder: ${folder}`);
    } else {
      console.log(`No files found in folder: ${folder}`);
    }
  } catch (error) {
    console.error(`Failed to cleanup storage for media ${event.params.mediaId}:`, error);
  }
});

// ---------------- MEDIA: FFmpeg Processing (Enhanced with Early Poster Generation) ----------------
export const onMediaFileFinalize = onObjectFinalized(
  {
    bucket: 'mojomediafiles', // Explicitly listen to your custom bucket
    region: 'us-east1', // Match your bucket's region
    timeoutSeconds: 540,
    memory: '2GiB',
    cpu: 2, // Added CPU for faster FFmpeg processing
    concurrency: 1, // ensure one ffmpeg per instance to prevent resource thrashing
  },
  async (event) => {
    console.log('🎬 onMediaFileFinalize triggered for:', event.data.name);
    console.log('Bucket:', event.data.bucket);
    console.log('Content type:', event.data.contentType);
    console.log('Size:', event.data.size);
    const name = event.data.name || '';
    const ctype = event.data.contentType || '';
    
    // Only process user uploads under media/, skip our own outputs
    if (!name.startsWith('media/') || name.endsWith('.m3u8') || name.endsWith('.ts') || name.includes('/hls/')) return;
    if (path.basename(name).startsWith('thumb_') || path.basename(name).startsWith('poster_')) return;

    // A) Handle odd contentType values (e.g., application/octet-stream) with file extension fallback
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

    const bucket = getStorage().bucket(event.data.bucket);
    const dir = path.dirname(name);               // media/<uid>/<batchId>
    const base = path.parse(name).name;           // filename (no ext)

    // 1) Wait for the doc (handles upload→finalize→doc creation race)
    console.log(`🔍 Looking for media document for file: ${name}`);
    console.log(`Directory: ${dir}`);
    
    const mediaRef = await findMediaDocRef(name, dir, 5);
    if (!mediaRef) {
      console.error(`❌ CRITICAL: No media doc found for ${name} after retries!`);
      console.error(`This means the upload succeeded but the Firestore document creation failed.`);
      console.error(`Check the upload logs and ensure the media document is created with correct filePath/storageFolder.`);
      
      // Let's also check what documents exist in the media collection
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

    // 2) Unique temp filename to avoid rare collisions
    const tmpOriginal = path.join(
      os.tmpdir(),
      `${base}-${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(name)}`
    );

    try {
      // 3) Download inside try block
      await bucket.file(name).download({ destination: tmpOriginal });

      // Get media data for processing
      const mediaData = (await mediaRef.get()).data();
      
      console.log(`Processing media file: ${name}`);
      console.log(`Found media doc: ${mediaRef.id}, current status: ${mediaData?.transcodeStatus || 'none'}`);
      console.log(`Media type: ${mediaData?.type}, uploaded by: ${mediaData?.uploadedBy}`);
      // Images → make a WebP thumbnail and capture dimensions
      if (looksLikeImage) {
        const meta = await sharp(tmpOriginal).metadata();
        const thumbLocal = path.join(os.tmpdir(), `thumb_${base}.webp`);
        await sharp(tmpOriginal)
          .resize({ width: 1280, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(thumbLocal);

        const thumbPath = `${dir}/thumb_${base}.webp`;
        await bucket.upload(thumbLocal, {
          destination: thumbPath,
          metadata: { 
            contentType: 'image/webp',
            cacheControl: 'public,max-age=31536000,immutable' // OPTIMIZATION: 1 year cache for CDN
          },
        });

        await mediaRef.set({
          thumbnailPath: thumbPath,
          transcodeStatus: 'ready',
          dimensions: { width: meta.width ?? null, height: meta.height ?? null },
        }, { merge: true });
        
        console.log(`Image processing complete for ${mediaRef.id}, thumbnail: ${thumbPath}`);
        console.log(`Image dimensions: ${meta.width}x${meta.height}`);

        fs.unlinkSync(thumbLocal);
      }
      // Videos → poster + HLS + duration/dimensions
      else if (looksLikeVideo) {
        await mediaRef.set({ transcodeStatus: 'processing' }, { merge: true });

        // Probe with type safety
        const probe: any = await new Promise((res, rej) =>
          ffmpeg(tmpOriginal).ffprobe((err: any, data: any) => err ? rej(err) : res(data))
        );
        const stream = (probe.streams || []).find((s: any) => s.width && s.height) || {};
        
        // Duration type safety - ensure it's always a number or null
        const rawDuration = probe.format?.duration;
        const duration = rawDuration != null ? Number(rawDuration) : null;
        const width = stream.width || null;
        const height = stream.height || null;

        // 1) Generate POSTER with continue-on-fail logic
        // OPTIMIZATION: Seek to 10% instead of first frame (often black) for better poster quality
        let posterPath: string | null = null;
        try {
          const posterLocal = path.join(os.tmpdir(), `poster_${base}.jpg`);
          const seekTime = duration ? Math.max(0, duration * 0.1) : 0; // 10% of duration, min 0
          await new Promise<void>((res, rej) =>
            ffmpeg(tmpOriginal)
              .inputOptions(['-ss', String(seekTime)]) // Seek to 10% mark
              .frames(1)
              .outputOptions(['-q:v 2'])
              .save(posterLocal).on('end', () => res()).on('error', rej)
          );
          
          posterPath = `${dir}/poster_${base}.jpg`;
          await bucket.upload(posterLocal, {
            destination: posterPath,
            metadata: { 
              contentType: 'image/jpeg',
              cacheControl: 'public,max-age=31536000,immutable' // OPTIMIZATION: 1 year cache for CDN
            },
          });

          // EARLY WRITE so the card shows a poster image while HLS is still running
          await mediaRef.set({
            thumbnailPath: posterPath,
            transcodeStatus: 'processing',
            duration,
            dimensions: { width, height },
          }, { merge: true });
          
          console.log(`Early poster written for video ${mediaRef.id}, poster: ${posterPath}`);
          console.log(`Video dimensions: ${width}x${height}, duration: ${duration}s`);

          // Cleanup poster temp file
          fs.unlinkSync(posterLocal);
        } catch (e) {
          console.warn('Poster generation failed; continuing with HLS:', e);
          // Continue without poster - video will still get HLS streaming
        }

        // 2) HLS transcode (this may take longer; UI already has poster)
        const hlsDirLocal = path.join(os.tmpdir(), `hls_${base}`);
        fs.mkdirSync(hlsDirLocal, { recursive: true });
        await new Promise<void>((res, rej) =>
          ffmpeg(tmpOriginal)
            .addOptions([
              '-profile:v', 'main',
              '-vf', 'scale=w=min(iw\\,1280):h=-2',     // OPTIMIZATION: no upscaling, keep aspect
              '-start_number', '0',
              '-hls_time', '4',
              '-hls_list_size', '0',
              '-f', 'hls'
            ])
            .output(path.join(hlsDirLocal, 'index.m3u8'))
            .on('end', () => res()).on('error', rej)
            .run()
        );

        // Upload HLS files
        const hlsPath = `${dir}/hls/${base}/`;
        const files = fs.readdirSync(hlsDirLocal);
        await Promise.all(files.map(f => {
          const dest = `${hlsPath}${f}`;
          const ct = f.endsWith('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : 'video/mp2t'; // OPTIMIZATION: lowercase MIME type (standard compliance)
          return bucket.upload(path.join(hlsDirLocal, f), {
            destination: dest,
            metadata: { 
              contentType: ct,
              cacheControl: 'public,max-age=31536000,immutable' // OPTIMIZATION: 1 year cache for CDN
            },
          });
        }));

        // Final write: mark ready and add HLS source
        const hlsSourcePath = `${hlsPath}index.m3u8`;
        console.log(`🎬 Setting video as ready with HLS source:`, {
          mediaId: mediaRef.id,
          hlsPath: hlsPath,
          hlsSourcePath: hlsSourcePath,
          fullHlsUrl: `gs://${bucket.name}/${hlsSourcePath}`
        });
        
        await mediaRef.set({
          sources: { hls: hlsSourcePath },
          transcodeStatus: 'ready',
        }, { merge: true });
        
        console.log(`✅ HLS processing complete for video ${mediaRef.id}, HLS path: ${hlsSourcePath}`);

        // cleanup tmp
        fs.rmSync(hlsDirLocal, { recursive: true, force: true });
        // posterLocal cleanup is now handled inside the poster generation try-catch
      }
    } catch (err) {
      await mediaRef.set({ transcodeStatus: 'failed' }, { merge: true }).catch(() => {});
      console.error('Transcode error for', name, err);
    } finally {
      // 4) Guarded cleanup to prevent errors
      try { 
        if (fs.existsSync(tmpOriginal)) fs.unlinkSync(tmpOriginal); 
      } catch {}
    }
  }
);

// ---------------- MANUAL FIX: Reset Stuck Processing Videos ----------------
export const resetStuckProcessing = onDocumentCreated("manual_fixes/{fixId}", async (event) => {
  const data = event.data?.data();
  if (!data || data.type !== 'reset_stuck_processing') return;
  
  console.log('🔄 Manual fix triggered: resetting stuck processing videos');
  
  try {
    // Update document status to processing
    await event.data?.ref.set({ status: 'processing' }, { merge: true });
    
    // Find all media documents stuck in processing
    const stuckMedia = await db.collection('media')
      .where('transcodeStatus', '==', 'processing')
      .where('type', '==', 'video')
      .get();
    
    console.log(`Found ${stuckMedia.docs.length} stuck processing videos`);
    
    // Reset them to 'ready' if they have HLS sources, or 'failed' if not
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
    
    // Update document status to completed
    await event.data?.ref.set({ 
      status: 'completed', 
      processedCount: stuckMedia.docs.length,
      completedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
  } catch (error) {
    console.error('❌ Failed to reset stuck processing videos:', error);
    
    // Update document status to failed
    await event.data?.ref.set({ 
      status: 'failed', 
      error: error instanceof Error ? error.message : 'Unknown error',
      failedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
});