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
  if (delta === 0) return;
  await db.doc(`media/${event.params.mediaId}`)
    .update({ likesCount: FieldValue.increment(delta) });
});

export const onCommentWrite = onDocumentWritten("media/{mediaId}/comments/{commentId}", async (event) => {
  const beforeExists = event.data?.before.exists || false;
  const afterExists = event.data?.after.exists || false;
  const delta = afterExists && !beforeExists ? 1 : !afterExists && beforeExists ? -1 : 0;
  if (delta === 0) return;
  await db.doc(`media/${event.params.mediaId}`)
    .update({ commentsCount: FieldValue.increment(delta) });
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
export const onMediaLikeCreated = onDocumentCreated("media/{mediaId}/likes/{uid}", async (event) => {
  const { mediaId } = event.params as { mediaId: string };
  try {
    await db.doc(`media/${mediaId}`).update({ likesCount: FieldValue.increment(1) });
    console.log(`Incremented likesCount for media ${mediaId}`);
  } catch (error) {
    console.error(`Failed to increment likesCount for media ${mediaId}:`, error);
  }
});

export const onMediaLikeDeleted = onDocumentDeleted("media/{mediaId}/likes/{uid}", async (event) => {
  const { mediaId } = event.params as { mediaId: string };
  try {
    await db.doc(`media/${mediaId}`).update({ likesCount: FieldValue.increment(-1) });
    console.log(`Decremented likesCount for media ${mediaId}`);
  } catch (error) {
    console.error(`Failed to decrement likesCount for media ${mediaId}:`, error);
  }
});

export const onMediaCommentCreated = onDocumentCreated("media/{mediaId}/comments/{commentId}", async (event) => {
  const { mediaId } = event.params as { mediaId: string };
  try {
    await db.doc(`media/${mediaId}`).update({ commentsCount: FieldValue.increment(1) });
    console.log(`Incremented commentsCount for media ${mediaId}`);
  } catch (error) {
    console.error(`Failed to increment commentsCount for media ${mediaId}:`, error);
  }
});

export const onMediaCommentDeleted = onDocumentDeleted("media/{mediaId}/comments/{commentId}", async (event) => {
  const { mediaId } = event.params as { mediaId: string };
  try {
    await db.doc(`media/${mediaId}`).update({ commentsCount: FieldValue.increment(-1) });
    console.log(`Decremented commentsCount for media ${mediaId}`);
  } catch (error) {
    console.error(`Failed to decrement commentsCount for media ${mediaId}:`, error);
  }
});

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

// ---------------- MEDIA: FFmpeg Processing ----------------
export const onMediaFileFinalize = onObjectFinalized(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '2GiB',
  },
  async (event) => {
    const name = event.data.name || '';
    const ctype = event.data.contentType || '';
    
    // Only process user uploads under media/, skip our own outputs
    if (!name.startsWith('media/')) return;
    if (name.endsWith('.m3u8') || name.endsWith('.ts') || name.includes('/hls/')) return;
    if (path.basename(name).startsWith('thumb_') || path.basename(name).startsWith('poster_')) return;

    const bucket = getStorage().bucket(event.data.bucket);
    const dir = path.dirname(name);               // media/<uid>/<batchId>
    const base = path.parse(name).name;           // filename (no ext)
    const tmpOriginal = path.join(os.tmpdir(), path.basename(name));

    await bucket.file(name).download({ destination: tmpOriginal });

    // Find the media doc by storageFolder (recommended) or by filePath
    let snap = await db.collection('media')
      .where('storageFolder', '==', `${dir}/`)
      .limit(1).get();
    if (snap.empty) {
      snap = await db.collection('media').where('filePath', '==', name).limit(1).get();
      if (snap.empty) {
        // No doc to write back to — nothing else to do
        fs.unlinkSync(tmpOriginal);
        return;
      }
    }
    const mediaRef = snap.docs[0].ref;

    try {
      // Images → make a WebP thumbnail and capture dimensions
      if (ctype.startsWith('image/')) {
        const meta = await sharp(tmpOriginal).metadata();
        const thumbLocal = path.join(os.tmpdir(), `thumb_${base}.webp`);
        await sharp(tmpOriginal)
          .resize({ width: 1280, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(thumbLocal);

        const thumbPath = `${dir}/thumb_${base}.webp`;
        await bucket.upload(thumbLocal, {
          destination: thumbPath,
          metadata: { contentType: 'image/webp' },
        });

        await mediaRef.set({
          thumbnailPath: thumbPath,
          transcodeStatus: 'ready',
          dimensions: { width: meta.width ?? null, height: meta.height ?? null },
        }, { merge: true });

        fs.unlinkSync(thumbLocal);
      }
      // Videos → poster + HLS + duration/dimensions
      else if (ctype.startsWith('video/')) {
        await mediaRef.set({ transcodeStatus: 'processing' }, { merge: true });

        // Probe
        const probe: any = await new Promise((res, rej) =>
          ffmpeg(tmpOriginal).ffprobe((err: any, data: any) => err ? rej(err) : res(data))
        );
        const stream = (probe.streams || []).find((s: any) => s.width && s.height) || {};
        const duration = probe.format?.duration || null;
        const width = stream.width || null;
        const height = stream.height || null;

        // Poster
        const posterLocal = path.join(os.tmpdir(), `poster_${base}.jpg`);
        await new Promise<void>((res, rej) =>
          ffmpeg(tmpOriginal).frames(1).outputOptions(['-q:v 2'])
            .save(posterLocal).on('end', () => res()).on('error', rej)
        );
        const posterPath = `${dir}/poster_${base}.jpg`;
        await bucket.upload(posterLocal, {
          destination: posterPath,
          metadata: { contentType: 'image/jpeg' },
        });

        // HLS
        const hlsDirLocal = path.join(os.tmpdir(), `hls_${base}`);
        fs.mkdirSync(hlsDirLocal, { recursive: true });
        await new Promise<void>((res, rej) =>
          ffmpeg(tmpOriginal)
            .addOptions([
              '-profile:v', 'main',
              '-vf', 'scale=w=1280:-2',     // keep aspect
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
            : 'video/MP2T';
          return bucket.upload(path.join(hlsDirLocal, f), {
            destination: dest,
            metadata: { contentType: ct },
          });
        }));

        await mediaRef.set({
          sources: { hls: `${hlsPath}index.m3u8` }, // store Storage path; client calls getDownloadURL()
          thumbnailPath: posterPath,
          transcodeStatus: 'ready',
          duration,
          dimensions: { width, height },
        }, { merge: true });

        // cleanup tmp
        fs.rmSync(hlsDirLocal, { recursive: true, force: true });
        fs.unlinkSync(posterLocal);
      }
    } catch (err) {
      await mediaRef.set({ transcodeStatus: 'failed' }, { merge: true });
      console.error('Transcode error for', name, err);
    } finally {
      fs.unlinkSync(tmpOriginal);
    }
  }
);