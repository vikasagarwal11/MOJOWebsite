# 📋 Moms Fitness Mojo - Project Backlog

*Last Updated: November 4, 2025*

## 🎯 Project Overview

This backlog tracks all planned features, improvements, and technical tasks for the Moms Fitness Mojo community website. Items are prioritized by impact and urgency.

---

## 🚀 High Priority (P0)

### 🔧 Critical Fixes
- [ ] **Fix Circular Import Error** - Resolve "Cannot access 'S' before initialization" error in production
  - *Status*: ✅ Completed - Converted components to function declarations
  - *Impact*: Critical - Prevents app crashes
  - *Effort*: 2 hours

### 🌐 SEO & Discoverability
- [ ] **Decide Event Page Architecture** - Choose between modal-only vs individual event pages
  - *Status*: Pending
  - *Impact*: High - Affects SEO and social sharing
  - *Effort*: 4 hours
  - *Dependencies*: None

- [ ] **Create Individual Event Pages** - Build dedicated pages for each event
  - *Status*: Pending
  - *Impact*: High - Enables proper SEO and social sharing
  - *Effort*: 8 hours
  - *Dependencies*: Event page architecture decision

- [ ] **Integrate EventSeo Component** - Add SEO optimization to event pages
  - *Status*: Pending
  - *Impact*: High - Improves search engine visibility
  - *Effort*: 4 hours
  - *Dependencies*: Individual event pages created

---

## 📈 Medium Priority (P1)

### 🔗 URL & Domain Management
- [ ] **Update Production URLs** - Change from momfitnessmojo.firebaseapp.com to momfitnessmojo.web.app
  - *Status*: Pending
  - *Impact*: Medium - Brand consistency
  - *Effort*: 2 hours
  - *Dependencies*: None

- [ ] **Add Event Slug Support** - Create SEO-friendly URLs (/events/event-slug)
  - *Status*: Pending
  - *Impact*: Medium - Better SEO and user experience
  - *Effort*: 6 hours
  - *Dependencies*: Individual event pages

- [ ] **Update Canonical URLs** - Fix EventSeo component for production domain
  - *Status*: Pending
  - *Impact*: Medium - Prevents duplicate content issues
  - *Effort*: 1 hour
  - *Dependencies*: Production URL update

### 🎨 User Experience
- [ ] **Client-Side Video Thumbnail Extraction** - Instant thumbnails for uploaded videos
  - *Status*: Planned
  - *Impact*: High - Eliminates blank cards during video processing
  - *Effort*: 6 hours
  - *Dependencies*: None
  - *Description*: Extract video frame client-side using canvas API, store in IndexedDB, display instantly until server poster is ready. Eliminates 3-second blank card gap for better UX like TikTok/YouTube.

#### 📋 **Client-Side Thumbnail - Technical Specification**

**Problem:**
- Currently, video uploads show blank cards for ~3 seconds while Cloud Function generates poster
- Poor user experience compared to platforms like YouTube/TikTok
- Users see no visual feedback during processing

**Solution:**
- Extract thumbnail frame from video file in browser before upload
- Store in IndexedDB (client-side only, never sent to server)
- Display immediately, replaced by server poster when ready
- Auto-delete client thumbnail after server poster arrives

**Implementation Files:**
1. `src/utils/extractVideoThumbnail.ts` - Canvas-based frame extraction with Safari workarounds
2. `src/utils/clientThumbnailStorage.ts` - IndexedDB wrapper for local storage
3. `src/hooks/useUploader.ts` - Modified to extract thumbnail after document creation
4. `src/components/media/MediaCard.tsx` - Updated to load client thumbnail from IndexedDB

**Benefits:**
- ✅ **Zero Blank Cards**: Instant visual feedback
- ✅ **Privacy Safe**: Client-side only, never in Firestore
- ✅ **No Document Size Issues**: Doesn't affect Firestore documents
- ✅ **Progressive Enhancement**: Client thumbnail → Server poster seamless transition
- ✅ **Safari Compatible**: Includes currentTime quirks workaround
- ✅ **Graceful Degradation**: Falls back to blank if extraction fails

**User Flow:**
```
Upload → Extract thumbnail → Store IndexedDB → Display instantly
  ↓
[3 seconds]
  ↓  
Server poster ready → Replace client thumbnail → Delete IndexedDB entry
```

**Codex Assessment Alignment:**
- ✅ No Firestore persistence (avoids document size issues)
- ✅ Safari currentTime retry logic included
- ✅ Client-side only (privacy safe)
- ✅ JPEG compression (70% quality for smaller size)
- ✅ Error handling with null fallback
- ✅ IndexedDB cleanup after server poster arrives

- [ ] **Add View Details Buttons** - Link event cards to individual pages
  - *Status*: Pending
  - *Impact*: Medium - Better navigation
  - *Effort*: 3 hours
  - *Dependencies*: Individual event pages

- [ ] **Update Social Sharing** - Point to individual event pages instead of modals
  - *Status*: Pending
  - *Impact*: Medium - Better social media presence
  - *Effort*: 2 hours
  - *Dependencies*: Individual event pages

### 🛠️ Technical Infrastructure
- [ ] **Remove Hardcoded Production Storage Bucket Values** - Make storage bucket environment-agnostic
  - *Status*: Reviewing proposal
  - *Impact*: High - Fixes cross-environment deployment issues
  - *Effort*: 4 hours
  - *Dependencies*: None
  - *Description*: Currently using hardcoded production bucket 'momsfitnessmojo-65d00.firebasestorage.app' that breaks in non-prod environments

#### 📋 **Storage Bucket Hardcoding Issue - Technical Analysis**

**Current Problem:**
- Hardcoded production bucket: `'momsfitnessmojo-65d00.firebasestorage.app'` in 3 locations (Lines 652, 781, 814)
- Causes failures in non-prod environments (dev, staging)
- Storage triggers skip files when bucket doesn't match hardcoded value

**Cursor AI Proposed Fix:**

**1. Use `object.bucket` from Storage Events (Lines 781, 814)**
```typescript
// ❌ CURRENT (Hardcoded - Only works in prod):
const bucketName = process.env.STORAGE_BUCKET || 'momsfitnessmojo-65d00.firebasestorage.app';
const bucket = getStorage().bucket(bucketName);

// ✅ PROPOSED (Environment-aware - Works everywhere):
const bucketName = process.env.STORAGE_BUCKET || object.bucket;
const bucket = getStorage().bucket(bucketName);
```
**Rationale**: Storage events include `object.bucket` which automatically matches the source bucket.

**2. Remove or Make Bucket Validation Agnostic (Lines 780-785)**
```typescript
// Option A: Remove check entirely (since trigger only fires for project bucket)
// No bucket validation needed

// Option B: Keep but make it environment-aware
const expectedBucket = process.env.STORAGE_BUCKET ?? object.bucket;
if (object.bucket !== expectedBucket) {
  console.log(`⏭️ Unexpected bucket: ${object.bucket}, expected: ${expectedBucket}`);
  return;
}
```

**3. Handle Firestore-Triggered Cleanup (Line 652)**
```typescript
// ❌ CURRENT (Hardcoded):
const bucketName = process.env.STORAGE_BUCKET || 'momsfitnessmojo-65d00.firebasestorage.app';

// ✅ PROPOSED (Require env var for Firestore triggers):
const bucketName = process.env.STORAGE_BUCKET;
if (!bucketName) {
  console.error('❌ STORAGE_BUCKET env var not set for deletion cleanup');
  return;
}
```
**Rationale**: No `object.bucket` available in Firestore triggers, so require explicit env var.

**4. Additional Optimization: Initialize Bucket in Admin App**
```typescript
// In main initialization (line ~22):
initializeApp({
  storageBucket: process.env.STORAGE_BUCKET // Auto-detected by default
});
```
This makes `getStorage().bucket()` default to the right bucket everywhere.

**Recommendation Assessment:**

✅ **Adopt Immediately:**
- Use `object.bucket` as fallback (lines 781, 814) - Low risk, high value
- Remove hardcoded production value - Single source of truth
- Require STORAGE_BUCKET env var for Firestore cleanup (line 652) - Explicit is better than magic

⚠️ **Consider Carefully:**
- Keep bucket validation guard but make it environment-aware - Prevents accidental cross-bucket triggers if you ever add multiple buckets
- Compare against `process.env.STORAGE_BUCKET ?? object.bucket` - Only blocks when explicit env differs

✅ **Benefits:**
- ✅ Single codebase across all environments (dev/staging/prod)
- ✅ No hardcoded production values
- ✅ Works automatically with correct bucket per environment
- ✅ Prevents skipped files due to bucket mismatch
- ✅ Better error messaging when env vars missing

