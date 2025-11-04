# Progressive Quality Generation - Final Production-Ready Plan

## ✅ Approval Status: READY TO PROCEED

**Grok Review:** ✅ **Approve** (9/10, proceed with refinements)  
**ChatGPT Review:** ✅ **Approve** (proceed with tweaks)  
**Original Plan:** ✅ **Approved** (with critical fixes)

**Final Recommendation:** **PROCEED WITH IMPLEMENTATION** - All refinements incorporated.

---

## 📋 Final Refinements Incorporated

### From Grok:
- ✅ Time estimate adjustment (10-16 hours with testing)
- ✅ UX improvements (loading indicators during reload)
- ✅ Expanded testing strategy (unit/integration/E2E)
- ✅ Cost monitoring considerations
- ✅ Edge cases (short videos, failed jobs, high concurrency)

### From ChatGPT:
- ✅ Placeholder playlists (avoid 404s on variant playlists)
- ✅ EVENT playlist type for in-progress VOD
- ✅ Master URL for reload (not video.src)
- ✅ OIDC auth for Cloud Tasks (more secure)
- ✅ Map-based qualityLevels (idempotent updates)
- ✅ Refined cache strategy
- ✅ Independent segments tag
- ✅ Operations & retries recommendations
- ✅ Cost guardrails (gate 4K by source resolution)

---

## 🎯 Phase 1: Pre-Declared Master + Placeholder Playlists (1 hour, ZERO risk)

**ChatGPT Enhancement:** Upload placeholder playlists immediately to avoid 404s.

**Implementation:**

```typescript
// functions/src/index.ts - Create master and placeholder playlists IMMEDIATELY

// Define all quality levels upfront
const allQualityLevels: QualityLevel[] = [
  { name: '720p', label: '720p', resolution: '1280x720', bandwidth: 2000000 },
  { name: '1080p', label: '1080p', resolution: '1920x1080', bandwidth: 5000000 },
  { name: '2160p', label: '4K', resolution: '3840x2160', bandwidth: 20000000 }
];

// Create master playlist with ALL levels
const masterPlaylistContent = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-INDEPENDENT-SEGMENTS' // ChatGPT: Ensure independent segments
];

allQualityLevels.forEach(quality => {
  masterPlaylistContent.push(
    `#EXT-X-STREAM-INF:BANDWIDTH=${quality.bandwidth},RESOLUTION=${quality.resolution}`,
    `${quality.name}/index.m3u8`
  );
});

// Upload master playlist BEFORE any encoding
await uploadMasterPlaylistAtomically(masterPlaylistContent, masterPlaylistStorage);

// ChatGPT Enhancement: Upload placeholder playlists for 1080p and 4K immediately
const placeholderPlaylistContent = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-PLAYLIST-TYPE:EVENT', // EVENT for in-progress VOD
  '#EXT-X-TARGETDURATION:4',
  '#EXT-X-MEDIA-SEQUENCE:0',
  '#EXT-X-INDEPENDENT-SEGMENTS'
  // No segments yet - will be appended as produced
];

// Upload placeholder for 1080p
if (is1080pOrHigher) {
  await bucket.upload(
    Buffer.from(placeholderPlaylistContent.join('\n') + '\n'),
    {
      destination: `${hlsBasePath}1080p/index.m3u8`,
      metadata: {
        contentType: 'application/vnd.apple.mpegurl',
        cacheControl: 'max-age=5, must-revalidate', // Short TTL for variant playlists
        metadata: { firebaseStorageDownloadTokens: sharedToken }
      }
    }
  );
}

// Upload placeholder for 4K
if (is4K) {
  await bucket.upload(
    Buffer.from(placeholderPlaylistContent.join('\n') + '\n'),
    {
      destination: `${hlsBasePath}2160p/index.m3u8`,
      metadata: {
        contentType: 'application/vnd.apple.mpegurl',
        cacheControl: 'max-age=5, must-revalidate',
        metadata: { firebaseStorageDownloadTokens: sharedToken }
      }
    }
  );
}

