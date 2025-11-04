# Storage Deletion Fix Plan

## Problem Statement

When media items are deleted from Firestore, the corresponding files in Firebase Storage are not being fully cleaned up. Specifically:

1. **HLS folders are not being deleted** - The entire HLS folder structure (containing video segments and playlists) remains in Storage after deletion
2. **Root cause**: The `sources` field is `undefined` when the document is deleted, so the HLS deletion logic never executes
3. **Impact**: Storage costs accumulate over time as orphaned HLS files remain in Storage

## Current Behavior

### What Works ✅
- Original video/image files are deleted
- Thumbnail files are deleted
- Extension-generated thumbnails are deleted
- Thumbnails folders are deleted

### What Doesn't Work ❌
- **HLS folders are NOT deleted** - The entire HLS folder structure remains
- Root cause: `if (deletedData.sources?.hls)` check fails because `sources` is `undefined` when document is deleted

## Root Cause Analysis

### Issue 1: `sources` Field is Undefined
When a Firestore document is deleted, `event.data?.data()` may not include all fields, especially if:
- The document was deleted before HLS generation completed
- The document was deleted via client-side code before `sources` was populated
- Firestore snapshot at deletion time doesn't include all fields

**Evidence from logs:**
```json
{
  "sources": undefined,
  "filePath": "media/seD0CPP2EVOGbMsZaB3sndzkQSx2/1fdf3ae5-fde2-4480-95c3-33a2f3eb7a6e/14085683_1920_1080_25fps.mp4",
  "type": "video"
}
```

### Issue 2: HLS Path Calculation
The HLS folder structure is:
```
media/{userId}/{batchId}/hls/{videoName}/{quality}/index.m3u8
```

But the current deletion logic only runs if `sources?.hls` exists, which may not be the case.

## Proposed Solution

### Strategy: Always Delete HLS for Videos
Instead of relying on `sources` field existence, **always attempt HLS deletion for videos** based on the `filePath` and `type` fields.

### Implementation Details

#### 1. Enhanced HLS Deletion Logic
- **Check for video type**: Always attempt HLS deletion if `type === 'video'`
- **Multiple path strategies**: Try multiple possible HLS folder paths to ensure we catch all variations
- **Graceful handling**: If HLS folder doesn't exist, log as warning (not error)

#### 2. HLS Path Calculation
Based on the actual HLS structure:
- `filePath`: `media/{userId}/{batchId}/{fileName}`
- `hlsBasePath`: `media/{userId}/{batchId}/hls/{baseName}/`
- `hlsFolder`: `media/{userId}/{batchId}/hls/` (entire HLS folder)

#### 3. Deletion Strategy
1. **Primary**: Delete entire `hls/` folder (catches all qualities and videos)
2. **Secondary**: Delete video-specific HLS folder if it exists
3. **Tertiary**: Delete individual HLS playlists if `sources` is defined

### Code Changes

```typescript
// 4. HLS segments for videos (delete entire HLS folder)
// Always attempt HLS deletion for videos, even if sources is undefined
// This handles cases where document was deleted before HLS was fully generated
if (deletedData.type === 'video' && deletedData.filePath) {
  const folderPath = deletedData.filePath.substring(0, deletedData.filePath.lastIndexOf('/'));
  const fileName = deletedData.filePath.split('/').pop() || '';
  const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
  
  // HLS structure: media/{userId}/{batchId}/hls/{videoName}/{quality}/index.m3u8
  // Try multiple possible HLS paths to ensure we catch all variations
  const hlsPaths = [
    `${folderPath}/hls/`, // Entire hls folder (catches all qualities)
    `${folderPath}/hls/${baseName}/`, // Video-specific HLS folder
  ];
  
  // Add HLS master playlist if sources.hlsMaster exists
  if (deletedData.sources?.hlsMaster) {
    filesToDelete.push({ path: deletedData.sources.hlsMaster, type: 'hls-master-playlist' });
  }
  
  // Add HLS fallback playlist if sources.hls exists
  if (deletedData.sources?.hls) {
    filesToDelete.push({ path: deletedData.sources.hls, type: 'hls-playlist' });
  }
  
  // Add all possible HLS folder paths (deduplicate)
  const uniqueHlsPaths = [...new Set(hlsPaths)];
  uniqueHlsPaths.forEach(hlsPath => {
    filesToDelete.push({ 
      path: hlsPath, 
      type: 'hls-folder',
      isFolder: true // Mark as folder for special handling
    });
  });
  
  console.log(`🗑️ [CLOUD] [DEBUG] HLS deletion paths for video:`, {
    folderPath,
    baseName,
    hlsPaths: uniqueHlsPaths,
    hasSources: !!deletedData.sources,
    hasHlsMaster: !!deletedData.sources?.hlsMaster,
    hasHls: !!deletedData.sources?.hls
  });
}
```

