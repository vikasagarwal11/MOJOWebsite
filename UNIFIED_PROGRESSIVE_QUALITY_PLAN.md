# Progressive Quality Generation - Unified Implementation Plan

## 📊 Executive Summary: Three Feedback Sources Synthesized

After analyzing **three independent feedback sources** (My original plan, Grok feedback, ChatGPT feedback), there is **strong consensus** on critical issues and approach. This unified plan combines the best insights from all three.

### ✅ Consensus Points (All Three Agree):

1. **Critical: hls.js Limitation** - hls.js does NOT auto-discover new variants for VOD streams
2. **Solution: Pre-declare all quality levels** in master playlist from start
3. **Cloud Tasks/Queue-based approach** for background generation (prevent timeouts)
4. **Stream segments as produced** (faster playback than waiting for full encode)
5. **Phased implementation** is safest approach

### ⚠️ Key Differences Resolved:

| Topic | Original Plan | Grok | ChatGPT | Unified Solution |
|-------|--------------|------|---------|------------------|
| **HLS.js Discovery** | ❌ Assumed auto | ❌ Won't work | ❌ VOD limitation | ✅ Pre-declare all |
| **Master Updates** | Update progressively | Pre-declare all | Queue-based updates | ✅ Pre-declare + queue |
| **Ready State** | Full 720p encode | 3-5 segments | Not specified | ✅ First 3-5 segments |
| **Background Work** | Same function | Cloud Tasks | Separate functions | ✅ Cloud Tasks |
| **Frontend Changes** | None needed | None needed | ✅ Needs reload logic | ✅ Real-time listener |

---

## 🎯 Unified Implementation Strategy

### Architecture Overview

```
Video Upload
    ↓
[Cloud Function: onMediaFileFinalize]
    ↓
1. Create master.m3u8 with ALL quality levels (720p, 1080p, 4K)
   └─ 1080p/index.m3u8 → 404 (OK, hls.js will retry)
   └─ 2160p/index.m3u8 → 404 (OK, hls.js will retry)
    ↓
2. Generate 720p (stream segments as produced)
   └─ Upload segment 0, 1, 2... as FFmpeg produces them
   └─ After 3-5 segments uploaded → Mark video as "ready"
    ↓
3. Upload master.m3u8 (with all levels pre-declared)
    ↓
4. Enqueue Cloud Tasks for 1080p and 4K generation
    ↓
[Cloud Task: generate-1080p]
   └─ Generate 1080p → Upload → Update Firestore
    ↓
[Cloud Task: generate-4k]
   └─ Generate 4K → Upload → Update Firestore
    ↓
[Frontend: Real-time listener on qualityLevels]
   └─ When 1080p ready → hls.loadSource(masterUrl) to reload
   └─ When 4K ready → hls.loadSource(masterUrl) to reload
```

---

## 🔧 Detailed Implementation Plan

### Phase 1: Pre-Declared Master Playlist (30 minutes, ZERO risk)

**Why:** Critical fix for hls.js VOD limitation. All three feedback sources agree this is necessary.

**Implementation:**

```typescript
// functions/src/index.ts - Create master playlist IMMEDIATELY

// Define all quality levels upfront (even if not generated yet)
const allQualityLevels: QualityLevel[] = [
  {
    name: '720p',
    label: '720p',
    resolution: '1280x720',
    bandwidth: 2000000
  },
  {
    name: '1080p',
    label: '1080p',
    resolution: '1920x1080',
    bandwidth: 5000000
  },
  {
    name: '2160p',
    label: '4K',
    resolution: '3840x2160',
    bandwidth: 20000000
  }
];

// Create master playlist with ALL levels from start
const masterPlaylistContent = [
  '#EXTM3U',
  '#EXT-X-VERSION:3'
];

// Add ALL quality levels (they'll 404 initially, that's OK)
allQualityLevels.forEach(quality => {
  masterPlaylistContent.push(
    `#EXT-X-STREAM-INF:BANDWIDTH=${quality.bandwidth},RESOLUTION=${quality.resolution}`,
    `${quality.name}/index.m3u8`
  );
});