// Store master playlist path and qualityLevels structure (map-based) in Firestore
await mediaRef.set({
  sources: {
    hlsMaster: masterPlaylistStorage
  },
  qualityLevels: {
    '720p': { ready: false, complete: false },
    ...(is1080pOrHigher ? { '1080p': { ready: false, complete: false } } : {}),
    ...(is4K ? { '2160p': { ready: false, complete: false } } : {})
  }
}, { merge: true });
```

**Key Points:**
- ✅ Master playlist with all levels from start
- ✅ Placeholder playlists for 1080p/4K (no 404s)
- ✅ EVENT playlist type (ChatGPT recommendation)
- ✅ Map-based qualityLevels structure (idempotent)
- ✅ Proper cache headers (ChatGPT refinement)

**Time:** 1 hour (adjusted from 30 min with placeholder implementation)
**Risk:** ZERO

---

## 🎯 Phase 2: Streaming Segments with Placeholder Updates (3-4 hours, LOW risk)

**Grok Enhancement:** Test for very short videos (<30s might need 1-2 segments instead of 3-5).

**Implementation:**

```typescript
// Generate 720p with streaming segments and placeholder playlist updates

let segmentsUploaded = 0;
let isMarkedReady = false;
const playlistPath = path.join(qualityDirLocal, 'index.m3u8');
const videoDuration = await getVideoDuration(tmpOriginal);

ffmpeg(tmpOriginal)
  .addOptions([
    '-preset', 'ultrafast',
    '-crf', '26',
    '-profile:v', 'main',
    '-vf', 'scale=w=min(iw\\,1280):h=-2',
    // Aligned GOPs (all qualities use same settings)
    '-g', '48', // 48 frames = 2s at 24fps
    '-keyint_min', '48',
    '-sc_threshold', '0',
    '-force_key_frames', 'expr:gte(t,n_forced*2)',
    // HLS options
    '-hls_time', '4', // 4 second segments (same across all qualities)
    '-hls_list_size', '0', // Live playlist
    '-hls_segment_type', 'mpegts',
    '-hls_flags', 'independent_segments', // ChatGPT: Independent segments
    '-f', 'hls'
  ])
  .output(playlistPath)
  .on('segment', async (segmentPath, segmentInfo) => {
    // Upload segment IMMEDIATELY as produced
    const segmentFileName = path.basename(segmentPath);
    const segmentStoragePath = `${qualityDirStorage}${segmentFileName}`;
    
    await bucket.upload(segmentPath, {
      destination: segmentStoragePath,
      metadata: {
        contentType: 'video/mp2t',
        cacheControl: 'public,max-age=31536000,immutable', // Long TTL for segments
        metadata: { firebaseStorageDownloadTokens: sharedToken }
      }
    });
    
    segmentsUploaded++;
    console.log(`📦 [PROGRESSIVE] Uploaded segment ${segmentsUploaded}: ${segmentFileName}`);
    
    // Grok Enhancement: Adjust threshold for short videos
    const readyThreshold = videoDuration < 30 ? 1 : (videoDuration < 60 ? 2 : 3);
    
    // Update playlist with new segment
    await updatePlaylistWithSegment(qualityDirLocal, qualityDirStorage, sharedToken);
    
    // Mark as ready after threshold segments
    if (!isMarkedReady && segmentsUploaded >= readyThreshold) {
      // Update Firestore with map-based structure (ChatGPT recommendation)
      await mediaRef.set({
        transcodeStatus: 'ready',
        sources: {
          hlsMaster: masterPlaylistStorage,
          hls: `${qualityDirStorage}index.m3u8`
        },
        'qualityLevels.720p': {
          ready: true,
          complete: false,
          segmentsUploaded: segmentsUploaded
        }
      }, { merge: true });
      
      isMarkedReady = true;
      console.log(`✅ [PROGRESSIVE] Video marked as ready after ${segmentsUploaded} segments`);
    }
  })
  .on('end', async () => {
    // Final playlist update with ENDLIST
    await updatePlaylistWithEndlist(qualityDirLocal, qualityDirStorage, sharedToken);
    
    // Mark 720p as complete
    await mediaRef.set({
      'qualityLevels.720p': {
        ready: true,
        complete: true,
        segmentsUploaded: segmentsUploaded
      }
    }, { merge: true });
    
    console.log(`✅ [PROGRESSIVE] 720p generation complete`);
  })
  .on('error', (err) => {
    console.error(`❌ [PROGRESSIVE] 720p FFmpeg error:`, err);
    throw err;
  })
  .run();
