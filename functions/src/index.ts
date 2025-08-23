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
import { v4 as uuidv4 } from 'uuid';

// Init
initializeApp();
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

// ───────────────── EVENTS: RSVP notifications ─────────────────
export const notifyRsvp = onDocumentWritten("events/{eventId}/rsvps/{userId}", async (event) => {
  const beforeData = event.data?.before.exists ? event.data?.before.data() : null;
  const afterData = event.data?.after.exists ? event.data?.after.data() : null;

  const wasGoing = beforeData?.status === "going";
  const isGoing = afterData?.status === "going";
  if (!isGoing || wasGoing) return;

  try {
    const eventId = event.params.eventId;
    const userId = event.params.userId;

    const eventDoc = await db.collection('events').doc(eventId).get();
    if (!eventDoc.exists) return;

    const eventData = eventDoc.data()!;
    const eventCreatorId = eventData.createdBy;
    if (eventCreatorId === userId) return;

    const userDoc = await db.collection('users').doc(userId).get();
    let userName = 'Member';
    if (userDoc.exists) {
      const userData = userDoc.data()!;
      userName = userData.displayName || userData.firstName || userData.lastName || 'Member';
    }

    await db.collection('notifications').add({
      userId: eventCreatorId,
      message: `${userName} is going to ${eventData.title}!`,
      createdAt: FieldValue.serverTimestamp(),
      eventId,
      read: false,
      type: 'rsvp',
      rsvpUserId: userId,
      rsvpStatus: 'going'
    });

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
          data: { eventId, type: 'rsvp', userId },
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

// Legacy alias
export const onRsvpNotification = notifyRsvp;

// ───────────────── MEDIA: Storage Cleanup ─────────────────
export const onMediaDeletedCleanup = onDocumentDeleted("media/{mediaId}", async (event) => {
  const data = event.data?.data() as any;
  if (!data) return;

  const storage = getStorage().bucket();
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

// ───────────────── MEDIA: FFmpeg + Manifest Rewrite ─────────────────
export const onMediaFileFinalize = onObjectFinalized(
  {
    bucket: 'mojomediafiles',
    region: 'us-east1',
    timeoutSeconds: 540,
    memory: '2GiB',
    cpu: 2,
    concurrency: 1,
  },
  async (event) => {
    console.log('🎬 onMediaFileFinalize triggered for:', event.data.name);
    console.log('Bucket:', event.data.bucket);
    console.log('Content type:', event.data.contentType);
    console.log('Size:', event.data.size);

    const name = event.data.name || '';
    const ctype = event.data.contentType || '';

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

    const bucket = getStorage().bucket(event.data.bucket);
    const dir = path.dirname(name);   // media/<uid>/<batchId>
    const base = path.parse(name).name;

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

      // Images → thumbnail
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
            cacheControl: 'public,max-age=31536000,immutable'
          },
        });

        await mediaRef.set({
          thumbnailPath: thumbPath,
          transcodeStatus: 'ready',
          dimensions: { width: meta.width ?? null, height: meta.height ?? null },
        }, { merge: true });

        console.log(`Image processing complete for ${mediaRef.id}, thumbnail: ${thumbPath}`);
        fs.unlinkSync(thumbLocal);
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
            .frames(1)
            .outputOptions(['-q:v 2'])
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
