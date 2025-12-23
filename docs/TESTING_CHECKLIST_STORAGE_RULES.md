# Storage Rules Changes - Complete Testing Checklist

## Changes Made

### 1. NEW Structured Path for Comments
- Added `/comments/{userId}/{fileName=**}` rule
- Ownership enforced by path-level UID matching
- No metadata required for this path

### 2. LEGACY Flat Path for Comments  
- Kept `/comments/{fileName=**}` rule for backward compatibility
- Uses metadata-based ownership (`customMetadata.userId`)
- Supports existing attachments uploaded before this change

### 3. Media Comments
- Unchanged: `/media-comments/{fileName=**}` still uses metadata validation

### 4. Post Media Deletion
- Simplified to allow any authenticated user (public content assumption)

---

## ✅ Comprehensive Testing Plan

### PRIORITY 1: Comment Upload Functionality (Critical)

#### A. NEW Structured Path (`/comments/{userId}/{fileName}`)
**Note:** This path requires client-side code to upload to user-specific folders

- [ ] Upload image to post comment
- [ ] Upload video to post comment
- [ ] Upload multiple images in one comment
- [ ] Verify files are stored in correct path: `comments/{userId}/{filename}`
- [ ] Verify image displays correctly after upload
- [ ] Verify deletion works for comment author
- [ ] Verify deletion works for admin
- [ ] Verify non-author cannot delete others' attachments

#### B. LEGACY Flat Path (`/comments/{filename}`)
**Note:** Existing files use this path, client needs to support both

- [ ] Upload image to post comment (should work if no user folder structure)
- [ ] Verify metadata is set correctly
- [ ] Verify existing comments with attachments still load (backward compatibility)
- [ ] Verify deletion respects ownership via metadata

---

### PRIORITY 2: Media Comment Uploads

- [ ] Upload image to media comment
- [ ] Upload video to media comment
- [ ] Verify metadata validation works
- [ ] Verify deletion permissions work correctly
- [ ] Verify ownership enforcement works

**Storage path:** `/media-comments/{fileName=**}` (metadata-based)

---

### PRIORITY 3: User Media Uploads (Regression Check)

- [ ] Upload photos to Media feed
- [ ] Upload videos to Media feed
- [ ] Verify thumbnails generate correctly (resize extension)
- [ ] Verify HLS transcoding completes for videos
- [ ] Upload multiple media files at once
- [ ] Verify all media displays correctly

**Storage path:** `/media/{userId}/{allPaths=**}`

---

### PRIORITY 4: Post Media Uploads (Regression Check)

- [ ] Create a post with images
- [ ] Create a post with videos
- [ ] Verify post displays correctly
- [ ] Verify media plays/displays in post
- [ ] Verify deletion works for any authenticated user

**Storage path:** `/posts/{fileName=**}`

---

### PRIORITY 5: Post Deletion & Cascading Cleanup (Critical)

#### As Post Author:
- [ ] Delete your own post
- [ ] Verify post is deleted from UI
- [ ] Verify all comments are deleted (cascade)
- [ ] Verify all comment attachments are deleted
- [ ] Verify post media is cleaned up
- [ ] Check Firestore to confirm all subcollections deleted

#### As Admin:
- [ ] Delete someone else's post
- [ ] Verify post is deleted from UI
- [ ] Verify all comments cascade correctly
- [ ] Verify all attachments cleaned up
- [ ] Verify media cleanup works
- [ ] **CRITICAL:** Check for any audit-log errors in console (should not block main action)

---

### PRIORITY 6: Comment Deletion (Admin & Author)

#### As Comment Author:
- [ ] Delete your own comment
- [ ] Verify comment is deleted
- [ ] Verify attachments are deleted
- [ ] Verify replies are handled correctly (if implemented)

#### As Admin:
- [ ] Delete someone else's comment
- [ ] Verify comment is deleted
- [ ] Verify attachments are deleted
- [ ] **CHECK:** Ensure Firestore audit log writes don't fail
- [ ] **CHECK:** If audit logs are enabled, verify Firestore rules allow the write

---

### PRIORITY 7: Ownership & Access Control