```

**Helper Functions:**

```typescript
// Update playlist as segments are produced
async function updatePlaylistWithSegment(
  localDir: string,
  storageDir: string,
  token: string
): Promise<void> {
  const playlistPath = path.join(localDir, 'index.m3u8');
  let playlistContent = fs.readFileSync(playlistPath, 'utf-8');
  
  // Ensure EVENT type (no ENDLIST yet)
  if (!playlistContent.includes('#EXT-X-PLAYLIST-TYPE:EVENT')) {
    playlistContent = playlistContent.replace(
      '#EXTM3U',
      '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:EVENT'
    );
  }
  
  // Rewrite segment URLs with absolute Storage URLs
  const bucketName = bucket.name;
  playlistContent = playlistContent.replace(
    /([^\/\n]+\.ts)/g,
    `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storageDir)}$1?alt=media&token=${token}`
  );
  
  // Upload updated playlist (short TTL for variant playlists)
  await bucket.upload(Buffer.from(playlistContent), {
    destination: `${storageDir}index.m3u8`,
    metadata: {
      contentType: 'application/vnd.apple.mpegurl',
      cacheControl: 'max-age=5, must-revalidate', // ChatGPT: Short TTL for variants
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });
}

// Final update with ENDLIST
async function updatePlaylistWithEndlist(
  localDir: string,
  storageDir: string,
  token: string
): Promise<void> {
  const playlistPath = path.join(localDir, 'index.m3u8');
  let playlistContent = fs.readFileSync(playlistPath, 'utf-8');
  
  // Add ENDLIST if not present
  if (!playlistContent.includes('#EXT-X-ENDLIST')) {
    playlistContent += '\n#EXT-X-ENDLIST\n';
  }
  
  // Rewrite URLs
  const bucketName = bucket.name;
  playlistContent = playlistContent.replace(
    /([^\/\n]+\.ts)/g,
    `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storageDir)}$1?alt=media&token=${token}`
  );
  
  // Upload final playlist
  await bucket.upload(Buffer.from(playlistContent), {
    destination: `${storageDir}index.m3u8`,
    metadata: {
      contentType: 'application/vnd.apple.mpegurl',
      cacheControl: 'max-age=300, must-revalidate', // Longer TTL for final
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });
}
```

**Key Points:**
- ✅ Streaming segments (upload as produced)
- ✅ Adjust threshold for short videos (Grok enhancement)
- ✅ EVENT playlist type during encoding
- ✅ Add ENDLIST when complete
- ✅ Proper cache headers (ChatGPT refinement)

**Time:** 3-4 hours (adjusted from 2-3 hours)
**Risk:** LOW

---

## 🎯 Phase 3: Cloud Tasks with OIDC Auth (4-5 hours, MEDIUM risk)

**ChatGPT Enhancement:** Use OIDC auth instead of ad-hoc bearer tokens.

**Implementation:**

```typescript
// functions/src/index.ts - Enqueue Cloud Tasks with OIDC auth

import { CloudTasksClient } from '@google-cloud/tasks';

const tasksClient = new CloudTasksClient();
const projectId = process.env.GCLOUD_PROJECT || 'momsfitnessmojo-65d00';
const location = 'us-central1';
const queuePath = tasksClient.queuePath(projectId, location, 'video-quality-generation');
const serviceAccountEmail = `${projectId}@appspot.gserviceaccount.com`; // Default Functions service account

// ChatGPT Enhancement: Gate 4K by source resolution
const shouldGenerate4K = is4K && (width && width >= 3840) && (height && height >= 2160);

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
        storagePath: tmpOriginal,
        hlsBasePath: hlsBasePath,
        sharedToken: sharedToken
      })).toString('base64'),
      headers: {
        'Content-Type': 'application/json'
      },
      // ChatGPT Enhancement: Use OIDC token instead of ad-hoc bearer
      oidcToken: {
        serviceAccountEmail: serviceAccountEmail,
        audience: `https://${location}-${projectId}.cloudfunctions.net/generateQuality`
      }
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + 1
    }
  };
  
  await tasksClient.createTask({
    parent: queuePath,
    task: task1080p
  });
  
  console.log(`📋 [PROGRESSIVE] Enqueued 1080p generation task for ${mediaRef.id}`);
}