**Implementation Order:**
1. Line 814: Change to `object.bucket` fallback (media processing)
2. Line 781: Update bucket validation or remove check
3. Line 652: Require env var for Firestore cleanup
4. Optional: Initialize bucket in admin app config

- [ ] **Set Up Event Routing** - Configure React Router for individual events
  - *Status*: Pending
  - *Impact*: Medium - Required for individual pages
  - *Effort*: 4 hours
  - *Dependencies*: Individual event pages

- [x] **Progressive Quality Generation** - Enable 30-60s initial playback vs current 5-6min wait
  - *Status*: ✅ Completed - November 4, 2025
  - *Impact*: High - 10x improvement in user experience
  - *Effort*: 8-12 hours (actual: 10 hours)
  - *Dependencies*: Current adaptive streaming implementation
  - *Description*: ✅ COMPLETED - Implemented three-phase progressive quality generation: Phase 1 (pre-declared master playlist), Phase 2 (streaming segments), Phase 3 (background Cloud Tasks). Videos now start playing after 12-20 seconds (3-5 segments) instead of 5-6 minutes. Higher qualities generate in background automatically.
  - *Documentation*: See UNIFIED_PROGRESSIVE_QUALITY_PLAN.md, PROGRESSIVE_MEDIA_IMPLEMENTATION_SUMMARY.md

### 🎬 Progressive Media Enhancements (Post-Implementation)
*Based on Grok & ChatGPT feedback review - November 4, 2025*

#### 🔴 Critical Priority (P0) - Implement This Week
- [ ] **Add Bandwidth Threshold for HLS Reloads** - Prevent unnecessary buffering during quality upgrades
  - *Status*: Planned
  - *Impact*: High - Improves network variability handling
  - *Effort*: 2-3 hours
  - *Dependencies*: Current HLS.js integration
  - *Description*: Only reload HLS source if bandwidth > current quality's bitrate. Prevents buffering on slow networks when higher quality becomes available. Source: Grok feedback - HLS.js Integration edge case.
  - *Code Location*: `src/utils/hls.ts` or `src/components/media/MediaCard.tsx`

- [ ] **Use Firestore Transactions for Concurrent Updates** - Prevent contention in high-write scenarios
  - *Status*: Pending Implementation
  - *Impact*: High - Prevents race conditions
  - *Effort*: 3-4 hours
  - *Dependencies*: Current Firestore merge logic
  - *Description*: Replace manual merge with Firestore transactions for atomic source updates. Prevents contention when multiple quality updates happen simultaneously. Current code uses manual merge (lines 1322-1365) which could have race conditions. Source: Grok feedback - Firestore Updates concern.
  - *Code Location*: `functions/src/index.ts` (lines 1322-1365 in `onMediaFileFinalize`)
  - *Implementation Notes*: Replace `mediaRef.set()` with `db.runTransaction()` for atomic updates. Ensure cleanup is called if document is deleted during transaction.

- [ ] **Add Dead-Letter Queue for Cloud Tasks** - Improve debugging visibility for failed tasks
  - *Status*: Planned
  - *Impact*: Medium - Better error visibility
  - *Effort*: 1 hour
  - *Dependencies*: Cloud Tasks queue setup
  - *Description*: Configure dead-letter queue in Cloud Tasks to capture and debug failed quality generation tasks. Source: Grok feedback - Cloud Tasks limitation.
  - *Configuration*: `gcloud tasks queues update video-quality-generation --dead-letter-queue=...`

- [ ] **Add Partial Failure Notifications** - Alert admins when higher qualities fail
  - *Status*: Pending Implementation
  - *Impact*: Medium - Better monitoring
  - *Effort*: 2-3 hours
  - *Dependencies*: Pub/Sub topic setup
  - *Description*: Publish Pub/Sub event when higher qualities fail but lower qualities succeed. Currently only logs warnings. When 1080p succeeds but 4K fails, admins should be notified to investigate. Source: Grok feedback - Error Handling gap.
  - *Code Location*: `functions/src/index.ts` (after line 1260 in `onMediaFileFinalize`, after 720p critical check)
  - *Implementation Notes*: Check if `qualityResults.length < qualityLevels.length`, identify failed qualities, publish Pub/Sub event with details. Consider creating `media-quality-failures` topic.

#### 🟡 Important Priority (P1) - Implement Next Week
- [ ] **Add Upgrade Indicators (Toast Notifications)** - Show users when quality upgrades
  - *Status*: Planned
  - *Impact*: Medium - Better UX transparency
  - *Effort*: 2 hours
  - *Dependencies*: Toast notification library
  - *Description*: Show subtle toast notification when higher quality becomes available. Improves user awareness of quality upgrades. Source: Grok feedback - UX Improvement.
  - *Code Location*: `src/components/media/MediaCard.tsx`

- [ ] **Add Manual Quality Selector** - Give users control over quality selection
  - *Status*: Planned
  - *Impact*: High - YouTube-level feature
  - *Effort*: 3-4 hours
  - *Dependencies*: HLS.js levels API
  - *Description*: Expose HLS.js levels API for manual quality selection. Users on poor networks can force lower quality, users on good networks can force higher quality. Source: Grok feedback - UX Improvement.
  - *Code Location*: `src/components/media/MediaCard.tsx` or `src/utils/hls.ts`

- [ ] **Batch Deletions for Large HLS Folders** - Prevent timeouts for long videos
  - *Status*: Planned
  - *Impact*: Medium - Handles edge cases
  - *Effort*: 2 hours
  - *Dependencies*: Current storage cleanup logic
  - *Description*: Delete HLS folders in batches (100 files at a time) to prevent timeouts for long videos with many segments. Source: Grok feedback - Storage Cleanup edge case.
  - *Code Location*: `functions/src/index.ts` (onMediaDeletedCleanup function)

- [ ] **Add FFmpeg Health Checks** - Validate encoding success
  - *Status*: Planned
  - *Impact*: Medium - Better error detection
  - *Effort*: 2 hours
  - *Dependencies*: Current FFmpeg processing
  - *Description*: Validate playlist segments post-encoding to detect FFmpeg crashes or incomplete encoding. Source: Grok feedback - Error Handling gap.
  - *Code Location*: `functions/src/index.ts` (after FFmpeg completes)

- [ ] **Add Exponential Backoff to Retries** - Smarter retry logic
  - *Status*: Planned
  - *Impact*: Medium - Better reliability
  - *Effort*: 1-2 hours
  - *Dependencies*: Current retry logic
  - *Description*: Add exponential backoff to our own retry logic (Cloud Tasks already has it). Prevents retry storms. Source: Grok feedback - Error Handling improvement.
  - *Code Location*: `functions/src/index.ts`

- [ ] **Add Storage Lifecycle Rules** - Auto-cleanup of old files
  - *Status*: Planned
  - *Impact*: Low - Cost optimization
  - *Effort*: 1 hour
  - *Dependencies*: Storage bucket configuration
  - *Description*: Configure Storage lifecycle rules to auto-delete old HLS folders after 30 days. Prevents orphaned files from accumulating. Source: Grok feedback - Storage Cleanup optimization.
  - *Configuration*: `storage.rules` or `gcloud` command

- [ ] **Add Enhanced Error Metrics/Reporting** - Track failure rates and patterns
  - *Status*: Pending Implementation
  - *Impact*: Low - Data-driven improvements
  - *Effort*: 2-3 hours
  - *Dependencies*: Current error handling
  - *Description*: Track failure metrics for analytics: which qualities fail most often, timeout frequency by quality, video characteristics (size, resolution, duration). Currently only logs errors but doesn't track patterns. Would enable data-driven improvements.
  - *Code Location*: `functions/src/index.ts` (after quality processing, could use Firestore analytics collection or external service)
  - *Implementation Notes*: Create `media_processing_metrics` collection or use Firebase Analytics. Track: quality name, timeout status, video duration, resolution, file size, timestamp.

#### 🟢 Nice-to-Have Priority (P2) - Future Enhancements
- [ ] **Pseudo-Live HLS Configuration** - Reduce pauses during reloads
  - *Status*: Future
  - *Impact*: Low - Minor UX improvement
  - *Effort*: 2-3 hours (needs testing)
  - *Dependencies*: Current HLS.js config
  - *Description*: Configure HLS.js as pseudo-live with `liveSyncDurationCount: 3` to enable periodic manifest refreshes. Could reduce pauses during quality upgrades. Source: Grok feedback - HLS.js optimization.
  - *Code Location*: `src/utils/hls.ts`

- [ ] **Add Performance Metrics Table to Docs** - Documentation improvement
  - *Status*: Future
  - *Impact*: Low - Documentation clarity
  - *Effort*: 30 minutes
  - *Dependencies*: PROGRESSIVE_MEDIA_IMPLEMENTATION_SUMMARY.md
  - *Description*: Add performance metrics table (Before/After/Goal/Status) to summary documentation. Source: ChatGPT feedback - Documentation gap.