#### Upload Permissions:
- [ ] Try uploading as authenticated user (should work)
- [ ] Try uploading without authentication (should fail)
- [ ] Try uploading to wrong user folder (should fail)
- [ ] Try uploading to legacy path with wrong metadata (should fail)

#### Read Permissions:
- [ ] Verify you can view all comment attachments (even if not author)
- [ ] Verify you can view media comment attachments
- [ ] Verify all images display correctly in timeline/feed

#### Delete Permissions:
- [ ] As author: Delete own attachment (should work)
- [ ] As admin: Delete any attachment (should work)
- [ ] As non-author non-admin: Delete others' attachment (should fail)

---

### PRIORITY 8: Legacy File Compatibility (Critical)

**CRITICAL:** Ensure old comments with existing attachments still work

- [ ] Load existing posts/comments created before this change
- [ ] Verify old comment attachments still display
- [ ] Verify old attachments can be viewed by anyone
- [ ] Verify old attachments can be deleted by owner or admin
- [ ] Check browser console for any 403 errors on legacy files
- [ ] Test on multiple old posts/comments

**Expected behavior:** Legacy files under `/comments/{filename}` should:
- Load without errors
- Display correctly
- Respect deletion permissions via metadata

---

### PRIORITY 9: File Size & Type Restrictions

- [ ] Try uploading file > 15MB to comments (should fail)
- [ ] Try uploading file > 15MB to media-comments (should fail)
- [ ] Try uploading file > 10 authorityMB to posts (should fail)
- [ ] Try uploading non-image/video to comments (should fail)
- [ ] Try uploading non-image/video to posts (should fail)
- [ ] Verify allowed image types work: jpg, png, gif, webp
- [ ] Verify allowed video types work: mp4, mov, webm

---

### PRIORITY 10: Image Resize Extension (Thumbnail Generation)

- [ ] Upload a new post with image
- [ ] Wait 2-5 seconds after upload
- [ ] Check Storage for thumbnail file: `thumbnails/{filename}_400x400.webp`
- [ ] Verify thumbnail is generated automatically
- [ ] Verify original image still loads
- [ ] Test with multiple images
- [ ] Test with different image orientations (portrait/landscape)

**Storage extension:** `storage-resize-images` should auto-generate thumbnails

---

### PRIORITY 11: Profile & Event Images

- [ ] Upload/update profile picture
- [ ] Verify profile picture displays in user profile
- [ ] Verify profile picture displays in comments/posts
- [ ] As admin: Upload event cover image
- [ ] As admin: Upload event gallery images
- [ ] Verify images display on event page

---

### PRIORITY 12: Edge Cases & Error Handling

- [ ] Try uploading to non-existent path (should fail gracefully)
- [ ] Try uploading with invalid metadata (should fail)
- [ ] Verify error messages are user-friendly
- [ ] Test with slow network (progress indicators work)
- [ ] Test with interrupted upload (handled gracefully)
- [ ] Verify no console errors during normal flow

---

### PRIORITY 13: Cross-Browser & Device Testing

- [ ] Test on Chrome (latest)
- [ ] Test on Firefox (latest)
- [ ] Test on Safari (latest)
- [ ] Test on mobile Chrome (Android)
- [ ] Test on mobile Safari (iOS)
- [ ] Verify touch interactions work on mobile

---

### PRIORITY 14: Performance & Caching

- [ ] Clear browser cache and test uploads
- [ ] Clear service worker cache
- [ ] Verify new rules are applied (check requests)
- [ ] Test with DevTools Network tab open
- [ ] Verify no unnecessary re-uploads
- [ ] Check bundle size impact

---

## Firestore Rules Audit (If Using Audit Logs)

**Issue:** Comment deletion might fail if audit logs write to Firestore

- [ ] Check if audit logs are enabled in `functions/src/index.ts`
- [ ] Review Firestore security rules for audit path
- [ ] Ensure rules allow admin writes to audit log collection
- [ ] Test admin comment deletion and check for errors
- [ ] If errors occur, update Firestore rules:

```javascript
// Example Firestore rule if using audit logs
match /audit/{auditId} {
  allow write: if request.auth != null && 
    (request.auth.uid == resource.data.userId || 
     firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role == 'admin');
}
```

