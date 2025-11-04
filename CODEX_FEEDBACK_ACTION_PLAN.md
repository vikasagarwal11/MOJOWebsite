# Codex Feedback Action Plan
*Analysis of detailed feedback from Codex - November 4, 2025*

## Executive Summary

Codex provided detailed analysis confirming:
1. ✅ **Phase 1 & 2 working**: Master playlist and 720p streaming work correctly
2. ❌ **Cloud Tasks queue missing**: `NOT_FOUND` error because queue doesn't exist
3. ⚠️ **Frontend `hasHls: false`**: Backend writes `sources.hls`, but frontend doesn't see it
4. ⚠️ **Bucket name mismatch**: `generateQuality` uses default bucket instead of explicit name

---

## Priority 1: Cloud Tasks Queue Setup (Infrastructure)

### Issue
- Queue `projects/momsfitnessmojo-65d00/locations/us-central1/queues/video-quality-generation` doesn't exist
- Service account `${PROJECT_NUMBER}-compute@developer.gserviceaccount.com` needs `roles/cloudtasks.enqueuer` role
- **Impact**: 1080p and 4K generation never runs

### Actions Required

#### 1. Create Cloud Tasks Queue
```bash
gcloud tasks queues create video-quality-generation \
  --location=us-central1 \
  --project=momsfitnessmojo-65d00
```

#### 2. Grant Service Account Permissions
```bash
# Get project number
PROJECT_NUMBER=$(gcloud projects describe momsfitnessmojo-65d00 --format="value(projectNumber)")

# Grant enqueuer role
gcloud projects add-iam-policy-binding momsfitnessmojo-65d00 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer"
```

#### 3. Verify Queue Status
```bash
gcloud tasks queues describe video-quality-generation \
  --location=us-central1 \
  --project=momsfitnessmojo-65d00
```

**Status**: ⚠️ **Action Required** - Infrastructure setup, no code changes needed

---

## Priority 2: Bucket Name Consistency (Code Fix)

### Issue
- `generateQuality` function uses `getStorage().bucket()` (default bucket)
- `onMediaFileFinalize` uses explicit bucket: `getStorage().bucket(bucketName)`
- **Impact**: If default bucket differs from `STORAGE_BUCKET`, background quality generation writes to wrong bucket

### Current Code (Line ~2560 in `functions/src/index.ts`)
```typescript
// ❌ CURRENT - Uses default bucket
const bucket = getStorage().bucket();
```

### Required Change
```typescript
// ✅ FIXED - Use explicit bucket name consistent with onMediaFileFinalize
const bucketName = process.env.STORAGE_BUCKET || 'momsfitnessmojo-65d00.firebasestorage.app';
const bucket = getStorage().bucket(bucketName);

// Add logging for debugging
console.log(`🔧 [PROGRESSIVE] generateQuality using bucket: ${bucketName}`);
```

**File**: `functions/src/index.ts`  
**Line**: ~2560 (in `generateQuality` function)  
**Status**: 🔴 **Code Change Required**

---

## Priority 3: Frontend `hasHls: false` Investigation

### Issue
- Backend logs show: `✅ [ADAPTIVE] Firestore updated with sources`
- Frontend shows: `hasHls: false` (from `MediaCard.tsx:79`)
- Backend writes `sources.hls` and `sources.hlsMaster`, but frontend doesn't see them

### Possible Causes

#### Theory 1: `normalizeDoc` Stripping Nested Objects
**Location**: `src/hooks/useFirestore.ts:28`

**Current Code**:
```typescript
function normalizeDoc(docData: any) {
  const sanitized = sanitizeFirebaseData(docData);
  const out = { id: sanitized.id, ...sanitized };
  // ... timestamp conversion ...
  return out;
}
```

**Investigation Needed**:
- Check if `sanitizeFirebaseData` preserves nested `sources` object
- Verify `sources.hls` and `sources.hlsMaster` exist in Firestore document
- Add debug logging in `normalizeDoc` to inspect `sources` field

**Action**: Add debug logging to verify:
```typescript
function normalizeDoc(docData: any) {
  const sanitized = sanitizeFirebaseData(docData);
  
  // DEBUG: Check sources field
  console.log('🔍 [normalizeDoc] sources check:', {
    hasSources: !!sanitized.sources,
    sourcesKeys: sanitized.sources ? Object.keys(sanitized.sources) : [],
    hasHls: !!sanitized.sources?.hls,
    hasHlsMaster: !!sanitized.sources?.hlsMaster
  });
  
  const out = { id: sanitized.id, ...sanitized };
  // ... rest of function
}
```

#### Theory 2: Firestore Document Not Updated
**Action**: Manually verify in Firestore Console:
1. Open Firebase Console → Firestore
2. Find a media document that shows "ready" status
3. Check if `sources.hls` and `sources.hlsMaster` fields exist
4. Compare with what frontend receives