- [ ] **Add Cross-Reference IDs to Docs** - Easier code navigation
  - *Status*: Future
  - *Impact*: Low - Documentation clarity
  - *Effort*: 1 hour
  - *Dependencies*: All documentation files
  - *Description*: Add file:line references (e.g., `functions/src/index.ts:1047-1090`) to documentation for easier code navigation. Source: ChatGPT feedback - Documentation gap.

- [ ] **Add Post-Deployment Results Section** - Real production metrics
  - *Status*: Future
  - *Impact*: Low - Documentation completeness
  - *Effort*: 30 minutes
  - *Dependencies*: Production testing
  - *Description*: Add post-deployment results section with real production metrics after testing. Source: ChatGPT feedback - Documentation gap.

- [ ] **Multi-Tab Playback Handling** - Prevent duplicate reloads across tabs
  - *Status*: Future
  - *Impact*: Low - Edge case handling
  - *Effort*: 1-2 hours
  - *Dependencies*: Current real-time listener
  - *Description*: Use sessionStorage to debounce HLS reloads across multiple browser tabs. Prevents duplicate reloads when same video is open in multiple tabs. Source: Grok feedback - HLS.js edge case.
  - *Code Location*: `src/components/media/MediaCard.tsx`

#### 📊 Enhancement Summary
- **Critical (P0)**: 4 items, ~8-10 hours
- **Important (P1)**: 7 items, ~14-18 hours (added Error Metrics)
- **Nice-to-Have (P2)**: 5 items, ~6-8 hours
- **Total**: 16 items, ~28-36 hours
- **Source**: Grok & ChatGPT feedback review (November 4, 2025) + Code review (November 4, 2025)
- **Documentation**: See FEEDBACK_ACTION_ITEMS.md for detailed specifications

#### ✅ Recently Completed (November 4, 2025)
- [x] **Per-Quality Timeout Configuration** - Different timeouts for 720p (5min), 1080p (7min), 4K (12min)
  - *Completed*: November 4, 2025
  - *Code Location*: `functions/src/index.ts` (lines 1145-1149, 1177)
  - *Impact*: Reduces 4K timeouts significantly, faster failure detection for 720p

- [x] **720p Critical Check** - Ensures playback quality exists before marking video as ready
  - *Completed*: November 4, 2025
  - *Code Location*: `functions/src/index.ts` (lines 1255-1260)
  - *Impact*: Prevents "ready" videos that can't play

- [x] **Promise.allSettled Implementation** - Continues with successful qualities even if one fails
  - *Completed*: November 4, 2025
  - *Code Location*: `functions/src/index.ts` (lines 1168-1242)
  - *Impact*: Fixes 4K timeout issue - 720p and 1080p still save even if 4K fails

- [x] **Race Condition Handling** - Prevents recreating deleted documents during processing
  - *Completed*: November 4, 2025
  - *Code Location*: `functions/src/index.ts` (lines 1324-1328)
  - *Impact*: Prevents orphaned files and document recreation

#### 📋 **Progressive Quality Generation - Technical Specification**

**Current Implementation:**
- ✅ Multiple quality generation (720p, 1080p, 4K) in parallel
- ✅ Master playlist creation (`master.m3u8`)
- ✅ Frontend support for adaptive streaming
- ✅ Backward compatibility (fallback to single manifest)

**Required Changes:**
- ⚠️ Change from **parallel** to **sequential** generation
- ⚠️ Mark video as "ready" **before all qualities complete**
- ⚠️ Update master playlist **progressively** (as each quality finishes)

**Implementation Approach:**

**Phase 1: Test Sequential Generation (Zero Risk)**
```typescript
// Generate 720p first, but still wait for all qualities
// Test that sequential works correctly
// Time: 1-2 hours
// Risk: VERY LOW (doesn't change behavior)
```

**Phase 2: Mark Ready After 720p (Feature Flag)**
```typescript
// Add feature flag: ENABLE_PROGRESSIVE_QUALITY
// If flag ON: Mark ready after 720p
// If flag OFF: Keep current behavior (wait for all)
// Time: 1-2 hours
// Risk: LOW (can disable if issues)
```

**Phase 3: Progressive Master Playlist Updates**
```typescript
// Update master playlist as each quality completes
// Time: 1-2 hours
// Risk: LOW-MEDIUM (but Phase 1 & 2 already tested)
```

**Safety Measures:**
- ✅ Feature flag for instant rollback
- ✅ Comprehensive error handling with automatic fallback
- ✅ Backward compatibility (existing videos unaffected)
- ✅ Atomic Firestore updates to prevent race conditions
- ✅ Gradual rollout (10% → 50% → 100%)

**Benefits:**
- ✅ **10x Faster**: 30-60s initial playback vs 5-6min wait
- ✅ **Progressive Enhancement**: Quality upgrades automatically
- ✅ **Low Risk**: Backward compatible, can roll back easily
- ✅ **Manageable Complexity**: Infrastructure already exists
- ✅ **Same Code**: Just different timing/sequence

**Performance Improvement:**
| Metric | Current | Progressive | Improvement |
|--------|---------|-------------|-------------|
| Initial Playback | 5-6 min ❌ | 30-60s ✅ | **10x faster** |
| Total Processing | 5-6 min | 5-6 min | Same (background) |
| User Experience | Poor ❌ | Excellent ✅ | **100% better** |

- [ ] **Optimize Media Processing Architecture** - Refactor from monolithic to queue-based processing
  - *Status*: Planned
  - *Impact*: High - Superior scalability and user experience
  - *Effort*: 25 hours
  - *Dependencies*: Progressive Quality Generation
  - *Description*: Convert monolithic `onMediaFileFinalize` to lightweight Storage trigger + async Cloud Tasks worker pattern. Enables concurrent user uploads, prevents processing bottlenecks, and provides better resource utilization.

#### 📋 **Media Processing Architecture - Technical Specification**

**Current Issues:**
- Monolithic Cloud Function blocking on heavy video processing
- Single `concurrency: 1` creates bottlenecks for multiple users
- High resource consumption (4GiB memory, 2 CPU cores) but inefficient utilization
- Users experience "stuck processing" during concurrent uploads

**Proposed Architecture:**

**1. Lightweight Storage Trigger** (`onMediaFileFinalize`)
```typescript
// Fast enqueue-only function
onMediaFileFinalize = {
  timeoutSeconds: 60,      // Quick response
  memory: '1GiB',          // Minimal resources  
  minInstances: 1          // Keep warm
}
// Actions: Filter, validate, enqueue job
```

**2. Async Worker Service** (Cloud Run/Functions v2 HTTP)
```typescript
mediaWorker = {
  minInstances: 1,
  maxInstances: 8-10,     // Controlled scaling
  cpu: 2, memory: '4GiB', // Dedicated resources
  concurrency: 1,         // Per video processing
  timeout: 540s           // Heavy work allocated
}
```

**3. Queue Management** (Cloud Tasks)
```typescript
const queueConfig = {
  maxDispatchesPerSecond: 5,    // Rate limiting
  maxConcurrentDispatches: 8,   // Backpressure control
  retryPolicy: exponentialBackoff // Automatic retries
}
```

**Benefits:**
- ✅ **Immediate Response**: Storage trigger completes in ~1 second
- ✅ **Concurrent Handling**: Multiple users upload simultaneously 
- ✅ **Resource Efficiency**: Right-sized resources per concern
- ✅ **Cost Control**: `maxInstances` prevents budget surprises
- ✅ **Reliability**: Idempotent jobs prevent duplicate work
- ✅ **Observability**: Clear job status tracking

**Implementation Steps:**
1. Create Cloud Tasks queue configuration
2. Build HTTP worker service for video processing
3. Modify Storage trigger to enqueue jobs only
4. Add job status tracking in Firestore
5. Update frontend to show processing progress
6. Migrate existing processing logic to worker

**Migration Strategy:** Gradual rollout with feature flags to ensure zero downtime during transition.

### 🎬 **Industry-Standard Video Processing for 4K Content**
- *Status*: Planned
- *Impact*: Critical - Essential for professional video handling
- *Effort*: 30 hours
- *Dependencies*: Current media processing analysis
- *Description*: Implement industry-standard async video processing for 1-minute 4K videos to match TikTok/Facebook/YouTube performance standards.

#### 📋 **4K Video Processing - Industry Analysis & Implementation**

**Industry Platform Strategies:**

**1) YouTube**
- Uploads are queued and start processing once upload completes
- Ingest can take 20–120s depending on codec/resolution; transcoding runs in the background
- 360p is available quickly; higher resolutions appear over time
- That "available instantly" feeling comes from showing a 360p stream first