---

## Test Results Template

```
Date: [DATE]
Tester: [NAME]
Browser: [CHROME/FIREFOX/SAFARI/MOBILE]
Environment: [PRODUCTION/STAGING]

### Critical Paths (P0)
- [ ] Comment upload (new path): PASS / FAIL
- [ ] Comment upload (legacy path): PASS / FAIL
- [ ] Media comment upload: PASS / FAIL
- [ ] Post deletion cascade: PASS / FAIL
- [ ] Legacy file compatibility: PASS / FAIL

### Core Functionality (P1)
- [ ] User media upload: PASS / FAIL
- [ ] Post media upload: PASS / FAIL
- [ ] Comment deletion (author): PASS / FAIL
- [ ] Comment deletion (admin): PASS / FAIL
- [ ] Ownership enforcement: PASS / FAIL

### Additional Tests
- [ ] File size restrictions: PASS / FAIL
- [ ] File type restrictions: PASS / FAIL
- [ ] Thumbnail generation: PASS / FAIL
- [ ] Profile images: PASS / FAIL
- [ ] Event images: PASS / FAIL

### Issues Found
[Detailed description of any issues]

### Browser Console Errors
[Any errors observed]

### Network Failures
[Any failed requests]

### Notes
[Additional observations]
```

---

## Quick Smoke Test Script

```bash
# 1. Deploy latest changes
npm run build:prod
firebase deploy --only storage,hosting --project=momsfitnessmojo-65d00

# 2. Clear cache
# Browser: Ctrl+Shift+R (hard refresh)
# Service Worker: DevTools > Application > Service Workers > Unregister

# 3. Test upload flow
# - Navigate to any post
# - Upload an image to a comment
# - Verify no 403 error
# - Verify image displays
# - Verify you can delete it

# 4. Test legacy compatibility
# - Navigate to old post (created before change)
# - Verify old comment attachments still display
# - Verify no console errors

# 5. Test deletion cascade
# - As admin, delete a post with comments and attachments
# - Verify everything is cleaned up
# - Check Firestore for orphaned documents

# 6. Test thumbnail generation
# - Upload new post image
# - Wait 5 seconds
# - Check Storage for thumbnail file
```

---

## Known Limitations & Workarounds

### 1. Dual Path Strategy
**Issue:** Client needs to support both starterructured and flat paths

**Workaround:** Check client code (`CommentSection.tsx`) to ensure it:
- Uploads to structured path: `comments/{userId}/{filename}`
- OR sets correct metadata for flat path
- Provides clear error messages if upload fails

### 2. Legacy File Support
**Issue:** Old files may not have proper metadata

**Solution:** Legacy rule (`/comments/{filename}`) with `matchesRequestOwner()` fallback handles this. Test thoroughly.

### 3. Post Media Deletion Security
**Issue:** Any authenticated user can delete post media

**Rationale:** Posts are public content. This is acceptable for now but can be tightened later with metadata.

### 4. Audit Log Requirements (If Enabled)
**Issue:** Audit log writes to Firestore might fail due to security rules

**Solution:** Update Firestore rules to allow admin writes to audit collection OR disable audit logs if not critical.

---

## Rollback Plan (If Issues Found)

```bash
# 1. Revert storage rules to previous version
git checkout HEAD~1 storage.rules
firebase deploy --only storage --project=momsfitnessmojo-65d00

# 2. Revert client changes
git checkout HEAD~1 src/components/common/CommentSection.tsx
npm run build:prod
firebase deploy --only hosting --project=momsfitnessmojo-蒜65d00
```

---

## Success Criteria

✅ **All Priority 0 & 1 tests pass**  
✅ **No 403 errors on uploads**  
✅ **Legacy files still work**  
✅ **Deletion cascades work correctly**  
✅ **No regressions in existing functionality**  
✅ **Performance acceptable (< 3s upload for images)**  
✅ **No console errors in normal flow**  
✅ **Thumbnails generate correctly**

---

**Last Updated:** 2025-10-28  
**Deployed Version:** storage.rules v3 (dual-path strategy)  
**Client Code:** CommentSection.tsx with metadata support