#### Theory 3: Real-time Listener Not Receiving Updates
**Action**: Check `MediaCard.tsx` real-time sync logic (lines 64-105)
- Verify `onSnapshot` listener is active
- Check if listener receives the update with `sources` field
- Verify `localMedia.sources` is set correctly

**Status**: ⚠️ **Investigation Required** - Add debug logging, verify Firestore document

---

## Priority 4: Enhanced Logging for Diagnostics

### Required Additions

#### 1. `generateQuality` - Bucket Name Logging
```typescript
const bucketName = process.env.STORAGE_BUCKET || 'momsfitnessmojo-65d00.firebasestorage.app';
const bucket = getStorage().bucket(bucketName);
console.log(`🔧 [PROGRESSIVE] generateQuality bucket: ${bucketName}`, {
  envVar: process.env.STORAGE_BUCKET || 'undefined',
  usingDefault: !process.env.STORAGE_BUCKET,
  bucketName: bucketName
});
```

#### 2. `normalizeDoc` - Sources Field Debugging
```typescript
function normalizeDoc(docData: any) {
  const sanitized = sanitizeFirebaseData(docData);
  
  // Enhanced debugging for sources
  if (sanitized.type === 'video') {
    console.log('🔍 [normalizeDoc] Video document sources:', {
      docId: sanitized.id,
      hasSources: !!sanitized.sources,
      sourcesType: typeof sanitized.sources,
      sourcesKeys: sanitized.sources ? Object.keys(sanitized.sources) : [],
      hasHls: !!sanitized.sources?.hls,
      hasHlsMaster: !!sanitized.sources?.hlsMaster,
      hlsValue: sanitized.sources?.hls,
      hlsMasterValue: sanitized.sources?.hlsMaster
    });
  }
  
  // ... rest of function
}
```

#### 3. `MediaCard.tsx` - Real-time Update Debugging
```typescript
// In the real-time sync useEffect (around line 79)
console.log('🔄 [DEBUG] Real-time update received:', {
  mediaId: mediaId,
  serverStatus: serverData.status,
  localStatus: localMedia.status,
  hasHls: !!serverData.sources?.hls, // ✅ Check serverData, not localMedia
  hasHlsMaster: !!serverData.sources?.hlsMaster, // ✅ Check serverData
  sourcesKeys: serverData.sources ? Object.keys(serverData.sources) : [],
  fullSources: serverData.sources // ✅ Log full object for debugging
});
```

**Status**: 🟡 **Enhancement Recommended** - Helps with debugging

---

## Verification Checklist

After implementing fixes, verify:

- [ ] Cloud Tasks queue exists and is RUNNING
- [ ] Service account has `roles/cloudtasks.enqueuer` role
- [ ] `generateQuality` uses explicit bucket name
- [ ] Firestore document contains `sources.hls` and `sources.hlsMaster`
- [ ] Frontend `normalizeDoc` preserves `sources` object
- [ ] Frontend real-time listener receives `sources` field
- [ ] Frontend shows `hasHls: true` after 720p completes
- [ ] 1080p task enqueues successfully (no `NOT_FOUND` error)
- [ ] HLS playback works in `MediaLightbox`

---

## Testing Steps

1. **Test Upload Flow**:
   - Upload a video
   - Monitor Cloud Functions logs for Phase 1 & 2 completion
   - Verify Firestore document has `sources.hls` field

2. **Test Frontend Display**:
   - Check browser console for `hasHls` logs
   - Verify `MediaCard` shows `hasHls: true`
   - Verify `MediaLightbox` can play HLS video

3. **Test Background Generation**:
   - Verify 1080p task enqueues (no `NOT_FOUND` error)
   - Verify 1080p generation completes
   - Verify Firestore `qualityLevels.1080p` is updated

---

## Summary of Required Changes

### Infrastructure (No Code)
1. ✅ Create Cloud Tasks queue
2. ✅ Grant service account IAM role

### Code Changes (3 files)
1. 🔴 `functions/src/index.ts` - Fix `generateQuality` bucket name (~line 2560)
2. 🟡 `src/hooks/useFirestore.ts` - Add sources debugging (~line 28)
3. 🟡 `src/components/media/MediaCard.tsx` - Enhance real-time logging (~line 79)

### Verification
- Check Firestore document structure
- Verify frontend receives `sources` field
- Test end-to-end flow

---

## Next Steps

1. **Immediate**: Create Cloud Tasks queue (infrastructure)
2. **Priority**: Fix bucket name in `generateQuality`
3. **Investigation**: Add debug logging to trace `sources` field flow
4. **Verification**: Test complete upload → HLS playback flow
