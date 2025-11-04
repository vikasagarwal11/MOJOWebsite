# Firestore Sources Field Fix

## Problem Identified

**Issue**: Frontend shows `hasSources: false` even after backend logs indicate "Multi-quality HLS ready"

**Root Cause**: Firestore `set()` with `merge: true` doesn't deeply merge nested objects. The code was setting the entire `sources` object, which could fail if there was a previous update or if Firestore's merge behavior didn't work as expected.

**Evidence from Logs**:
- Backend: `✅ [ADAPTIVE] Multi-quality HLS ready` appears in logs
- Frontend: `hasSources: false` consistently, even after status changes to "ready"
- Document keys increase (19 → 28) but `sources` field never appears

---

## Fix Implemented

### Manual Merge Approach

**Location**: `functions/src/index.ts` (lines ~1253-1310)

**Changes**:
1. ✅ **Read current document** before updating
2. ✅ **Extract existing `sources` object** (if any)
3. ✅ **Manually merge** new `hlsMaster` and `hls` values with existing sources
4. ✅ **Write merged object** back to Firestore
5. ✅ **Verify the update** by reading the document back
6. ✅ **Enhanced logging** at every step for debugging

**Code**:
```typescript
// Manual merge approach: Read current document, merge sources object, then update
const currentDoc = await mediaRef.get();
const currentData = currentDoc.exists ? currentDoc.data() : {};
const currentSources = currentData?.sources || {};

// Merge sources object manually
const mergedSources = {
  ...currentSources,
  hlsMaster: masterPlaylistStorage,
  hls: fallbackHlsPath
};

// Write merged sources
await mediaRef.set({
  sources: mergedSources,
  transcodeStatus: 'ready',
  // ... other fields
}, { merge: true });

// Verify the update
const verifyDoc = await mediaRef.get();
const verifyData = verifyDoc.exists ? verifyDoc.data() : {};
console.log(`✅ [ADAPTIVE] Firestore updated with sources:`, {
  hasSources: !!verifyData.sources,
  sourcesKeys: verifyData.sources ? Object.keys(verifyData.sources) : [],
  hasHlsMaster: !!verifyData.sources?.hlsMaster,
  hasHls: !!verifyData.sources?.hls
});
```

---

## Next Steps

### 1. Deploy the Fix
```bash
.\deploy-prod.ps1 functions -SkipChecks
```

### 2. Test with New Upload

After deployment, upload a test video and check logs:

**Cloud Functions Logs** (Look for):
- `🔍 [ADAPTIVE] Starting final Firestore update for {mediaId}`
- `🔍 [ADAPTIVE] Reading current Firestore document`
- `🔍 [ADAPTIVE] Current document data`
- `🔍 [ADAPTIVE] About to update Firestore with merged sources`
- `✅ [ADAPTIVE] Firestore updated with sources` (with verification data)
- `✅ [ADAPTIVE] Multi-quality HLS ready`

**Frontend Console** (Look for):
- `🔍 [normalizeDoc] Video document sources check` should show `hasSources: true`
- `🔄 [DEBUG] Real-time update received` should show `fullSources` object
- `hasHls: true` should appear in logs

### 3. Verify Firestore Document

Manually check in Firebase Console:
- Open Firestore → `media` collection
- Find the media document
- Verify `sources.hlsMaster` and `sources.hls` fields exist

---

## Expected Outcome

After deployment and testing:

1. ✅ **Backend logs** show all debug messages with `sources` field details
2. ✅ **Firestore document** contains `sources.hlsMaster` and `sources.hls` fields
3. ✅ **Frontend `normalizeDoc`** log shows `hasSources: true`
4. ✅ **Frontend real-time listener** receives `sources` field
5. ✅ **Frontend `hasHls: true`** appears in logs
6. ✅ **HLS playback works** in MediaLightbox

---

## If Issue Persists

If `sources` field still doesn't appear after this fix:

1. **Check Firestore Security Rules** - Verify rules allow writing `sources` field
2. **Check for conflicting updates** - Look for other code paths updating the same document
3. **Check error logs** - Look for any silent failures in Cloud Functions logs
4. **Check document version conflicts** - Verify no concurrent updates are overwriting

---

**Status**: ✅ **Fix Implemented - Ready for Deployment**
