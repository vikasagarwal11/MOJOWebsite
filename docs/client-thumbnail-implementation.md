# Client-Side Thumbnail Implementation Plan

## Summary
Extract video thumbnail client-side, store in IndexedDB (NOT Firestore), use as temporary poster until server poster arrives.

## Files to Create/Modify

### NEW: `src/utils/extractVideoThumbnail.ts`
- Extract frame from video file using canvas
- Handle Safari quirks with retry logic
- Return base64 data URL (compressed to 70% quality)

### NEW: `src/utils/clientThumbnailStorage.ts`
- IndexedDB wrapper to store/retrieve thumbnails
- Store by mediaId as key
- Privacy: Only stored client-side, never in Firestore

### MODIFY: `src/hooks/useUploader.ts`
- After `addDocument` returns mediaId
- Call `extractVideoThumbnail(file)` if video
- Call `saveClientThumbnail(mediaId, dataUrl)` to store

### MODIFY: `src/components/media/MediaCard.tsx`
- Add useEffect to load thumbnail from IndexedDB on mount
- Use client thumbnail if exists and `thumbnailPath` is missing
- Delete client thumbnail once server `thumbnailPath` arrives

## Flow

1. User uploads video → Extract thumbnail → Store in IndexedDB
2. MediaCard loads → Check IndexedDB for client thumbnail
3. Display client thumbnail immediately (no blank card!)
4. Cloud Function completes → Updates `thumbnailPath`
5. MediaCard detects `thumbnailPath` → Replace with server poster
6. Delete client thumbnail from IndexedDB (cleanup)

## Benefits
✅ No Firestore document size issues  
✅ No privacy concerns (client-side only)  
✅ Instant thumbnail (no 3s wait)  
✅ Safari compatibility  
✅ Graceful degradation if extraction fails  
✅ Auto cleanup after server poster arrives

## Testing Checklist
- [ ] Test on Chrome
- [ ] Test on Safari (currentTime quirks)
- [ ] Test on Firefox
- [ ] Test with large video files (>100MB)
- [ ] Test with corrupted/invalid video files
- [ ] Test IndexedDB cleanup after server poster
- [ ] Test fallback if extraction fails

## Safety
- No changes to Cloud Functions
- No changes to Firestore schema
- No changes to existing video playback logic
- Only adds client-side enhancements

