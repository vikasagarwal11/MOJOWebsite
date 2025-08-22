Below are copy‑paste files/snippets to enable thumbnail/poster generation and HLS transcoding with Firebase Functions v2 (Node 22). They **do not** touch your UI except for one optional helper.

> **What this adds**
> - Storage **finalize** trigger that:
>   - For **images**: creates a WebP thumbnail, captures dimensions.
>   - For **videos**: creates a poster JPEG, transcodes to **HLS** with `.m3u8` + segments, captures duration + dimensions.
>   - Writes back to the media doc: `{ thumbnailPath, sources.hls, transcodeStatus, duration, dimensions }`.
> - Uses fields you save on each media doc at upload time: `storageFolder` and `filePath`.
>
> **Assumptions**
> - Your uploads live under `media/<uid>/<batchId>/<filename>`.
> - Each Firestore media doc includes `storageFolder: "media/<uid>/<batchId>/"` and `filePath: "media/<uid>/<batchId>/<filename>"`.
>
---

# 0) Install dependencies (in `functions/`)
```bash
npm i fluent-ffmpeg ffmpeg-static @ffprobe-installer/ffprobe sharp
```

> **Note:** The default Cloud Functions gen2 runtime can run these with the provided static binaries; no custom layer required.

---

# 1) New file — `functions/src/ffmpegPipeline.ts`
```ts
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as admin from 'firebase-admin';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobe from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';

if (!admin.apps.length) admin.initializeApp();
ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
ffmpeg.setFfprobePath(ffprobe.path);

const db = getFirestore();

export const onMediaFileFinalize = onObjectFinalized(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '2GiB',
  },
  async (event) => {
    const name = event.data.name || '';
    const ctype = event.data.contentType || '';

    // Only handle user uploads under media/; skip our own outputs
    if (!name.startsWith('media/')) return;
    if (name.endsWith('.m3u8') || name.endsWith('.ts') || name.includes('/hls/')) return;
    const baseName = path.basename(name);
    if (baseName.startsWith('thumb_') || baseName.startsWith('poster_')) return;

    const bucket = getStorage().bucket(event.data.bucket);
    const dir = path.dirname(name);            // media/<uid>/<batchId>
    const base = path.parse(name).name;        // filename without extension
    const tmpOriginal = path.join(os.tmpdir(), baseName);

    await bucket.file(name).download({ destination: tmpOriginal });

    // Locate the Firestore media document by storageFolder (preferred) or filePath
    let snap = await db.collection('media')
      .where('storageFolder', '==', `${dir}/`).limit(1).get();
    if (snap.empty) {
      snap = await db.collection('media').where('filePath', '==', name).limit(1).get();
      if (snap.empty) {
        // No document to update; clean up and exit.
        try { fs.unlinkSync(tmpOriginal); } catch {}
        return;
      }
    }
    const mediaRef = snap.docs[0].ref;

    try {
      if (ctype.startsWith('image/')) {
        // === Images === create thumbnail immediately and mark ready
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

        try { fs.unlinkSync(thumbLocal); } catch {}
      }
      else if (ctype.startsWith('video/')) {
        // === Videos === EARLY POSTER WRITE, then HLS
        await mediaRef.set({ transcodeStatus: 'processing' }, { merge: true });

        // Probe duration and dimensions first
        const probe: any = await new Promise((res, rej) =>
          ffmpeg(tmpOriginal).ffprobe((err, data) => err ? rej(err) : res(data))
        );
        const vstream = (probe.streams || []).find((s: any) => s.width && s.height) || {};
        const duration = probe.format?.duration || null;
        const width = vstream.width || null;
        const height = vstream.height || null;

        // 1) Generate POSTER and write it to Firestore immediately so UI can render it while processing
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

        // EARLY WRITE so the card shows a poster image while HLS is still running
        await mediaRef.set({
          thumbnailPath: posterPath,
          transcodeStatus: 'processing',
          duration,
          dimensions: { width, height },
        }, { merge: true });

        // 2) HLS transcode (this may take longer; UI already has poster)
        const hlsLocalDir = path.join(os.tmpdir(), `hls_${base}`);
        fs.mkdirSync(hlsLocalDir, { recursive: true });
        await new Promise<void>((res, rej) =>
          ffmpeg(tmpOriginal)
            .addOptions([
              '-profile:v', 'main',
              '-vf', 'scale=w=1280:-2', // keep aspect ratio
              '-start_number', '0',
              '-hls_time', '4',
              '-hls_list_size', '0',
              '-f', 'hls',
            ])
            .output(path.join(hlsLocalDir, 'index.m3u8'))
            .on('end', () => res())
            .on('error', rej)
            .run()
        );

        // Upload HLS artifacts
        const hlsPath = `${dir}/hls/${base}/`;
        const entries = fs.readdirSync(hlsLocalDir);
        await Promise.all(entries.map((fname) => {
          const filePath = path.join(hlsLocalDir, fname);
          const ct = fname.endsWith('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : 'video/MP2T';
          return bucket.upload(filePath, {
            destination: `${hlsPath}${fname}`,
            metadata: { contentType: ct },
          });
        }));

        // Final write: mark ready and add HLS source
        await mediaRef.set({
          sources: { hls: `${hlsPath}index.m3u8` },
          transcodeStatus: 'ready',
        }, { merge: true });

        // Cleanup temp files
        try { fs.rmSync(hlsLocalDir, { recursive: true, force: true }); } catch {}
        try { fs.unlinkSync(posterLocal); } catch {}
      }
    } catch (err) {
      await mediaRef.set({ transcodeStatus: 'failed' }, { merge: true });
      console.error('Transcode error for', name, err);
    } finally {
      try { fs.unlinkSync(tmpOriginal); } catch {}
    }
  }
);
```ts
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as admin from 'firebase-admin';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobe from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';