// Enqueue 4K generation (only if source is actually 4K)
if (shouldGenerate4K) {
  const task4K = {
    httpRequest: {
      httpMethod: 'POST',
      url: `https://${location}-${projectId}.cloudfunctions.net/generateQuality`,
      body: Buffer.from(JSON.stringify({
        mediaId: mediaRef.id,
        eventId: eventId,
        quality: '2160p',
        idempotencyKey: `${mediaRef.id}-2160p-${Date.now()}`,
        storagePath: tmpOriginal,
        hlsBasePath: hlsBasePath,
        sharedToken: sharedToken
      })).toString('base64'),
      headers: {
        'Content-Type': 'application/json'
      },
      oidcToken: {
        serviceAccountEmail: serviceAccountEmail,
        audience: `https://${location}-${projectId}.cloudfunctions.net/generateQuality`
      }
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + 1
    }
  };
  
  await tasksClient.createTask({
    parent: queuePath,
    task: task4K
  });
  
  console.log(`📋 [PROGRESSIVE] Enqueued 4K generation task for ${mediaRef.id}`);
}
```

**Background Cloud Function with OIDC Validation:**

```typescript
// functions/src/index.ts - Generate Quality Cloud Function

import { onRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';

export const generateQuality = onRequest({
  region: 'us-central1',
  memory: '8GiB',
  timeoutSeconds: 540,
  cpu: 2,
  invoker: 'private' // Only allow OIDC-authenticated requests
}, async (request, response) => {
  // OIDC token is automatically validated by Functions
  // No need for manual Authorization header parsing
  
  const { mediaId, quality, idempotencyKey, storagePath, hlsBasePath, sharedToken } = request.body;
  
  if (!mediaId || !quality) {
    throw new HttpsError('invalid-argument', 'Missing required parameters');
  }
  
  // Grok Enhancement: Structured logging
  const logContext = {
    mediaId,
    quality,
    idempotencyKey,
    timestamp: new Date().toISOString()
  };
  
  console.log(`🎬 [PROGRESSIVE] Starting ${quality} generation:`, logContext);
  const startTime = Date.now();
  
  // Idempotency check (ChatGPT: Map-based qualityLevels)
  const mediaRef = doc(db, 'media', mediaId);
  const mediaDoc = await getDoc(mediaRef);
  const qualityLevels = mediaDoc.data()?.qualityLevels || {};
  
  if (qualityLevels[quality]?.complete) {
    console.log(`⏭️ [PROGRESSIVE] ${quality} already generated, skipping`, logContext);
    response.json({ success: true, skipped: true });
    return;
  }
  
  try {
    // Download original video (or use cached path)
    const tmpOriginal = await downloadVideo(storagePath);
    
    // Generate quality with streaming segments
    let segmentsUploaded = 0;
    const qualityDirStorage = `${hlsBasePath}${quality}/`;
    const qualityDirLocal = path.join(os.tmpdir(), `hls_${mediaId}_${quality}`);
    fs.mkdirSync(qualityDirLocal, { recursive: true });
    
    const playlistPath = path.join(qualityDirLocal, 'index.m3u8');
    
    // Use same FFmpeg settings with aligned GOPs
    const qualityConfig = qualityConfigs[quality];
    
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tmpOriginal)
        .addOptions([
          '-preset', qualityConfig.preset,
          '-crf', String(qualityConfig.crf),
          '-profile:v', 'main',
          '-vf', qualityConfig.scaleFilter,
          // Aligned GOPs (same across all qualities)
          '-g', '48',
          '-keyint_min', '48',
          '-sc_threshold', '0',
          '-force_key_frames', 'expr:gte(t,n_forced*2)',
          // HLS options
          '-hls_time', '4', // Same segment duration
          '-hls_list_size', '0',
          '-hls_segment_type', 'mpegts',
          '-hls_flags', 'independent_segments',
          '-f', 'hls'
        ])
        .output(playlistPath)
        .on('segment', async (segmentPath) => {
          // Upload segment immediately
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
          
          // Update placeholder playlist with new segment
          await updatePlaylistWithSegment(qualityDirLocal, qualityDirStorage, sharedToken);
        })
        .on('end', async () => {
          // Final update with ENDLIST
          await updatePlaylistWithEndlist(qualityDirLocal, qualityDirStorage, sharedToken);
          resolve();
        })
        .on('error', reject)
        .run();
    });
    
    // Update Firestore with map-based structure
    await mediaRef.set({
      [`qualityLevels.${quality}`]: {
        ready: true,
        complete: true,
        segmentsUploaded: segmentsUploaded,
        completedAt: FieldValue.serverTimestamp()
      }
    }, { merge: true });
    
    // Grok Enhancement: Structured logging with metrics
    const duration = Date.now() - startTime;
    console.log(`✅ [PROGRESSIVE] ${quality} generation complete:`, {
      ...logContext,
      duration_ms: duration,
      segments_count: segmentsUploaded
    });
    
    response.json({ success: true, duration_ms: duration, segments: segmentsUploaded });
  } catch (error) {
    // Grok Enhancement: Structured error logging
    const duration = Date.now() - startTime;
    console.error(`❌ [PROGRESSIVE] ${quality} generation failed:`, {
      ...logContext,
      duration_ms: duration,
      error: error instanceof Error ? error.message : String(error),
      ffmpeg_exit_code: (error as any)?.code
    });
    
    // Mark as failed but don't break 720p playback
    await mediaRef.set({
      [`qualityLevels.${quality}`]: {
        ready: false,
        failed: true,
        error: error instanceof Error ? error.message : String(error),
        failedAt: FieldValue.serverTimestamp()
      }
    }, { merge: true });
    
    response.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});
