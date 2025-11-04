# Frontend Sources Field Fix - Reconstructing Nested Objects

## Problem Identified

**Issue**: Frontend shows `hasSources: false` even though Firestore document contains `sources.hls` and `sources.hlsMaster` fields.

**Root Cause**: Firestore data arrives with **flattened keys** (e.g., `'sources.hls'`, `'sources.hlsMaster'`) instead of a nested `sources` object. This happens when Firestore updates use dot notation. The `normalizeDoc` function only checks `sanitized.sources`, so it marks `hasSources=false` even though the data exists.

**Evidence**:
- Backend logs show: `✅ [ADAPTIVE] Multi-quality HLS ready` with `sources` field
- Firestore Console confirms: `sources.hls` and `sources.hlsMaster` exist in document
- Frontend logs show: `hasSources: false` because data is flattened as `'sources.hls'` instead of `sources.hls`

---

## Fix Implemented

### Reconstruct Nested Objects from Flattened Keys

**Location**: `src/hooks/useFirestore.ts` (lines ~27-82)

**New Function**: `reconstructNestedObjects()`

**What It Does**:
1. Checks for flattened keys like `'sources.hls'` and `'sources.hlsMaster'`
2. Reconstructs them into a nested `sources` object if `sources` doesn't exist
3. Does the same for `qualityLevels` (e.g., `'qualityLevels.720p'`)
4. Deletes the flattened keys to prevent leaks downstream
5. Adds debug logging to track reconstruction

**Code**:
```typescript
function reconstructNestedObjects(data: any): any {
  const reconstructed: any = { ...data };
  const keysToDelete: string[] = [];

  // Reconstruct sources object from flattened keys
  const hls = data['sources.hls'];
  const hlsMaster = data['sources.hlsMaster'];
  if (!data.sources && (hls || hlsMaster)) {
    reconstructed.sources = {};
    if (hls) {
      reconstructed.sources.hls = hls;
      keysToDelete.push('sources.hls');
    }
    if (hlsMaster) {
      reconstructed.sources.hlsMaster = hlsMaster;
      keysToDelete.push('sources.hlsMaster');
    }
  }

  // Reconstruct qualityLevels object from flattened keys
  const qualityLevelKeys = Object.keys(data).filter(key => key.startsWith('qualityLevels.'));
  if (qualityLevelKeys.length > 0 && !data.qualityLevels) {
    reconstructed.qualityLevels = {};
    for (const key of qualityLevelKeys) {
      const qualityName = key.replace('qualityLevels.', '');
      reconstructed.qualityLevels[qualityName] = data[key];
      keysToDelete.push(key);
    }
  }

  // Delete flattened keys to prevent leaks
  for (const key of keysToDelete) {
    delete reconstructed[key];
  }

  return reconstructed;
}
```

**Updated `normalizeDoc`**:
- Calls `reconstructNestedObjects()` after sanitization
- Uses reconstructed data instead of sanitized data
- Enhanced logging shows flattened keys before reconstruction

---

## Expected Outcome

After this fix:

1. ✅ **Flattened keys detected**: `'sources.hls'`, `'sources.hlsMaster'` → `sources.hls`, `sources.hlsMaster`
2. ✅ **Nested object reconstructed**: `sources: { hls: '...', hlsMaster: '...' }`
3. ✅ **Frontend `normalizeDoc`** shows `hasSources: true`
4. ✅ **Frontend real-time listener** receives proper `sources` object
5. ✅ **Frontend `hasHls: true`** appears in logs
6. ✅ **HLS playback works** in MediaLightbox

---

## Testing

### After Deployment

**Frontend Console Logs** (Look for):
- `🔧 [normalizeDoc] Reconstructed sources object from flattened keys:` (when reconstruction happens)
- `🔍 [normalizeDoc] Video document sources check:` should show:
  - `hasSources: true` ✅
  - `sourcesKeys: ['hls', 'hlsMaster']` ✅
  - `hasHls: true` ✅
  - `hasHlsMaster: true` ✅
- `🔄 [DEBUG] Real-time update received:` should show `hasHls: true`

**Verify**:
1. Upload a new video
2. Wait for processing to complete
3. Check frontend console - should see reconstruction log
4. Verify `hasHls: true` appears
5. Open video in MediaLightbox - HLS playback should work

---

## Related Issues

### Cloud Tasks NOT_FOUND Error

The feedback also mentions that Cloud Tasks queue errors still occur:
- `5 NOT_FOUND: Requested entity was not found` for 1080p and 4K tasks
- **Impact**: Only 720p quality will be available until queue is fixed
- **Status**: This is a separate backend infrastructure issue (not fixed by this change)

---

**Status**: ✅ **Fix Implemented - Ready for Testing**

This fix addresses the frontend issue where nested objects were flattened. The backend Firestore update fix (from `FIRESTORE_SOURCES_FIX.md`) should be deployed first, then this frontend fix will properly reconstruct the nested objects.