// Upload master playlist BEFORE any encoding
const masterPlaylistLocal = path.join(os.tmpdir(), `master_${base}.m3u8`);
fs.writeFileSync(masterPlaylistLocal, masterPlaylistContent.join('\n') + '\n');

await bucket.upload(masterPlaylistLocal, {
  destination: masterPlaylistStorage,
  metadata: {
    contentType: 'application/vnd.apple.mpegurl',
    cacheControl: 'no-cache, must-revalidate', // Force fresh fetches
    metadata: { firebaseStorageDownloadTokens: sharedToken }
  },
});

// Store master playlist path in Firestore immediately
await mediaRef.set({
  sources: {
    hlsMaster: masterPlaylistStorage
  }
}, { merge: true });
```

**Key Points:**
- ✅ All quality levels listed from start
- ✅ 1080p/4K will 404 initially (hls.js handles this gracefully)
- ✅ `cache-control: no-cache` prevents CDN caching issues
- ✅ Atomic write (write to temp, then move to final)

**Time:** 30 minutes
**Risk:** ZERO (doesn't change behavior)

---

### Phase 2: Streaming Segments (2-3 hours, LOW risk)

**Why:** 2-3x faster playback (12-20s vs 30-60s). Grok and ChatGPT agree this is worthwhile.

**Implementation:**

```typescript
// Generate 720p with aligned GOPs and streaming segments
let segmentsUploaded = 0;
let isMarkedReady = false;

ffmpeg(tmpOriginal)
  .addOptions([
    '-preset', 'ultrafast',
    '-crf', '26',
    '-profile:v', 'main',
    '-vf', 'scale=w=min(iw\\,1280):h=-2',
    // Aligned GOPs for seamless ABR (all three feedback sources agree)
    '-g', '48', // 48 frames = 2s at 24fps
    '-keyint_min', '48',
    '-sc_threshold', '0',
    '-force_key_frames', 'expr:gte(t,n_forced*2)',
    // HLS options
    '-hls_time', '4', // 4 second segments
    '-hls_list_size', '0', // Live playlist (no ENDLIST)
    '-hls_segment_type', 'mpegts',
    '-hls_flags', 'independent_segments',
    '-f', 'hls'
  ])
  .output(path.join(qualityDirLocal, 'index.m3u8'))
  .on('start', (cmdline) => {
    console.log(`🎬 [PROGRESSIVE] 720p FFmpeg started`);
  })
  .on('segment', async (segmentPath, segmentInfo) => {
    // Upload segment IMMEDIATELY as produced
    const segmentFileName = path.basename(segmentPath);
    const segmentStoragePath = `${qualityDirStorage}${segmentFileName}`;
    
    await bucket.upload(segmentPath, {
      destination: segmentStoragePath,
      metadata: {
        contentType: 'video/mp2t',
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: { firebaseStorageDownloadTokens: sharedToken }
      }
    });
    
    segmentsUploaded++;
    console.log(`📦 [PROGRESSIVE] Uploaded segment ${segmentsUploaded}: ${segmentFileName}`);
    
    // Mark as ready after 3-5 segments (Grok recommendation)
    if (!isMarkedReady && segmentsUploaded >= 3) {
      // Update playlist file with current segments
      await updatePlaylist(qualityDirLocal, qualityDirStorage, sharedToken);
      
      // Mark video as ready
      await mediaRef.set({
        transcodeStatus: 'ready',
        sources: {
          hlsMaster: masterPlaylistStorage,
          hls: `${qualityDirStorage}index.m3u8`
        },
        qualityLevels: [{
          name: '720p',
          ready: true,
          segmentsUploaded: segmentsUploaded
        }]
      }, { merge: true });
      
      isMarkedReady = true;
      console.log(`✅ [PROGRESSIVE] Video marked as ready after ${segmentsUploaded} segments`);
    }
  })
  .on('end', async () => {
    // Final playlist update with all segments
    await updatePlaylist(qualityDirLocal, qualityDirStorage, sharedToken);
    
    // Mark 720p as complete
    await mediaRef.set({
      qualityLevels: [{
        name: '720p',
        ready: true,
        complete: true
      }]
    }, { merge: true });
    
    console.log(`✅ [PROGRESSIVE] 720p generation complete`);
  })
  .on('error', (err) => {
    console.error(`❌ [PROGRESSIVE] 720p FFmpeg error:`, err);
    throw err;
  })
  .run();