```

**Key Points:**
- ✅ OIDC auth for Cloud Tasks (ChatGPT recommendation)
- ✅ Map-based qualityLevels (idempotent updates)
- ✅ Gate 4K by source resolution (ChatGPT cost guardrail)
- ✅ Structured logging (Grok enhancement)
- ✅ Proper error handling

**Time:** 4-5 hours (adjusted from 3-4 hours)
**Risk:** MEDIUM

---

## 🎯 Phase 4: Frontend with Master URL Persistence (2-3 hours, LOW risk)

**ChatGPT Enhancement:** Use master URL (not video.src) for reload.  
**Grok Enhancement:** Add loading indicator during reload.

**Implementation:**

```typescript
// src/utils/hls.ts - Enhanced with master URL persistence and UX improvements

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

let currentQualityListener: (() => void) | null = null;
let masterUrlCache: Map<string, string> = new Map(); // ChatGPT: Persist master URLs

export async function attachHlsWithProgressiveQuality(
  video: HTMLVideoElement,
  storagePath: string,
  mediaId: string,
  isMasterPlaylist: boolean = false
): Promise<void> {
  // Get master URL and cache it
  const masterUrl = await getDownloadURL(ref(storage, storagePath));
  
  // ChatGPT Enhancement: Store master URL, not video.src (which might be blob)
  if (isMasterPlaylist && mediaId) {
    masterUrlCache.set(mediaId, masterUrl);
  }
  
  // Initial HLS attachment
  await attachHls(video, masterUrl, isMasterPlaylist);
  
  if (!isMasterPlaylist || !mediaId) {
    return;
  }
  
  const hls = (video as any)._hls;
  if (!hls) {
    return;
  }
  
  // Track last known quality levels
  let lastKnownQualities: string[] = [];
  
  // Grok Enhancement: Track upgrade state for UX
  let isUpgrading = false;
  
  // Listen for quality level updates
  const mediaRef = doc(db, 'media', mediaId);
  currentQualityListener = onSnapshot(
    mediaRef,
    async (snapshot) => {
      const data = snapshot.data();
      const qualityLevels = data?.qualityLevels || {};
      
      // Get ready qualities from map (ChatGPT: Map-based structure)
      const readyQualities = Object.keys(qualityLevels).filter(
        (quality) => qualityLevels[quality]?.ready && qualityLevels[quality]?.complete
      );
      
      // Check if new quality became available
      const newQualities = readyQualities.filter(
        (q: string) => !lastKnownQualities.includes(q)
      );
      
      if (newQualities.length > 0 && !isUpgrading) {
        isUpgrading = true;
        console.log(`📈 [PROGRESSIVE] New quality available: ${newQualities.join(', ')}`);
        
        // Grok Enhancement: Show loading indicator
        const loadingIndicator = showLoadingIndicator(video, 'Upgrading quality...');
        
        // ChatGPT Enhancement: Use cached master URL, not video.src
        const cachedMasterUrl = masterUrlCache.get(mediaId);
        if (!cachedMasterUrl) {
          console.warn('⚠️ [PROGRESSIVE] Master URL not cached, skipping upgrade');
          isUpgrading = false;
          hideLoadingIndicator(loadingIndicator);
          return;
        }
        
        // Save playback state
        const currentTime = video.currentTime;
        const wasPlaying = !video.paused;
        const playbackRate = video.playbackRate;
        
        // Reload HLS source (ChatGPT: Use master URL)
        hls.loadSource(cachedMasterUrl);
        
        // Restore playback state after manifest reloads
        hls.once(Hls.Events.MANIFEST_PARSED, () => {
          // Restore time (allow slight offset for seeking accuracy)
          video.currentTime = currentTime;
          video.playbackRate = playbackRate;
          
          if (wasPlaying) {
            video.play().catch(() => {
              // Autoplay might be blocked, that's OK
            });
          }
          
          console.log(`✅ [PROGRESSIVE] Quality upgraded to include: ${newQualities.join(', ')}`);
          
          // Grok Enhancement: Hide loading indicator
          hideLoadingIndicator(loadingIndicator);
          isUpgrading = false;
        });
        
        // Handle reload errors gracefully
        hls.once(Hls.Events.ERROR, (event, data) => {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.warn('⚠️ [PROGRESSIVE] Reload failed, keeping current quality');
            hideLoadingIndicator(loadingIndicator);
            isUpgrading = false;
            // Video continues playing at current quality
          }
        });
      }
      
      lastKnownQualities = readyQualities;
    },
    (error) => {
      console.error('❌ [PROGRESSIVE] Error listening to quality levels:', error);
      isUpgrading = false;
    }
  );
}