if (!admin.apps.length) admin.initializeApp();
ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
ffmpeg.setFfprobePath(ffprobe.path);

const db = getFirestore();

export const onMediaFileFinalize = onObjectFinalized(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '2GiB',
  },
  async (event) => {
    const name = event.data.name || '';
    const ctype = event.data.contentType || '';

    // Only handle user uploads under media/; skip our own outputs
    if (!name.startsWith('media/')) return;
    if (name.endsWith('.m3u8') || name.endsWith('.ts') || name.includes('/hls/')) return;
    const baseName = path.basename(name);
    if (baseName.startsWith('thumb_') || baseName.startsWith('poster_')) return;

    const bucket = getStorage().bucket(event.data.bucket);
    const dir = path.dirname(name);            // media/<uid>/<batchId>
    const base = path.parse(name).name;        // filename without extension
    const tmpOriginal = path.join(os.tmpdir(), baseName);

    await bucket.file(name).download({ destination: tmpOriginal });

    // Locate the Firestore media document by storageFolder (preferred) or filePath
    let snap = await db.collection('media')
      .where('storageFolder', '==', `${dir}/`).limit(1).get();
    if (snap.empty) {
      snap = await db.collection('media').where('filePath', '==', name).limit(1).get();
      if (snap.empty) {
        // No document to update; clean up and exit.
        try { fs.unlinkSync(tmpOriginal); } catch {}
        return;
      }
    }
    const mediaRef = snap.docs[0].ref;

    try {
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

        try { fs.unlinkSync(thumbLocal); } catch {}
      }
      else if (ctype.startsWith('video/')) {
        await mediaRef.set({ transcodeStatus: 'processing' }, { merge: true });

        // Probe duration and dimensions
        const probe: any = await new Promise((res, rej) =>
          ffmpeg(tmpOriginal).ffprobe((err, data) => err ? rej(err) : res(data))
        );
        const vstream = (probe.streams || []).find((s: any) => s.width && s.height) || {};
        const duration = probe.format?.duration || null;
        const width = vstream.width || null;
        const height = vstream.height || null;

        // Poster (first frame)
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

        // HLS transcode
        const hlsLocalDir = path.join(os.tmpdir(), `hls_${base}`);
        fs.mkdirSync(hlsLocalDir, { recursive: true });
        await new Promise<void>((res, rej) =>
          ffmpeg(tmpOriginal)
            .addOptions([
              '-profile:v', 'main',
              '-vf', 'scale=w=1280:-2',
              '-start_number', '0',
              '-hls_time', '4',
              '-hls_list_size', '0',
              '-f', 'hls',
            ])
            .output(path.join(hlsLocalDir, 'index.m3u8'))
            .on('end', () => res())
            .on('error', rej)
            .run()
        );

        // Upload HLS artifacts
        const hlsPath = `${dir}/hls/${base}/`;
        const entries = fs.readdirSync(hlsLocalDir);
        await Promise.all(entries.map((fname) => {
          const filePath = path.join(hlsLocalDir, fname);
          const ct = fname.endsWith('.m3u8')
            ? 'application/vnd.apple.mpegurl'
            : 'video/MP2T';
          return bucket.upload(filePath, {
            destination: `${hlsPath}${fname}`,
            metadata: { contentType: ct },
          });
        }));

        await mediaRef.set({
          sources: { hls: `${hlsPath}index.m3u8` },
          thumbnailPath: posterPath,
          transcodeStatus: 'ready',
          duration,
          dimensions: { width, height },
        }, { merge: true });

        // Cleanup temp files
        try { fs.rmSync(hlsLocalDir, { recursive: true, force: true }); } catch {}
        try { fs.unlinkSync(posterLocal); } catch {}
      }
    } catch (err) {
      await mediaRef.set({ transcodeStatus: 'failed' }, { merge: true });
      console.error('Transcode error for', name, err);
    } finally {
      try { fs.unlinkSync(tmpOriginal); } catch {}
    }
  }
);
```

---

# 2) Export from your Functions entry
**Edit** `functions/src/index.ts` and add this line (keep your other exports):
```ts
export * from './ffmpegPipeline';
```

---

# 3) Uploader: save `storageFolder` + `filePath` (front‑end)
Wherever you create the media doc during upload, include both fields so the function can find the document.

```ts
// Example
const batchId = crypto.randomUUID();
const storageFolder = `media/${currentUser.uid}/${batchId}/`;
const filePath = `${storageFolder}${file.name}`; // use this exact path for the uploaded object