## Testing Plan

### Test Cases

1. **Delete video with HLS generated** ✅
   - Expected: Original file, thumbnail, and entire HLS folder deleted
   - Verify: Storage folder is empty after deletion

2. **Delete video before HLS generation** ✅
   - Expected: Original file and thumbnail deleted, HLS folder deletion attempted (may not exist)
   - Verify: No errors, graceful handling of missing HLS folder

3. **Delete video with partial HLS** ✅
   - Expected: All generated HLS files deleted, even if incomplete
   - Verify: No orphaned segments remain

4. **Delete image** ✅
   - Expected: No HLS deletion attempted (only images/videos)
   - Verify: Only image and thumbnails deleted

### Success Criteria

- ✅ All HLS folders are deleted when videos are deleted
- ✅ No orphaned HLS files remain in Storage
- ✅ No errors occur when HLS folder doesn't exist
- ✅ Storage costs decrease over time (no accumulation of orphaned files)

## Deployment Plan

### Phase 1: Deploy Fix
1. Update `onMediaDeletedCleanup` function with enhanced HLS deletion logic
2. Deploy to production
3. Monitor logs for HLS deletion success

### Phase 2: Verification
1. Test deletion with new video uploads
2. Verify Storage folders are cleaned up after deletion
3. Check logs for any errors or warnings

### Phase 3: Cleanup (Optional)
1. Identify existing orphaned HLS folders in Storage
2. Create cleanup script to remove orphaned folders
3. Run cleanup script manually or schedule periodic cleanup

## Risk Assessment

### Low Risk ✅
- **Graceful handling**: If HLS folder doesn't exist, it's logged as a warning (not error)
- **No breaking changes**: Existing deletion logic for other file types remains unchanged
- **Backward compatible**: Works with both old and new HLS folder structures

### Potential Issues ⚠️
- **Multiple deletion attempts**: If both `hls/` and `hls/{baseName}/` exist, both will be attempted (safe, but may log warnings)
- **Performance**: Deleting entire `hls/` folder may take longer if there are many files (acceptable trade-off)

## Monitoring

### Logs to Monitor
- `🗑️ [CLOUD] Starting storage cleanup for deleted media`
- `🗑️ [CLOUD] [DEBUG] HLS deletion paths for video`
- `🗑️ [CLOUD] ✅ Deleted hls-folder: X files in {path}`
- `🗑️ [CLOUD] ⚠️ Folder empty or not found: {path}`

### Metrics to Track
- **Deletion success rate**: Percentage of deletions that successfully remove HLS folders
- **Storage cleanup time**: Time taken to delete all files for a media item
- **Orphaned files count**: Number of HLS folders remaining after deletion (should be 0)

## Future Enhancements

1. **Batch folder cleanup**: If entire batch folder becomes empty, delete it too
2. **Async deletion**: For large HLS folders, consider async deletion to avoid timeout
3. **Retry logic**: Add retry logic for failed deletions
4. **Cleanup job**: Periodic job to identify and clean up orphaned files

## References

- [Firebase Storage Delete Files](https://firebase.google.com/docs/storage/admin/delete-files)
- [Cloud Functions onDocumentDeleted](https://firebase.google.com/docs/functions/firestore-events)
- Current implementation: `functions/src/index.ts:1004-1134`