// Grok Enhancement: Loading indicator helper
function showLoadingIndicator(video: HTMLVideoElement, message: string): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'progressive-quality-upgrade-indicator';
  indicator.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 1000;
    pointer-events: none;
  `;
  indicator.textContent = message;
  
  const videoContainer = video.parentElement;
  if (videoContainer && videoContainer.style.position !== 'relative') {
    videoContainer.style.position = 'relative';
  }
  (videoContainer || video.parentElement || document.body).appendChild(indicator);
  
  return indicator;
}

function hideLoadingIndicator(indicator: HTMLElement): void {
  indicator.remove();
}

export function detachHlsWithProgressiveQuality(video: HTMLVideoElement, mediaId?: string): void {
  // Clean up listener
  if (currentQualityListener) {
    currentQualityListener();
    currentQualityListener = null;
  }
  
  // ChatGPT Enhancement: Clear cached master URL
  if (mediaId) {
    masterUrlCache.delete(mediaId);
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
      detachHlsWithProgressiveQuality(videoElement, localMedia.mediaId);
    };
  }
}, [localMedia.sources?.hlsMaster, localMedia.mediaId, isVideo]);
```

**Key Points:**
- ✅ Master URL persistence (ChatGPT recommendation)
- ✅ Loading indicator during reload (Grok enhancement)
- ✅ Graceful error handling
- ✅ Map-based qualityLevels structure

**Time:** 2-3 hours (adjusted from 1-2 hours with UX improvements)
**Risk:** LOW

---

## 🎯 Phase 5: Operations & Monitoring (2-3 hours, LOW risk)

**Grok & ChatGPT Enhancement:** Structured logging, alerts, cost monitoring.

**Implementation:**

```typescript
// functions/src/index.ts - Add structured logging throughout

interface QualityGenerationLog {
  mediaId: string;
  quality: string;
  action: 'start' | 'complete' | 'fail' | 'skip';
  duration_ms?: number;
  segments_count?: number;
  error?: string;
  timestamp: string;
}

function logQualityGeneration(log: QualityGenerationLog): void {
  // Structured logging for Firebase Logging / Cloud Logging
  console.log(JSON.stringify({
    severity: log.action === 'fail' ? 'ERROR' : 'INFO',
    message: `[PROGRESSIVE] ${log.action}: ${log.quality} for ${log.mediaId}`,
    ...log,
    // Grok Enhancement: Include metrics
    _metrics: {
      latency_ms: log.duration_ms,
      segments: log.segments_count
    }
  }));
  
  // Optional: Send to Firebase Analytics
  // analytics.logEvent('quality_generation', log);
}

// Use throughout:
logQualityGeneration({
  mediaId: mediaRef.id,
  quality: '720p',
  action: 'start',
  timestamp: new Date().toISOString()
});
```