**2) Instagram/Meta Reels**
- 90% of processing runs after upload; a lightweight version appears quickly while background processing continues

**3) TikTok**
- Basic version is produced during upload; higher qualities follow later
- 2-5 second upload response + async processing + progressive quality delivery

**Facebook/Instagram** (Reels & Stories)
- Immediate response + background processing + multiple quality variants

**YouTube** (Full Platform)
- Smart encoding + dedicated video farms + adaptive bitrate streaming

**Target Performance for 60-second 4K Videos:**
- ✅ **Upload Response**: 2-5 seconds (vs current 35-60 seconds)
- ✅ **Concurrent Processing**: 8-10 simultaneous videos (vs current 1x bottleneck)
- ✅ **Progressive Enhancement**: 720p → 1080p → 4K cascade (vs current all-or-nothing)
- ✅ **Cost Optimization**: Right-sized resources per processing stage

**The Key Difference:**

Your app currently processes everything on one machine before serving:
```
Upload → Wait for full processing → Show video
```

Major platforms use progressive processing:
```
Upload → Show basic version immediately → Process HD in background
```

**Implementation Options:**

**Option 1: Progressive HLS**
- Generate a low-quality version first
- HLS can encode a 360p playlist quickly, then higher qualities later

**Option 2: Streaming upload**
- Start encoding during upload
- Depends on your infrastructure

**Option 3: Browser transcoding (limited)**
- Use WebCodecs for basic HLS in the browser
- Works best for lightweight formats

**Quick Win: Reduce Initial Quality Target**

Lower the initial FFmpeg quality preset and start serving 480p/720p:

```typescript
// Current FFmpeg options:
.addOptions([
  '-profile:v', 'main',
  '-vf', 'scale=w=min(iw\\,1280):h=-2',  // Scales to 1280p max
  ...
])

// Could add quality optimization:
.addOptions([
  '-profile:v', 'baseline',  // Faster encoding
  '-vf', 'scale=w=min(iw\\,720):h=-2',  // Start with 720p instead of 1280p
  '-preset', 'ultrafast',  // Speed over size
  '-crf', '28',  // Lower quality = faster
  ...
])
```

This can cut time roughly in half, at the cost of slightly larger files.

**Technical Implementation:**

**1. Multi-Quality Generation Pipeline**
```typescript
// Generate variants in parallel like YouTube
const variants = [
  { width: 640,   height: 360,   bitrate: '500k',  priority: 'immediate' },  // 5 seconds
  { width: 1280,  height: 720,  bitrate: '2M',   priority: 'fast' },      // 10 seconds
  { width: 1920,  height: 1080, bitrate: '5M',   priority: 'standard' },   // 20 seconds
  { width: 3840,  height: 2160, bitrate: '20M',  priority: 'premium' },   // 35-45 seconds
];
```

**2. Progressive Enhancement Frontend**
```typescript
// Show immediate preview → upgrade to HD → deliver 4K
mediaStatus: {
  thumbnailReady: true,     // Instant thumbnail
  previewReady: true,       // 5 seconds (720p preview)
  hdReady: true,           // 15 seconds (1080p ready)
  fullResReady: true,      // 35 seconds (4K ready)
  hlsPlaylistReady: true,  // Multiple bitrates available
}
```

**3. Smart Compression Strategy**
- **AV1/VP9 encoding** for better compression (like YouTube)
- **Two-pass encoding** for optimal quality/size ratio
- **Hardware acceleration** when available (Intel QuickSync, NVIDIA NVENC)
- **Adaptive bitrate** based on content complexity

**4. Dedicated Processing Infrastructure**
```typescript
// Dedicated video worker service (Cloud Run)
videoProcessor = {
  minInstances: 2,          // Always ready
  maxInstances: 12,          // Handle peak load
  cpu: 4, memory: '8GiB',    // Serious processing power
  concurrency: 1,           // Per video intensive processing
  timeout: 600s,            // Handle large 4K files
  gpuAcceleration: true     // Enable GPU when available
}
```

**5. Queue Priority Management**
```typescript
const processingQueues = {
  immediate: 'thumbnails/previews',     // < 30s files
  standard: 'normal_processing',        // 30-120s files  
  intensive: '4k_processing',         // > 120s or 4K files
  batch: 'bulk_processing'              // Off-peak heavy processing
}
```

**Benefits of Industry-Standard Approach:**
- ✅ **Professional UX**: Immediate upload response (like TikTok/Facebook)
- ✅ **Scalable Architecture**: Handle 10x more concurrent users
- ✅ **Cost Efficient**: Right-sized resources prevent budget surprises
- ✅ **Progressive Quality**: Show content immediately, upgrade progressively
- ✅ **Future Proof**: Ready for VR/8K when needed

**Implementation Phases:**
1. **Phase 1** (10 hrs): Async upload + immediate response infrastructure
2. **Phase 2** (12 hrs): Multi-quality generation pipeline
3. **Phase 3** (8 hrs): Progressive enhancement frontend + progress tracking

**Performance Comparison:**
| Metric | Current | Industry Standard | Our Target |
|--------|---------|-------------------|------------|
| Upload Response | 35-60s ❌ | 2-5s ✅ | 2-5s ✅ |
| 4K Ready | 35-60s ❌ | 35-45s ✅ | 30-40s ✅ |
| Concurrent Processing | 1x ❌ | 8-10x ✅ | 8x ✅ |
| Resource Efficiency | Low ❌ | High ✅ | High ✅ |
| User Experience | Poor ❌ | Excellent ✅ | Excellent ✅ |

---

## 📋 Low Priority (P2)

### ✅ Testing & Validation
- [ ] **Enhanced File Upload Validation** - Client-side file size and type validation
  - *Status*: Planned
  - *Impact*: High - Better user experience and error prevention
  - *Effort*: 4 hours
  - *Dependencies*: Current comment attachment issues
  - *Description*: Add comprehensive client-side validation for file uploads with clear error messages, progress indicators, and file compression for large images.

#### 📋 **File Upload Validation Specifications**

**Current Issues:**
- Server-side rejection of large files creates poor UX
- No progress indicators for uploads
- No compression for large images
- Generic error messages

**Required Validations:**

**1. File Size Limits by Context**
```typescript
const uploadLimits = {
  comments: { max: 15 * 1024 * 1024, label: '15MB' },      // Comments
  mediaComments: { max: 15 * 1024 * 1024, label: '15MB' }, // Media comments  
  posts: { max: 10 * 1024 * 1024, label: '10MB' },        // Post attachments
  profiles: { max: 5 * 1024 * 1024, label: '5MB' },       // Profile pictures
  media: { max: 250 * 1024 * 1024, label: '250MB' }       // Main media uploads
};
```

**2. File Type Validation**
- Images: `image/jpeg, image/png, image/webp, image/gif`
- Videos: `video/mp4, video/webm, video/quicktime`
- Show friendly error messages for unsupported formats

**3. User-Friendly Error Messages**
```typescript
const errorMessages = {
  comments: "Comment attachments must be under 15MB. Use a shorter clip.",
  posts: "Post attachments must be under 10MB. Consider reducing file size.",
  profiles: "Profile pictures must be under 5MB. Try a smaller image resolution.",
  media: "Main media files must be under 250MB. Consider uploading in sections."
};
```

**4. Client-Side Features**
- ✅ **Instant validation**: Check file before upload starts
- ✅ **Progress indicators**: Show upload progress with cancel option
- ✅ **Image compression**: Compress large images before upload
- ✅ **Video preview**: Show video duration and resolution
- ✅ **Error messages**: Clear, actionable error messages
- ✅ **File size formatting**: Show human-readable file sizes

**5. User Experience Improvements**
- Drag & drop with visual feedback
- Preview thumbnails before upload
- Bulk upload support for multiple files
- Retry mechanism for failed uploads
- Upload queue management with pause/resume

- [ ] **Test SEO Implementation** - Validate meta tags and structured data
  - *Status*: Pending
  - *Impact*: Low - Quality assurance
  - *Effort*: 3 hours
  - *Dependencies*: EventSeo integration

### 🎯 Future Enhancements
- [ ] **Event Analytics** - Track event page performance
  - *Status*: Future
  - *Impact*: Low - Data insights
  - *Effort*: 6 hours
  - *Dependencies*: Individual event pages

- [ ] **Event Search Optimization** - Improve event discovery
  - *Status*: Future
  - *Impact*: Low - User experience
  - *Effort*: 8 hours
  - *Dependencies*: Individual event pages

---

## 🚀 Advanced Features (P3)

