# Phase 3: Progressive Quality Generation - Deployment Guide

## Overview

This guide covers the deployment of Phase 3: Progressive Quality Generation, which includes Cloud Tasks integration for background video processing.

## What Was Implemented

### Phase 1: Pre-Declared Master + Placeholder Playlists ✅
- Master playlist created with ALL quality levels before encoding starts
- Placeholder playlists for 1080p/4K to avoid 404 errors
- Map-based `qualityLevels` structure in Firestore

### Phase 2: Streaming Segments ✅
- 720p segments uploaded as they're produced
- Video marked as ready after 3-5 segments (12-20 seconds)
- Aligned GOPs for seamless ABR switching
- EVENT playlist type during encoding, ENDLIST when complete

### Phase 3: Cloud Tasks Background Generation ✅
- Background Cloud Function (`generateQuality`) for 1080p/4K
- Cloud Tasks queue with OIDC authentication
- Automatic retry logic via Cloud Tasks
- Idempotency keys to prevent duplicate processing

## Deployment Steps

### 1. Prerequisites

Ensure you have:
- ✅ Firebase CLI installed and authenticated
- ✅ Google Cloud SDK (`gcloud`) installed and authenticated
- ✅ Project set to production: `firebase use prod`
- ✅ Cloud Tasks API enabled in your project

### 2. Enable Cloud Tasks API (if not already enabled)

```bash
gcloud services enable cloudtasks.googleapis.com --project=momsfitnessmojo-65d00
```

### 3. Deploy Using Updated Script

The updated `deploy-prod.ps1` script now automatically:
- ✅ Checks if Cloud Tasks queue exists
- ✅ Creates the queue if it doesn't exist
- ✅ Deploys Cloud Functions including `generateQuality`
- ✅ Provides post-deployment verification

**Deploy everything:**
```powershell
.\deploy-prod.ps1 all
```

**Deploy functions only (recommended for Phase 3):**
```powershell
.\deploy-prod.ps1 functions
```

**Deploy without extensions (fastest):**
```powershell
.\deploy-prod.ps1 no-extensions
```

### 4. Manual Queue Setup (Alternative)

If the automatic queue creation fails, you can set it up manually:

**Option A: Using the standalone script**
```powershell
.\scripts\setup-cloud-tasks-queue.ps1
```

**Option B: Using gcloud directly**
```bash
gcloud tasks queues create video-quality-generation \
  --location=us-central1 \
  --project=momsfitnessmojo-65d00 \
  --max-attempts=3 \
  --max-retry-duration=3600s \
  --max-dispatches-per-second=10 \
  --max-concurrent-dispatches=5
```

## Cloud Tasks Queue Configuration

The queue is configured with:
- **Location**: `us-central1` (matches Cloud Functions region)
- **Max attempts**: 3 (automatic retries)
- **Max retry duration**: 3600s (1 hour)
- **Max dispatches/sec**: 10
- **Max concurrent**: 5

## Verification

After deployment, verify:

1. **Cloud Functions deployed:**
   ```bash
   firebase functions:list --project=momsfitnessmojo-65d00
   ```
   Should show `generateQuality` function

2. **Cloud Tasks queue exists:**
   ```bash
   gcloud tasks queues describe video-quality-generation \
     --location=us-central1 \
     --project=momsfitnessmojo-65d00
   ```

3. **Test upload a video:**
   - Upload a video file
   - Check logs: `firebase functions:log --only generateQuality`
   - Video should be playable after ~12-20 seconds
   - 1080p/4K should generate in background

## What Happens Now

### Video Upload Flow

1. **User uploads video** → Original file stored in Storage
2. **Thumbnail generated** → Immediate visual feedback
3. **Master playlist created** → All quality levels pre-declared
4. **720p generation starts** → Streaming segments uploaded
5. **Ready after 3-5 segments** → Video playable in 12-20 seconds
6. **Background tasks enqueued** → 1080p/4K via Cloud Tasks
7. **Higher qualities generate** → Separate Cloud Function invocations
8. **Quality upgrades** → Frontend detects and upgrades automatically

### Performance Improvements

- **Before**: 5-6 minutes wait time before video playable
- **After**: 12-20 seconds wait time (3-5 segments)
- **Background**: Higher qualities generate without blocking main process

## Troubleshooting

### Queue Creation Fails

**Error**: "Permission denied" or "API not enabled"
- **Solution**: Ensure Cloud Tasks API is enabled
  ```bash
  gcloud services enable cloudtasks.googleapis.com --project=momsfitnessmojo-65d00
  ```
- **Solution**: Ensure you have Cloud Tasks Admin role
  ```bash
  gcloud projects add-iam-policy-binding momsfitnessmojo-65d00 \
    --member="user:YOUR_EMAIL" \
    --role="roles/cloudtasks.admin"
  ```

### Tasks Not Processing

**Error**: Tasks stuck in queue
- **Check**: Cloud Function logs
  ```bash
  firebase functions:log --only generateQuality
  ```
- **Check**: Queue status
  ```bash
  gcloud tasks queues describe video-quality-generation \
    --location=us-central1 \
    --project=momsfitnessmojo-65d00
  ```

### OIDC Authentication Fails

**Error**: "Unauthorized" in function logs
- **Solution**: Ensure function has `invoker: 'private'` and Cloud Tasks service account has permission
- **Check**: Function invoker permissions in Firebase Console

## Monitoring

### Key Metrics to Watch

1. **Queue depth**: Number of tasks waiting
2. **Task execution time**: Time to generate each quality
3. **Failure rate**: Failed task attempts
4. **Time to ready**: Time from upload to first playback

### Logs to Monitor

```bash
# Cloud Functions logs
firebase functions:log --only onMediaFileFinalize
firebase functions:log --only generateQuality

# Cloud Tasks logs (via Cloud Console)
# https://console.cloud.google.com/cloudtasks
```

## Rollback Plan

If issues occur, you can:

1. **Disable Cloud Tasks enqueueing** (temporary):
   - Comment out the `enqueueBackgroundQualityGeneration` call in `functions/src/index.ts`
   - Redeploy functions

2. **Revert to parallel generation**:
   - Restore the old parallel generation code
   - Remove Cloud Tasks integration

3. **Keep 720p streaming only**:
   - Phase 1 and Phase 2 provide immediate playback benefits
   - Phase 3 is optional for background generation

## Next Steps

After successful deployment:

1. ✅ Monitor first few video uploads
2. ✅ Verify 720p playback starts in 12-20 seconds
3. ✅ Check Cloud Tasks queue for background jobs
4. ✅ Verify 1080p/4K generate successfully
5. ✅ Test quality upgrades in frontend

## Support

For issues or questions:
- Check Cloud Functions logs
- Review Cloud Tasks queue status
- Verify Firestore `qualityLevels` updates
- Check frontend HLS.js configuration