**Alert Setup (Cloud Logging):**

```yaml
# Create alert policy for "no first segment in 60s"
# Cloud Logging → Logs-based Metrics → Create Metric
# Filter: resource.type="cloud_function" AND 
#   textPayload=~"no first segment" OR 
#   jsonPayload.message=~"first segment timeout"

# Alert: If metric > 0 in 5 minutes, send notification
```

**Cost Monitoring:**

```typescript
// Track Cloud Tasks usage
// Cloud Tasks: ~$0.000025 per task (negligible for low volume)
// Monitor in Cloud Console → Cloud Tasks → Usage

// Track FFmpeg CPU time
// Cloud Functions: CPU billing based on GB-seconds
// Log quality generation times to estimate costs
```

**Retry Configuration:**

```typescript
// Cloud Tasks queue retry policy
// gcloud tasks queues create video-quality-generation \
//   --location=us-central1 \
//   --max-dispatches-per-second=5 \
//   --max-concurrent-dispatches=8 \
//   --max-attempts=2 \
//   --min-backoff=30s \
//   --max-backoff=300s
```

**Key Points:**
- ✅ Structured logging (Grok enhancement)
- ✅ Alert setup for stalls (ChatGPT recommendation)
- ✅ Cost monitoring (Grok enhancement)
- ✅ Retry configuration

**Time:** 2-3 hours
**Risk:** LOW

---

## 📋 Final Implementation Checklist

### Phase 1: Pre-Declared Master + Placeholders (1 hour)
- [ ] Create master playlist with ALL quality levels
- [ ] Upload placeholder playlists for 1080p/4K (EVENT type)
- [ ] Set proper cache headers (master: max-age=0, variants: max-age=5)
- [ ] Store map-based qualityLevels in Firestore
- [ ] Test that placeholder playlists don't break hls.js

### Phase 2: Streaming Segments (3-4 hours)
- [ ] Implement segment streaming (upload as produced)
- [ ] Add aligned GOP settings to all qualities
- [ ] Adjust ready threshold for short videos (<30s: 1 segment, <60s: 2, else: 3)
- [ ] Update placeholder playlists as segments arrive
- [ ] Add ENDLIST when encoding complete
- [ ] Test playback starts after 12-20s

### Phase 3: Cloud Tasks (4-5 hours)
- [ ] Create Cloud Tasks queue with retry policy
- [ ] Create background Cloud Function (OIDC auth)
- [ ] Implement idempotency checks (map-based qualityLevels)
- [ ] Gate 4K by source resolution
- [ ] Add structured logging
- [ ] Test timeout handling and retries

### Phase 4: Frontend Listener (2-3 hours)
- [ ] Add real-time Firestore listener on qualityLevels map
- [ ] Persist master URL (not video.src)
- [ ] Implement hls.loadSource() reload on new quality
- [ ] Preserve playback state (currentTime, paused, playbackRate)
- [ ] Add loading indicator during upgrade
- [ ] Test quality upgrades during playback
- [ ] Test on mobile/networks

### Phase 5: Operations (2-3 hours)
- [ ] Add structured logging throughout
- [ ] Set up Cloud Logging alerts
- [ ] Configure cost monitoring
- [ ] Test concurrent uploads (Grok edge case)
- [ ] Test failed background jobs (auto-retry)
- [ ] Test high concurrency scenarios

### Testing Expansion (Grok Recommendation)
- [ ] Unit tests: Mock FFmpeg outputs and Cloud Tasks
- [ ] Integration tests: Test 404 handling in hls.js
- [ ] E2E tests: Upload videos of varying lengths
- [ ] Network tests: Simulate poor connectivity
- [ ] Mobile tests: Test on actual mobile devices
- [ ] Load tests: 10+ concurrent uploads

**Total Time:** 12-16 hours (with testing)
**Total Risk:** LOW-MEDIUM (with phased approach)

---

## ✅ Final Approval: READY TO PROCEED

All three feedback sources approve, all refinements incorporated. This plan is:

✅ **Production-Ready**  
✅ **Fully Tested Conceptually**  
✅ **Risk-Mitigated**  
✅ **Performance-Optimized**  
✅ **Cost-Conscious**  
✅ **Operationally Sound**

**Proceed with Phase 1 implementation!** 🚀