### 🤖 AI-Powered Features
- [ ] **AI Chat Assistant** - Intelligent community support bot
  - *Status*: Planned
  - *Impact*: High - 24/7 community support
  - *Effort*: 40 hours
  - *Dependencies*: None
  - *Description*: AI-powered chat for answering common questions, fitness tips, event info

- [ ] **AI Content Moderation** - Automatic content filtering
  - *Status*: Planned
  - *Impact*: High - Community safety
  - *Effort*: 30 hours
  - *Dependencies*: AI Chat Assistant
  - *Description*: AI-powered moderation for posts, comments, and media

- [ ] **AI Workout Recommendations** - Personalized fitness suggestions
  - *Status*: Planned
  - *Impact*: Medium - User engagement
  - *Effort*: 25 hours
  - *Dependencies*: User profile data
  - *Description*: AI suggests workouts based on user preferences and fitness level

- [ ] **Voice RSVP System** - Hands-free event RSVP with voice commands
  - *Status*: Future Enhancement
  - *Impact*: High - Accessibility and convenience
  - *Effort*: 35 hours
  - *Dependencies*: Voice recognition API, Browser microphone permissions
  - *Description*: Voice-activated RSVP system using speech recognition. Users can RSVP to events, cancel RSVPs, and manage family member attendance through voice commands.
  - *Features*:
    - "Hey Mojo, RSVP me to the yoga class"
    - "Cancel my RSVP for Saturday's event"
    - "Add my daughter to the park event"
    - Natural language understanding for event names and dates
    - Multi-user support (family members via voice)

- [ ] **Voice Event Notes** - Record and auto-generate post-event summaries
  - *Status*: Future Enhancement
  - *Impact*: Medium - Enhanced event documentation
  - *Effort*: 30 hours
  - *Dependencies*: Voice-to-text API, Event note storage
  - *Description*: Allow users to record voice notes after events. AI automatically transcribes and generates event summaries, highlights, and key moments.
  - *Features*:
    - Voice recording during/after events
    - Auto-transcription with timestamp markers
    - AI-generated event summaries
    - Integration with event pages for community sharing

- [ ] **Smart Event Matching** - AI-powered event recommendations
  - *Status*: Future Enhancement
  - *Impact*: High - Increased event participation
  - *Effort*: 40 hours
  - *Dependencies*: User preferences, event metadata, ML model
  - *Description*: AI analyzes user interests, past attendance, schedule, and family composition to recommend relevant events.
  - *Features*:
    - Personalized event suggestions based on preferences
    - Schedule-aware recommendations (available time slots)
    - Family-friendly event filtering
    - Interest-based matching (yoga, running, social events, etc.)
    - "Events you might like" section

- [ ] **Voice Family Coordination** - Voice commands for family event management
  - *Status*: Future Enhancement
  - *Impact*: Medium - Family event management convenience
  - *Effort*: 25 hours
  - *Dependencies*: Voice RSVP System, Family member management
  - *Description*: Voice commands specifically for managing family member RSVPs and event coordination.
  - *Features*:
    - "Add my daughter to Saturday's event"
    - "Who's going to the park event?"
    - "RSVP all my family to the yoga class"
    - "Check if my spouse is free for the event"

- [ ] **AI Nutrition Assistant** - Personalized meal planning and nutrition tracking
  - *Status*: Future Enhancement
  - *Impact*: High - Comprehensive wellness platform
  - *Effort*: 50 hours
  - *Dependencies*: Nutrition database, User goals/profile
  - *Description*: AI-powered nutrition assistant that provides meal planning, recipe suggestions, and calorie tracking based on fitness goals.
  - *Features*:
    - Meal planning based on fitness goals and preferences
    - Recipe suggestions with dietary restrictions
    - Calorie and macro tracking
    - Integration with workout events
    - Voice input for meal logging ("I had a chicken salad for lunch")

### 📱 Mobile Application
- [ ] **Native Mobile App** - iOS and Android apps
  - *Status*: Planned
  - *Impact*: High - Better user experience
  - *Effort*: 80 hours
  - *Dependencies*: PWA optimization
  - *Description*: Native mobile apps with push notifications, offline support

- [ ] **Push Notifications** - Real-time event updates
  - *Status*: Planned
  - *Impact*: High - User engagement
  - *Effort*: 20 hours
  - *Dependencies*: Mobile app or PWA
  - *Description*: Push notifications for event reminders, new posts, community updates

### 🔄 Waitlist & Auto-Upgrade System
- [x] **Waitlist Auto-Upgrade** - Automatic promotion from waitlist
  - *Status*: ✅ Completed - January 7, 2025
  - *Impact*: High - User experience
  - *Effort*: 15 hours (actual: 8 hours)
  - *Dependencies*: Event capacity management
  - *Description*: ✅ COMPLETED - Implemented comprehensive auto-promotion system with atomic transactions, family member cascade promotion, and race condition prevention. Users automatically move from waitlist to confirmed when spots open, with real-time notifications.

- [x] **Advanced Waitlist Management** - Priority-based waitlist with persistent positions
  - *Status*: ✅ Completed - January 7, 2025
  - *Impact*: High - Fair access and accuracy
  - *Effort*: 15 hours (actual: 6 hours)
  - *Dependencies*: Event capacity management
  - *Description*: ✅ COMPLETED - Fixed critical waitlist position bugs, implemented atomictransactions for race condition prevention, and added persistent waitlist positions with server-side calculation. No more duplicate positions or clientside race conditions.

- [x] **Comprehensive Notification System** - Multi-channel promotion notifications
  - *Status*: ✅ Completed - January 7, 2025  
  - *Impact*: High - User engagement
  - *Effort*: 12 hours (actual: 6 hours)
  - *Dependencies*: Waitlist auto-upgrade
  - *Description*: ✅ COMPLETED - Implemented FREE SMS notifications via Firebase Auth, real-time in-app notifications, website popup alerts, and FCM browser push setup. Zero external dependencies, leverages existing Firebase infrastructure.

### 💰 VIP Priority Waitlist Monetization System
- [ ] **VIP Priority Waitlist System** - Tier-based priority access with monetization
  - *Status*: Planned
  - *Impact*: CRITICAL - Revenue generation ($25K-100K+ annually)
  - *Effort*: 16 hours
  - *Dependencies*: Waitlist auto-upgrade system
  - *Description*: Multi-tier VIP system with paid priority access to skip waitlist lines and get guaranteed spots

#### 📋 **VIP Priority System - Technical Specification**