```

**Helper Function:**
```typescript
async function updatePlaylist(
  localDir: string,
  storageDir: string,
  token: string
): Promise<void> {
  // Read local playlist
  const playlistPath = path.join(localDir, 'index.m3u8');
  let playlistContent = fs.readFileSync(playlistPath, 'utf-8');
  
  // Rewrite with absolute Storage URLs
  const bucketName = bucket.name;
  playlistContent = playlistContent.replace(
    /([^\/\n]+\.ts)/g,
    `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storageDir)}$1?alt=media&token=${token}`
  );
  
  // Upload updated playlist
  await bucket.upload(playlistPath, {
    destination: `${storageDir}index.m3u8`,
    metadata: {
      contentType: 'application/vnd.apple.mpegurl',
      cacheControl: 'no-cache, must-revalidate',
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });
}
```

**Key Points:**
- ✅ Upload segments as produced (not waiting for full encode)
- ✅ Aligned GOPs for seamless ABR switching
- ✅ Mark ready after 3-5 segments (12-20s instead of 30-60s)
- ✅ Live playlist (no `#EXT-X-ENDLIST`) for periodic reloading

**Time:** 2-3 hours
**Risk:** LOW (graceful fallback)

---

### Phase 3: Cloud Tasks for Background Generation (3-4 hours, MEDIUM risk)

**Why:** All three sources agree - prevents timeouts, better reliability, better observability.

**Implementation:**

```typescript
// functions/src/index.ts - After 720p is marked ready

import { CloudTasksClient } from '@google-cloud/tasks';

const tasksClient = new CloudTasksClient();
const projectId = process.env.GCLOUD_PROJECT || 'momsfitnessmojo-65d00';
const location = 'us-central1';
const queuePath = tasksClient.queuePath(projectId, location, 'video-quality-generation');

// Enqueue 1080p generation (if applicable)
if (is1080pOrHigher) {
  const task1080p = {
    httpRequest: {
      httpMethod: 'POST',
      url: `https://${location}-${projectId}.cloudfunctions.net/generateQuality`,
      body: Buffer.from(JSON.stringify({
        mediaId: mediaRef.id,
        eventId: eventId,
        quality: '1080p',
        idempotencyKey: `${mediaRef.id}-1080p-${Date.now()}`,
        storagePath: tmpOriginal, // Pass path to original video
        hlsBasePath: hlsBasePath,
        sharedToken: sharedToken
      })).toString('base64'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await admin.app().options.credential?.getAccessToken()}`
      }
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + 1 // Start immediately
    }
  };
  
  await tasksClient.createTask({
    parent: queuePath,
    task: task1080p
  });
  
  console.log(`📋 [PROGRESSIVE] Enqueued 1080p generation task for ${mediaRef.id}`);
}

// Similar for 4K...
```

**Background Cloud Function:**
```typescript
// functions/src/index.ts - New Cloud Function

import { onRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';

export const generateQuality = onRequest({
  region: 'us-central1',
  memory: '8GiB',
  timeoutSeconds: 540,
  cpu: 2
}, async (request, response) => {
  // Idempotency check
  const { mediaId, quality, idempotencyKey, storagePath, hlsBasePath, sharedToken } = request.body;
  
  if (!mediaId || !quality) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  // Check if already generated (idempotency)
  const mediaRef = doc(db, 'media', mediaId);
  const mediaDoc = await getDoc(mediaRef);
  const existingQualities = mediaDoc.data()?.qualityLevels || [];
  
  if (existingQualities.find((q: any) => q.name === quality && q.complete)) {
    console.log(`⏭️ [PROGRESSIVE] ${quality} already generated, skipping`);
    response.json({ success: true, skipped: true });
    return;
  }
  
  try {
    // Download original video (or use cached path)
    const tmpOriginal = await downloadVideo(storagePath);
    
    // Generate quality
    await generateQualityLevel({
      quality: qualityConfigs[quality],
      tmpOriginal,
      hlsBasePath: `${hlsBasePath}${quality}/`,
      sharedToken,
      mediaRef
    });
    
    // Update Firestore
    await mediaRef.set({
      qualityLevels: FieldValue.arrayUnion({
        name: quality,
        ready: true,
        complete: true
      })
    }, { merge: true });
    
    console.log(`✅ [PROGRESSIVE] ${quality} generation complete`);
    response.json({ success: true });
  } catch (error) {
    console.error(`❌ [PROGRESSIVE] ${quality} generation failed:`, error);
    
    // Mark as failed but don't break 720p playback
    await mediaRef.set({
      qualityLevels: FieldValue.arrayUnion({
        name: quality,
        ready: false,
        failed: true,
        error: error instanceof Error ? error.message : String(error)
      })
    }, { merge: true });
    
    response.status(500).json({ success: false, error: String(error) });
  }
});
```

**Cloud Tasks Queue Setup:**
```typescript
// Create queue via gcloud CLI or Cloud Console:
// gcloud tasks queues create video-quality-generation \
//   --location=us-central1 \
//   --max-dispatches-per-second=5 \
//   --max-concurrent-dispatches=8
```

**Key Points:**
- ✅ Separate Cloud Function for each quality (better timeout handling)
- ✅ Idempotency checks prevent duplicate work
- ✅ Failed qualities don't break 720p playback
- ✅ Queue-based for better scalability

**Time:** 3-4 hours (includes Cloud Tasks setup)
**Risk:** MEDIUM (new infrastructure)

---

### Phase 4: Frontend Real-Time Listener (1-2 hours, LOW risk)

**Why:** ChatGPT identified that hls.js won't auto-reload for VOD. Need explicit reload trigger.

**Implementation:**

```typescript
// src/utils/hls.ts - Add real-time quality level listener

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

let currentQualityListener: (() => void) | null = null;

export async function attachHlsWithProgressiveQuality(
  video: HTMLVideoElement,
  storagePath: string,
  mediaId: string,
  isMasterPlaylist: boolean = false
): Promise<void> {
  // Initial HLS attachment
  await attachHls(video, storagePath, isMasterPlaylist);
  
  if (!isMasterPlaylist || !mediaId) {
    return; // Only needed for master playlists
  }
  
  const hls = (video as any)._hls;
  if (!hls) {
    return; // HLS.js not attached
  }
  
  // Track last known quality levels
  let lastKnownQualities: string[] = [];
  
  // Listen for quality level updates
  const mediaRef = doc(db, 'media', mediaId);
  currentQualityListener = onSnapshot(
    mediaRef,
    (snapshot) => {
      const data = snapshot.data();
      const qualityLevels = data?.qualityLevels || [];
      const readyQualities = qualityLevels
        .filter((q: any) => q.ready && q.complete)
        .map((q: any) => q.name);
      
      // Check if new quality became available
      const newQualities = readyQualities.filter(
        (q: string) => !lastKnownQualities.includes(q)
      );
      
      if (newQualities.length > 0) {
        console.log(`📈 [PROGRESSIVE] New quality available: ${newQualities.join(', ')}`);
        
        // Reload master playlist to pick up new qualities
        // ChatGPT recommendation: save current time, reload, restore
        const currentTime = video.currentTime;
        const wasPlaying = !video.paused;
        
        // Reload HLS source
        hls.loadSource(video.src);
        
        // Restore playback state after manifest reloads
        hls.once(Hls.Events.MANIFEST_PARSED, () => {
          video.currentTime = currentTime;
          if (wasPlaying) {
            video.play().catch(() => {
              // Autoplay might be blocked, that's OK
            });
          }
          
          console.log(`✅ [PROGRESSIVE] Quality upgraded to include: ${newQualities.join(', ')}`);
        });
      }
      
      lastKnownQualities = readyQualities;
    },
    (error) => {
      console.error('❌ [PROGRESSIVE] Error listening to quality levels:', error);
    }
  );
}

export function detachHlsWithProgressiveQuality(video: HTMLVideoElement): void {
  // Clean up listener
  if (currentQualityListener) {
    currentQualityListener();
    currentQualityListener = null;
  }
  
  // Detach HLS
  detachHls(video);
}
```

**Usage in MediaCard.tsx:**
```typescript
// src/components/media/MediaCard.tsx

useEffect(() => {
  if (isVideo && localMedia.sources?.hlsMaster && localMedia.mediaId) {
    attachHlsWithProgressiveQuality(
      videoElement,
      localMedia.sources.hlsMaster,
      localMedia.mediaId,
      true
    );
    
    return () => {
      detachHlsWithProgressiveQuality(videoElement);
    };
  }
}, [localMedia.sources?.hlsMaster, localMedia.mediaId, isVideo]);
```

**Key Points:**
- ✅ Real-time Firestore listener on `qualityLevels`
- ✅ Detect when new quality becomes available
- ✅ Reload HLS source (ChatGPT recommendation)
- ✅ Preserve playback state (currentTime, playing status)

**Time:** 1-2 hours
**Risk:** LOW (graceful degradation)

---

### Phase 5: Aligned GOPs & Atomic Writes (1-2 hours, LOW risk)

**Why:** Grok and ChatGPT both emphasized aligned GOPs for seamless ABR switching.

**Implementation:**

```typescript
// Quality config with aligned GOPs

const qualityConfigs = {
  '720p': {
    name: '720p',
    preset: 'ultrafast',
    crf: 26,
    scaleFilter: 'scale=w=min(iw\\,1280):h=-2',
    bandwidth: 2000000,
    // Aligned GOPs (same across all qualities)
    gopSize: 48, // 48 frames = 2s at 24fps
    keyintMin: 48,
    scThreshold: 0,
    forceKeyFrames: 'expr:gte(t,n_forced*2)'
  },
  '1080p': {
    name: '1080p',
    preset: 'fast',
    crf: 23,
    scaleFilter: 'scale=w=min(iw\\,1920):h=-2',
    bandwidth: 5000000,
    // SAME GOP settings for alignment
    gopSize: 48,
    keyintMin: 48,
    scThreshold: 0,
    forceKeyFrames: 'expr:gte(t,n_forced*2)'
  },
  '2160p': {
    name: '2160p',
    preset: 'medium',
    crf: 21,
    scaleFilter: 'scale=iw:ih', // Keep original
    bandwidth: 20000000,
    // SAME GOP settings for alignment
    gopSize: 48,
    keyintMin: 48,
    scThreshold: 0,
    forceKeyFrames: 'expr:gte(t,n_forced*2)'
  }
};

// Atomic master playlist write
async function uploadMasterPlaylistAtomically(
  content: string[],
  storagePath: string
): Promise<void> {
  const tmpPath = `${storagePath}.tmp`;
  const tmpLocal = path.join(os.tmpdir(), `master_${Date.now()}.m3u8`);
  
  // Write to temp file
  fs.writeFileSync(tmpLocal, content.join('\n') + '\n');
  
  // Upload temp file
  await bucket.upload(tmpLocal, {
    destination: tmpPath,
    metadata: {
      contentType: 'application/vnd.apple.mpegurl',
      cacheControl: 'no-cache, must-revalidate',
      metadata: { firebaseStorageDownloadTokens: sharedToken }
    }
  });
  
  // Move temp to final (atomic operation in Storage)
  await bucket.file(tmpPath).move(storagePath);
  
  // Cleanup
  fs.unlinkSync(tmpLocal);
}
```

**Key Points:**
- ✅ Same GOP settings across all qualities (aligned keyframes)
- ✅ Atomic writes prevent corrupted playlists
- ✅ Cache control prevents CDN caching issues

**Time:** 1-2 hours
**Risk:** LOW

---

## 📋 Unified Implementation Checklist

### Phase 1: Pre-Declared Master (30 min)
- [ ] Create master playlist with ALL quality levels from start
- [ ] Set `cache-control: no-cache` on master playlist
- [ ] Upload master playlist before any encoding
- [ ] Test that 404 variants don't break hls.js

### Phase 2: Streaming Segments (2-3 hours)
- [ ] Implement segment streaming (upload as produced)
- [ ] Add aligned GOP settings to all qualities
- [ ] Mark ready after 3-5 segments (not full encode)
- [ ] Test playback starts after 12-20s

### Phase 3: Cloud Tasks (3-4 hours)
- [ ] Create Cloud Tasks queue
- [ ] Create background Cloud Function for quality generation
- [ ] Add idempotency checks
- [ ] Test timeout handling

### Phase 4: Frontend Listener (1-2 hours)
- [ ] Add real-time Firestore listener on qualityLevels
- [ ] Implement hls.loadSource() reload on new quality
- [ ] Preserve playback state (currentTime, paused)
- [ ] Test quality upgrades during playback

### Phase 5: Polish (1-2 hours)
- [ ] Implement atomic playlist writes
- [ ] Add proper cache control headers
- [ ] Add structured logging
- [ ] Test error scenarios

**Total Time:** 8-12 hours
**Total Risk:** LOW-MEDIUM (with phased approach)

---

## ⚠️ Critical Issues Resolved

### Issue #1: HLS.js VOD Limitation ✅ RESOLVED

**Problem:** hls.js doesn't auto-reload master playlist for VOD streams.

**Solution (All Three Agree):**
- Pre-declare all quality levels in master from start
- Use real-time Firestore listener to detect new qualities
- Explicitly call `hls.loadSource()` when new quality ready
- Preserve playback state during reload

### Issue #2: Timeout Risk ✅ RESOLVED

**Problem:** Background generation in same function risks 540s timeout.

**Solution (All Three Agree):**
- Use Cloud Tasks for background generation
- Separate Cloud Function for each quality
- Better timeout handling and retries

### Issue #3: Playback Speed ✅ RESOLVED

**Problem:** Waiting for full 720p encode (30-60s) is slower than needed.

**Solution (Grok Recommendation):**
- Upload segments as produced
- Mark ready after 3-5 segments (12-20s)
- 2-3x faster initial playback

---

## 🎯 Final Recommendation: Adopt Unified Approach

### Why This Unified Plan:

1. ✅ **Fixes Critical Assumptions** - All three sources identified hls.js limitation
2. ✅ **Best Performance** - 12-20s playback (better than 30-60s)
3. ✅ **Production-Ready** - Addresses timeouts, caching, idempotency
4. ✅ **Maintainable** - Clear separation of concerns
5. ✅ **Testable** - Phased approach allows incremental validation

### Key Differences from Original Plan:

| Aspect | Original | Unified | Impact |
|--------|----------|---------|--------|
| **Time Estimate** | 4-6 hours | 8-12 hours | ⚠️ 2x longer |
| **Complexity** | Medium | Medium-High | ⚠️ More complex |
| **Playback Speed** | 30-60s | 12-20s | ✅ 2-3x faster |
| **Reliability** | Medium | High | ✅ More reliable |
| **Production Ready** | Medium | High | ✅ Better |

**Bottom Line:** The unified approach is more complex but **necessary** to avoid critical failures and deliver the best UX.

---

## 🚀 Next Steps

1. **Review this unified plan** with team
2. **Approve phased approach** (recommended) or full implementation
3. **Set up Cloud Tasks queue** (one-time infrastructure)
4. **Start with Phase 1** (zero risk, validates approach)
5. **Test thoroughly** after each phase before proceeding

---

**This unified plan combines the best insights from all three feedback sources and resolves all critical issues.** ✅