// 1) Upload to `filePath`
// 2) Create media doc with pointers
await addDoc(collection(db, 'media'), {
  title, description,
  uploadedBy: currentUser.uid,
  createdAt: serverTimestamp(),
  isPublic: true,
  type: file.type.startsWith('video/') ? 'video' : 'image',
  storageFolder,
  filePath,
  transcodeStatus: 'processing', // optional immediate hint
});
```

---

# 4) Optional helper — attach HLS player in the UI
Create `src/utils/hls.ts` to lazily attach an HLS stream to a `<video>` element.

```ts
// src/utils/hls.ts
import Hls from 'hls.js';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@/config/firebase';

export async function attachHls(video: HTMLVideoElement, storagePath: string) {
  const url = await getDownloadURL(ref(storage, storagePath));
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(video);
  } else {
    // Safari/iOS can play HLS natively
    video.src = url;
  }
}
```

Use it in your `MediaCard`/lightbox when `media.sources?.hls` exists.

```ts
// pseudo-usage inside a useEffect
if (media.sources?.hls && videoRef.current) {
  attachHls(videoRef.current, media.sources.hls);
}
```

---

# 5) Deploy
```bash
cd functions
npm run build
npm run deploy
```

**Verify:**
- New image → `thumb_*.webp` appears; doc shows `thumbnailPath`, `dimensions`, `transcodeStatus: "ready"`.
- New video → `poster_*.jpg` + `hls/<base>/index.m3u8` appear; doc shows `sources.hls`, `thumbnailPath`, `duration`, `dimensions`, `transcodeStatus: "ready"`.