**Business Model:**
- **FREE Tier**: Normal waitlist positions (current behavior)
- **BASIC Tier ($9.99/month)**: 30% position boost (pos #200 → pos #60)
- **PREMIUM Tier ($19.99/month)**: 70% position boost (pos #200 → pos #20)  
- **VIP Tier ($49.99/month)**: Skip waitlist entirely for most events

**Position Calculation Algorithm:**
```typescript
const calculatePriorityPosition = (membershipTier: string, proposedPosition: number) => {
  switch(membershipTier) {
    case 'vip': return Math.max(1, Math.floor(proposedPosition * 0.1)); // 90% boost
    case 'premium': return Math.max(1, Math.floor(proposedPosition * 0.3)); // 70% boost
    case 'basic': return Math.max(1, Math.floor(proposedPosition * 0.7)); // 30% boost
    case 'free': return proposedPosition; // No boost
  }
};
```

**Revenue Projections (Conservative):**
- 1,000 users → 10% conversion = 100 Basic + 50 Premium + 10 VIP
- Monthly: $999 + $1,000 + $500 = $2,499
- Annual: $29,988

**Revenue Projections (Growth Scenario - 6 months):**
- 3,000 users → 15% conversion = 300 Basic + 150 Premium + 50 VIP  
- Monthly: $2,997 + $2,999 + $2,500 = $8,496
- Annual: $101,952

**Implementation Components:**
1. **User Tier Management** (4 hours)
   - Add membershipTier field to User model
   - Tier upgrade/downgrade flow
   - Subscription status tracking

2. **Priority Position Logic** (4 hours)
   - Modified waitlist position calculation
   - VIP bypass logic for capacity checks
   - Tier-specific position boosts

3. **Payment Integration** (6 hours)
   - Stripe subscription setup
   - Automated billing and tier assignment
   - Payment failure handling

4. **Upsell UI Components** (2 hours)
   - Position improvement messaging
   - "Upgrade to skip ahead" CTAs
   - Social proof elements ("100+ Premium members getting priority")

**Key Features:**
- ✅ **Fair Access**: Free tier users still get access, just slower
- ✅ **Progressive Pricing**: Reasonable upgrade path ($9.99 → $19.99 → $49.99)
- ✅ **Social Proof**: Show tier benefits with actual position improvements
- ✅ **FOMO Strategy**: "Only 15 Premium spots left this month"
- ✅ **Family Inclusive**: Family members get promoted with tier-holder

**Business Benefits:**
- 🎯 **Predictable Revenue**: Monthly recurring subscriptions
- 📈 **Scalable Growth**: Revenue grows with user base
- 🔄 **High Retention**: Value-focused tier benefits
- 💎 **Premium Positioning**: VIP status creates exclusivity
- 📊 **Data-Driven**: Revenue analytics and conversion tracking

### 🔄 Advanced Waitlist Architecture Improvements
- [ ] **Hold Windows System** - Enterprise-grade hold management with TTL expiration
  - *Status*: Planned
  - *Impact*: High - Prevents no-shows from blocking capacity
  - *Effort*: 6 hours
  - *Dependencies*: Current waitlist auto-promotion system
  - *Description*: Implement 30-120 minute hold windows for promoted users before seat returns to pool, preventing ghost reservations

#### 📋 **Hold Windows System - Technical Specification**

**Current Issues:**
- Immediate promotion → users can no-show without penalty
- No "grace period" for users to confirm promotions
- Capacity gets tied up by inactive users
- No automatic cleanup of pending promotions

**Blueprint Solution:**
```typescript
// Hold system with TTL expiration
interface HoldEntry {
  rsvpId: string;
  userId: string;
  seatsHeld: number;
  expiresAt: Date; // Firestore TTL
  createdAt: Date;
  notificationSent: boolean;
}

const HoldProcess = {
  // When promoting: Create hold + notify user
  createHold: async (rsvpId: string, userId: string, seats: number) => {
    const expiresAt = new Date(Date.now() + (30 * 60 * 1000)); // 30 min hold
    
    await addDoc(collection(db, 'events', eventId, 'holds'), {
      rsvpId,
      userId,
      seatsHeld: seats,
      expiresAt,
      createdAt: new Date(),
      notificationSent: false
    });
    
    // Send notification with deadline
    await sendPromotionNotification(userId, {
      message: `You've been promoted! Confirm within 30 minutes or lose your spot.`,
      expiresIn: 30 * 60 * 1000,
      confirmUrl: `/events/${eventId}/confirm-hold?token=${holdToken}`
    });
  },
  
  // Auto-expiration via Firestore TTL triggers
  onHoldExpired: async (holdId: string) => {
    // Move to next waitlist user
    await triggerAutomaticPromotions(eventId);
    // Log expired hold for analytics
    await logHoldExpired(holdId);
  }
};
```

**Benefits:**
- ✅ **Fair Access**: True FCFS with accountability
- ✅ **No Ghost Seats**: Automatic cleanup prevents capacity lockup  
- ✅ **User Accountability**: Clear time limits for confirmations
- ✅ **Analytics**: Track hold expiration rates for optimization
- ✅ **Flexible Windows**: Configurable hold times per event type

- [ ] **Idempotency Keys System** - UUID-based duplicate request prevention
  - *Status*: Planned
  - *Impact*: Medium - Better reliability under concurrent requests
  - *Effort*: 4 hours
  - *Dependencies*: Current transaction system
  - *Description*: Implement UUID-based idempotency keys to prevent duplicate RSVP requests from multiple tabs/devices

#### 📋 **Idempotency Keys - Technical Specification**

**Current Risk:**
- Users can accidentally submit multiple RSVPs
- Race conditions from multiple browser tabs
- No protection against network retry attempts
- Duplicate attendee records

**Solution:**
```typescript
interface RSVPRequest {
  idempotencyKey: string; // UUID from client
  userId: string;
  eventId: string;
  seats: number;
  timestamp: Date;
}

const idempotentRSVP = async (request: RSVPRequest) => {
  // Check if same request already processed
  const existingRSVP = await getDoc(doc(db, 'rsvps', request.idempotencyKey));
  
  if (existingRSVP.exists()) {
    // Return existing result - no duplicate processing
    return existingRSVP.data();
  }
  
  // Process new request atomically
  return await db.runTransaction(async (t) => {
    // Add idempotency key to RSVP document
    t.set(doc(db, 'events', request.eventId, 'rsvps', request.idempotencyKey), {
      ...request,
      processedAt: new Date()
    });
    
    // Continue with normal RSVP logic...
  });
};
```

**Benefits:**
- ✅ **No Duplicates**: Same request never processed twice
- ✅ **Network Resilient**: Safe retries for failed requests
- ✅ **Multi-Tab Safe**: Users can safely open multiple tabs

- [ ] **Template-Based Notification System** - Rich promotional email/SMS templates
  - *Status*: Planned  
  - *Impact*: Medium - Professional user communication
  - *Effort*: 4 hours
  - *Dependencies*: Current notification system
  - *Description*: Create professional email/SMS templates for promotions, holds, cancellations with tracking and personalization

#### 📋 **Template System - Technical Specification**

**Current State:**
- Basic notification messages
- No consistency across channels
- Limited personalization
- No tracking/delivery status

**Enhanced Templates:**
```typescript
interface NotificationTemplate {
  id: string;
  type: 'waitlist_promotion' | 'hold_created' | 'hold_expiring' | 'cancellation';
  channel: 'email' | 'sms' | 'push';
  template: string;
  variables: string[]; // ['userName', 'eventTitle', 'expiresIn']
}

const promotionTemplates = {
  email: {
    subject: '🎉 You\'ve been promoted from waitlist!',
    html: `
      <div class="email-template">
        <h1>Congratulations {userName}!</h1>
        <p>You've been promoted from waitlist for <strong>{eventTitle}</strong></p>
        <p>Confirm your attendance within <strong>{expiresIn}</strong> minutes</p>
        <a href="{confirmUrl}" class="cta-button">✅ Confirm Attendance</a>
      </div>
    `
  },
  sms: `🎉 MOMS FITNESS MOJO: {userName}, you're promoted from waitlist to "{eventTitle}"! Confirm within {expiresIn} min: {confirmUrl}`
};
```

**Benefits:**
- ✅ **Consistent Branding**: Professional appearance across all channels
- ✅ **High Conversion**: Clear, actionable messages
- ✅ **Personalization**: Dynamic content based on user data
- ✅ **Delivery Tracking**: Monitor success rates per template

- [ ] **Audit Logging System** - Comprehensive RSVP change tracking
  - *Status*: Planned
  - *Impact*: Medium - Compliance and debugging capabilities
  - *Effort*: 6 hours
  - *Dependencies*: Current RSVP system
  - *Description*: Log all RSVP changes, admin actions, and system events for compliance and troubleshooting

### 💰 Revenue Enhancement Features
- [ ] **Pay-to-Confirm Events** - Stripe integration for premium events
  - *Status*: Planned
  - *Impact*: CRITICAL - Revenue generation for premium events
  - *Effort*: 12 hours
  - *Dependencies*: VIP priority system
  - *Description*: Stripe integration for paid fitness classes, premium workshops, and VIP experiences

#### 📋 **Payment Integration - Technical Specification**

**Use Cases:**
- Premium fitness workshops ($25-75)
- Special event classes ($30-50)  
- VIP experiences ($100+)
- Paid meal add-ons ($15-25)

**Implementation:**
```typescript
interface PaymentEvent {
  eventId: string;
  pricing: {
    general: number; // Base price
    vip: number;      // Premium price  
    child: number;    // Reduced price
  };
  addOns: {
    meal: number;
    swag: number;
  };
}

const StripeIntegration = {
  createPaymentIntent: async (rsvpId: string, amount: number) => {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency: 'usd',
      metadata: {
        rsvpId,
        eventId: event.id
      }
    });
    
    return { clientSecret: paymentIntent.client_secret };
  },
  
  confirmPayment: async (paymentIntentId: string) => {
    // Verify payment success
    // Update RSVP status to 'confirmed'
    // Send confirmation email with tickets
  }
};
```

**Revenue Impact:**
- ✅ **Higher Value Events**: $25-100 per attendee vs free
- ✅ **Add-On Sales**: Meals, merchandise, premium seating
- ✅ **VIP Upgrading**: Pay-to-confirm for waitlisted users
- ✅ **Event Diversity**: Mix free community + premium paid events

- [ ] **Multi-Tier Event Pricing** - Flexible pricing tiers per event
  - *Status*: Planned
  - *Impact*: Medium - Revenue optimization and fair access
  - *Effort*: 6 hours
  - *Dependencies*: Payment integration
  - *Description*: Different pricing for General/VIP/Child ticket types with dynamic capacity management

### 🔍 Advanced Analytics & Reporting
- [ ] **Hold Expiration Analytics** - Track hold success rates and optimize windows
  - *Status*: Planned
  - *Impact*: Low - Data-driven optimization
  - *Effort*: 4 hours
  - *Dependencies*: Hold windows system
  - *Description*: Track hold expiration rates, user confirmation patterns, and optimize hold window durations based on user behavior data

- [ ] **Revenue Analytics Dashboard** - Track payment conversion and event profitability  
  - *Status*: Planned
  - *Impact*: Medium - Business intelligence
  - *Effort*: 8 hours
  - *Dependencies*: Payment integration
  - *Description*: Comprehensive analytics for revenue tracking, conversion rates, and event profitability

### 💬 Enhanced Communication
- [ ] **Real-time Chat System** - Live community chat
  - *Status*: Planned
  - *Impact*: High - Community engagement
  - *Effort*: 35 hours
  - *Dependencies*: WebSocket infrastructure
  - *Description*: Real-time chat for events, general community, private messages

- [ ] **Video Chat Integration** - Face-to-face community calls
  - *Status*: Planned
  - *Impact*: Medium - Personal connection
  - *Effort*: 25 hours
  - *Dependencies*: Real-time chat system
  - *Description*: Video calls for virtual events, group workouts, community meetings

### 🎯 Community Features
- [ ] **Habit Streak Tracking** - Gamified fitness habits
  - *Status*: Planned
  - *Impact*: Medium - User engagement
  - *Effort*: 20 hours
  - *Dependencies*: User profile system
  - *Description*: Track daily habits, streaks, achievements with badges

- [ ] **Community Challenges** - Monthly fitness challenges
  - *Status*: Planned
  - *Impact*: High - Community engagement
  - *Effort*: 30 hours
  - *Dependencies*: Habit tracking
  - *Description*: Monthly challenges with leaderboards, prizes, community goals

- [ ] **Mentor-Mentee System** - Experienced moms guide newcomers
  - *Status*: Planned
  - *Impact*: High - Community support
  - *Effort*: 25 hours
  - *Dependencies*: User profiles, messaging
  - *Description*: Pair experienced members with newcomers for guidance

### 📊 Analytics & Insights
- [ ] **Advanced Analytics Dashboard** - Community insights
  - *Status*: Planned
  - *Impact*: Medium - Data-driven decisions
  - *Effort*: 35 hours
  - *Dependencies*: User activity tracking
  - *Description*: Detailed analytics on user engagement, event success, community growth

- [ ] **Personalized Insights** - Individual user analytics
  - *Status*: Planned
  - *Impact*: Medium - User motivation
  - *Effort*: 20 hours
  - *Dependencies*: Analytics dashboard
  - *Description*: Personal progress tracking, achievement insights, goal recommendations

### 🔐 Advanced Security & Privacy
- [ ] **Advanced Privacy Controls** - Granular privacy settings
  - *Status*: Planned
  - *Impact*: High - User trust
  - *Effort*: 15 hours
  - *Dependencies*: User profile system
  - *Description*: Fine-grained privacy controls for posts, photos, personal info

- [ ] **Content Encryption** - End-to-end encryption for sensitive content
  - *Status*: Planned
  - *Impact*: Medium - Security
  - *Effort*: 25 hours
  - *Dependencies*: Advanced privacy controls
  - *Description*: Encrypt private messages, sensitive photos, personal data

### 🌐 Integration Features
- [ ] **Calendar Integration** - Sync with Google Calendar, Apple Calendar
  - *Status*: Planned
  - *Impact*: High - User convenience
  - *Effort*: 20 hours
  - *Dependencies*: Event management system
  - *Description*: Automatic calendar sync for events, reminders

- [ ] **Fitness App Integration** - Connect with Fitbit, Apple Health, MyFitnessPal
  - *Status*: Planned
  - *Impact*: Medium - User convenience
  - *Effort*: 30 hours
  - *Dependencies*: User profile system
  - *Description*: Import fitness data, sync workouts, track progress

- [ ] **Social Media Integration** - Enhanced social sharing
  - *Status*: Planned
  - *Impact*: Medium - Community growth
  - *Effort*: 15 hours
  - *Dependencies*: Social media APIs
  - *Description*: Enhanced sharing to Instagram, Facebook, TikTok with custom templates

---

## 🎨 Content & Lifestyle Features (P2)

### 📝 Content Strategy
- [ ] **Lifestyle Navigation Hub** - Add Move/Nourish/Restore/Connect pillars
  - *Status*: Pending
  - *Impact*: High - Content organization
  - *Effort*: 8 hours
  - *Dependencies*: None
  - *Description*: Main navigation with 4 lifestyle pillars for better content organization

- [ ] **Lifestyle Page** - Dedicated page with 4 content pillars
  - *Status*: Pending
  - *Impact*: High - Content hub
  - *Effort*: 12 hours
  - *Dependencies*: Lifestyle navigation
  - *Description*: Comprehensive lifestyle page with Move/Nourish/Restore/Connect sections

- [ ] **Content Calendar System** - 4-week content calendar structure
  - *Status*: Pending
  - *Impact*: Medium - Content planning
  - *Effort*: 10 hours
  - *Dependencies*: Lifestyle page
  - *Description*: Monthly themes (Move in May, Joyful June, Stress-Less September, etc.)

- [ ] **Evergreen Blog Content** - SEO-friendly blog posts
  - *Status*: Pending
  - *Impact*: High - SEO and engagement
  - *Effort*: 20 hours
  - *Dependencies*: Content calendar
  - *Description*: 10-min workouts, postpartum routines, snack swaps, pelvic floor guides

### 🎁 Lead Magnets & Resources
- [ ] **Mom's 10-Minute Reset Kit** - PDF lead magnet
  - *Status*: Pending
  - *Impact*: High - Lead generation
  - *Effort*: 8 hours
  - *Dependencies*: Content creation
  - *Description*: Downloadable PDF with quick workouts and wellness tips

- [ ] **7-Day Me-Time Challenge** - Email course
  - *Status*: Pending
  - *Impact*: High - Email list building
  - *Effort*: 12 hours
  - *Dependencies*: Email system
  - *Description*: 7-day email course for building self-care habits

- [ ] **Pelvic Floor Mini-Guide** - Specialized resource
  - *Status*: Pending
  - *Impact*: Medium - Niche content
  - *Effort*: 6 hours
  - *Dependencies*: Content creation
  - *Description*: Postpartum-specific fitness guide

### 🏃‍♀️ Micro-Workouts & Community Features
- [ ] **Micro-Workout Platform** - User-submitted workouts
  - *Status*: Pending
  - *Impact*: High - Community engagement
  - *Effort*: 40 hours
  - *Dependencies*: User authentication
  - *Description*: Allow moms to publish 1-10 minute micro-workouts with moderation

- [ ] **Workout Moderation System** - Content approval workflow
  - *Status*: Pending
  - *Impact*: High - Content quality
  - *Effort*: 15 hours
  - *Dependencies*: Micro-workout platform
  - *Description*: Approve/reject workflow for user-submitted workouts

- [ ] **Workout Safety Guidelines** - Content guidelines and disclaimers
  - *Status*: Pending
  - *Impact*: High - Safety
  - *Effort*: 8 hours
  - *Dependencies*: Micro-workout platform
  - *Description*: Safety guidelines and disclaimers for workout creation

- [ ] **Workout Filtering & Search** - Find workouts by duration, intensity, equipment
  - *Status*: Pending
  - *Impact*: Medium - User experience
  - *Effort*: 12 hours
  - *Dependencies*: Micro-workout platform
  - *Description*: Filter by duration, intensity, equipment, tags (postpartum, desk-break, etc.)

- [ ] **Workout Rating System** - Community feedback on workouts
  - *Status*: Pending
  - *Impact*: Medium - Content quality
  - *Effort*: 10 hours
  - *Dependencies*: Micro-workout platform
  - *Description*: Quick rating system (👍/👎 + difficulty feedback) after workout completion

- [ ] **Workout SEO Pages** - Individual workout pages with HowTo schema
  - *Status*: Pending
  - *Impact*: High - SEO
  - *Effort*: 15 hours
  - *Dependencies*: Micro-workout platform
  - *Description*: Individual SEO pages for each workout with HowTo JSON-LD structured data

- [ ] **Workout Social Features** - Like, save, share functionality
  - *Status*: Pending
  - *Impact*: Medium - Engagement
  - *Effort*: 12 hours
  - *Dependencies*: Micro-workout platform
  - *Description*: Like, save, and share functionality for workouts

- [ ] **Workout Challenges** - Weekly challenges and badges
  - *Status*: Pending
  - *Impact*: High - Engagement
  - *Effort*: 20 hours
  - *Dependencies*: Micro-workout platform, habit tracking
  - *Description*: Weekly challenges and badges for micro-workout completion streaks

- [ ] **Workout Playlists** - Curated workout series
  - *Status*: Pending
  - *Impact*: Medium - User experience
  - *Effort*: 8 hours
  - *Dependencies*: Micro-workout platform
  - *Description*: Workout playlists (e.g., 10-minute lunch reset series)

### 🎯 Community Engagement Features
- [ ] **Me-Time Meter** - Habit tracker with weekly dots
  - *Status*: Pending
  - *Impact*: High - User engagement
  - *Effort*: 15 hours
  - *Dependencies*: User profiles
  - *Description*: Weekly habit tracker (Mon-Sun dots) for self-care activities

- [ ] **Real Moms Testimonials** - Member success stories
  - *Status*: Pending
  - *Impact*: Medium - Social proof
  - *Effort*: 8 hours
  - *Dependencies*: Content creation
  - *Description*: 'Real Moms, Real Wins' testimonials section with short 1-2 line quotes

- [ ] **Build-Your-10 Feature** - Custom workout builder
  - *Status*: Pending
  - *Impact*: High - Personalization
  - *Effort*: 20 hours
  - *Dependencies*: Micro-workout platform
  - *Description*: Pick 2x5-min blocks (Move/Restore) to build custom 10-minute workouts

- [ ] **Habit Streak Badges** - Gamification system
  - *Status*: Pending
  - *Impact*: High - Engagement
  - *Effort*: 12 hours
  - *Dependencies*: Me-Time Meter
  - *Description*: Habit streak badges (3/5/10 days = confetti + share)

- [ ] **Invite Friend Feature** - Referral system
  - *Status*: Pending
  - *Impact*: High - Growth
  - *Effort*: 10 hours
  - *Dependencies*: User system
  - *Description*: Invite-a-friend feature with one-tap link that pre-fills event RSVP

- [ ] **Bring-a-Friend Week** - Special event promotion
  - *Status*: Pending
  - *Impact*: Medium - Community growth
  - *Effort*: 8 hours
  - *Dependencies*: Invite friend feature
  - *Description*: Special week where members can bring friends to events

### 📱 Mobile & PWA Features
- [ ] **PWA Optimization** - Enhanced mobile experience
  - *Status*: Pending
  - *Impact*: High - Mobile experience
  - *Effort*: 15 hours
  - *Dependencies*: Current PWA setup
  - *Description*: Optimize PWA for better mobile app-like experience

- [ ] **Offline Support** - Work offline with cached content
  - *Status*: Pending
  - *Impact*: Medium - User experience
  - *Effort*: 20 hours
  - *Dependencies*: PWA optimization
  - *Description*: Cache workouts, events, and content for offline access

### 🎨 UI/UX Improvements
- [x] **Fix Visual Consistency - Brand Color Palette** - Replace #FF6B35 with proper brand colors
  - *Status*: ✅ Completed - January 7, 2025
  - *Impact*: High - Brand consistency
  - *Effort*: 12 hours (actual: 3 hours)
  - *Dependencies*: None
  - *Description*: ✅ COMPLETED - Replaced all 72+ instances of #FF6B35 (Bright Orange) with proper brand palette: #F25129 (Coral Glow) + #FFC107 (Golden Peach) + #EFD8C5 (Warm Sand). Updated across all pages, components, buttons, gradients, and UI elements. Created unified, professional brand palette.

- [ ] **Microcopy Updates** - Mom-focused button text
  - *Status*: Pending
  - *Impact*: Medium - User experience
  - *Effort*: 6 hours
  - *Dependencies*: None
  - *Description*: Update all buttons and CTAs with mom-focused microcopy ('Start now (10 min)', 'I'm in', etc.)

- [ ] **Empty State Improvements** - Better empty state messages
  - *Status*: Pending
  - *Impact*: Low - User experience
  - *Effort*: 4 hours
  - *Dependencies*: None
  - *Description*: Improve empty state messages throughout the app

- [ ] **Loading State Improvements** - Better loading experiences
  - *Status*: Pending
  - *Impact*: Low - User experience
  - *Effort*: 6 hours
  - *Dependencies*: None
  - *Description*: Add skeleton loaders and better loading states

### 🔍 SEO & Marketing Features
- [ ] **Local SEO Content** - Short Hills/Millburn specific content
  - *Status*: Pending
  - *Impact*: High - Local SEO
  - *Effort*: 12 hours
  - *Dependencies*: Content strategy
  - *Description*: Add location-specific content and keywords throughout site

- [ ] **Google Business Profile** - Local business listing
  - *Status*: Pending
  - *Impact*: High - Local discovery
  - *Effort*: 8 hours
  - *Dependencies*: None
  - *Description*: Set up Google Business Profile as Service-Area Business with multiple NJ towns

- [ ] **Location Pages** - Dedicated location pages
  - *Status*: Pending
  - *Impact*: High - Local SEO
  - *Effort*: 16 hours
  - *Dependencies*: Local SEO content
  - *Description*: Create dedicated location pages: /nj/short-hills-millburn-moms-fitness/, etc.

- [ ] **Areas Served Page** - Expandable service area section
  - *Status*: Pending
  - *Impact*: Medium - Local SEO
  - *Effort*: 6 hours
  - *Dependencies*: Location pages
  - *Description*: Create expandable Areas We Serve section with map and town list

### 📊 Analytics & Tracking
- [ ] **Micro-Workout Analytics** - Track workout engagement
  - *Status*: Pending
  - *Impact*: Medium - Data insights
  - *Effort*: 10 hours
  - *Dependencies*: Micro-workout platform
  - *Description*: Analytics tracking for micro-workout starts, completions, and step navigation

- [ ] **UTM Tracking** - Marketing attribution
  - *Status*: Pending
  - *Impact*: Medium - Marketing insights
  - *Effort*: 6 hours
  - *Dependencies*: Analytics setup
  - *Description*: Implement UTM tags on social media links for traffic attribution

- [ ] **GA4 Events** - Enhanced analytics tracking
  - *Status*: Pending
  - *Impact*: Medium - Analytics
  - *Effort*: 8 hours
  - *Dependencies*: Analytics setup
  - *Description*: Add GA4 events for RSVP clicks, registration, social outbound links

---

## 🏁 Completed Tasks

### ✅ Recently Completed (January 2025)
- [x] **Fix Status Count Keys** - Fixed wrong status count keys in WhosGoingTab
  - *Completed*: January 7, 2025
  - *Impact*: High - Fixed critical display bug

- [x] **Add Waitlist Count Display** - Added waitlisted count to status display
  - *Completed*: January 7, 2025
  - *Impact*: Medium - Better user information

- [x] **Fix Table Scrolling** - Improved table scrolling with sticky headers
  - *Completed*: January 7, 2025
  - *Impact*: Medium - Better user experience

- [x] **Add Avatar Initials** - Added profile initials for better visual scanning
  - *Completed*: January 7, 2025
  - *Impact*: Low - Visual improvement

- [x] **Implement CSV Security** - Added CSV escaping to prevent injection attacks
  - *Completed*: January 7, 2025
  - *Impact*: High - Security improvement

- [x] **Fix Column Widths** - Balanced column width percentages
  - *Completed*: January 7, 2025
  - *Impact*: Low - Layout improvement

- [x] **Fix Profile Image Circular Border** - Made founder profile image fill circular border properly
  - *Completed*: January 7, 2025
  - *Impact*: Medium - Visual improvement

- [x] **Brand Color Palette Unification** - Unified brand colors across entire website
  - *Completed*: January 7, 2025
  - *Impact*: High - Brand consistency and professional appearance
  - *Details*: Replaced all 72+ instances of #FF6B35 (Bright Orange) with #FFC107 (Golden Peach) across all pages, components, buttons, gradients, and UI elements. Created cohesive Coral Glow + Golden Peach brand palette.

---

## 📊 Backlog Statistics

- **Total Tasks**: 101
- **Completed**: 12 (12%)
- **Pending**: 8 (8%)
- **Planned**: 81 (80%)
- **High Priority**: 6 (2 existing + 4 new enhancements)
- **Medium Priority**: 12 (6 existing + 6 new enhancements)
- **Low Priority**: 7 (2 existing + 5 new enhancements)
- **Advanced Features**: 30
- **Content & Lifestyle Features**: 40
- **Progressive Media Enhancements**: 15 (4 Critical, 6 Important, 5 Nice-to-Have)

---

## 🎯 Next Sprint Focus

### Week 1-2: SEO Foundation
1. Decide event page architecture
2. Create individual event pages
3. Integrate EventSeo component

### Week 3-4: URL & Navigation
1. Update production URLs
2. Add event slug support
3. Set up event routing

---

## 📝 Notes

- **EventSeo Component**: Ready to use, just needs integration
- **Current Architecture**: Modal-based event display
- **Target Architecture**: Individual event pages for better SEO
- **Domain Migration**: Planned from firebaseapp.com to web.app

---

*This backlog is maintained by the development team and updated regularly.*
