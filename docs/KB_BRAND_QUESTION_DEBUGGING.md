# KB Brand Question Debugging Guide

## Why Your Questions Might Not Have Worked

When you asked "who is aina rai?" or "who is the founder of this community?", the system should have:
1. ✅ Detected them as brand questions
2. ✅ Used more lenient similarity thresholds (0.50 instead of 0.35)
3. ✅ Retrieved KB content about Aina Rai and the founder story

If it didn't work, here are the possible reasons:

---

## Possible Issues

### 1. **Code Changes Not Deployed Yet** ⚠️

The improvements I just made to `isBrandQuestion()` function haven't been deployed to your Firebase Functions yet.

**Solution:**
```bash
# Deploy the updated functions
firebase deploy --only functions:chatAsk
```

**Check:** After deployment, the logs should show:
```
[assistant.isBrandQuestion] - Has strong brand context (founder/community): ✅
[assistant.isBrandQuestion] - Result: ✅ BRAND (strong context)
```

---

### 2. **KB Content Not Synced** ⚠️

The static content (founder story, about page) might not be synced to the KB yet.

**Check if static content exists:**
1. Go to Firebase Console → Firestore Database
2. Check `kb_sources` collection
3. Look for documents with `sourceType: 'static'`
4. Should see entries like:
   - `static_founder_story`
   - `static_about_mission`
   - `static_about_story`

**Solution:**
Call the sync function (admin only):
```javascript
// In your app or Firebase Console
const syncFunction = firebase.functions().httpsCallable('syncSiteCopyToKnowledgeBase');
await syncFunction();
```

Or use the admin panel in your app to sync static content.

---

### 3. **Embeddings Not Ready** ⚠️

Even if KB chunks exist, they might not have embeddings yet.

**Check embedding status:**
1. Go to Firebase Console → Firestore Database
2. Check `kb_chunks` collection
3. Look at `embeddingStatus` field:
   - ✅ `ready` = has embedding, can be searched
   - ⏳ `pending` = waiting for embedding
   - ❌ `error` = embedding failed

**Solution:**
If you see `pending` or `error`:
1. Wait a few minutes (embeddings generate automatically)
2. Or trigger backfill:
   ```javascript
   const backfillFunction = firebase.functions().httpsCallable('backfillKnowledgeBaseEmbeddings');
   await backfillFunction();
   ```

---

### 4. **Similarity Scores Too High** ⚠️

Even with brand detection, the vector similarity might be too low.

**What to check in logs:**
```
[assistant.chatAsk] KB Search Results: "who is aina rai?"
[assistant.chatAsk] - Best Distance: 0.523
[assistant.chatAsk] - Good Matches (dist < 0.50): 0
[assistant.chatAsk] 🎯 KB Decision: Not enough confident matches (found 0 < 1). Skipping KB.
```

**Solution:**
If distances are close but just above threshold (e.g., 0.51-0.55), we might need to:
- Lower the threshold slightly (already set to 0.50 for brand)
- Improve the KB content (add more context about founder)
- Check if embeddings are using the right model

---

### 5. **Vector Index Not Ready** ⚠️

Firestore vector search requires an index to be created.

**Check:**
1. Go to Firebase Console → Firestore Database → Indexes
2. Look for vector index on `kb_chunks` collection
3. Should see index with `embedding` field (768 dimensions)

**Solution:**
If index is missing or building:
1. Check `firestore.indexes.json` has the vector index
2. Deploy indexes: `firebase deploy --only firestore:indexes`
3. Wait for index to build (can take a few minutes)

---

## How to Debug Step-by-Step

### Step 1: Check Brand Detection

After deploying, check the logs for:
```
[assistant.isBrandQuestion] Question: "who is aina rai?"
[assistant.isBrandQuestion] - Has explicit brand: true
[assistant.isBrandQuestion] - Result: ✅ BRAND
```

If you see `❌ NON-BRAND`, the brand detection isn't working.

### Step 2: Check KB Search

Look for:
```
[assistant.chatAsk] vector query docs: 16
[assistant.chatAsk] visible docs after filter: 8
[assistant.chatAsk] Using similarity threshold: 0.50 (brand question: true)
```

If `vector query docs: 0`, no KB chunks exist or index isn't ready.

### Step 3: Check Similarity Scores

Look for:
```
[assistant.chatAsk] KB Search Results: "who is aina rai?"
[assistant.chatAsk] - Best Distance: 0.423
[assistant.chatAsk] - Good Matches (dist < 0.50): 3
[assistant.chatAsk] 🎯 KB Decision: ✅ Using KB (Best distance: 0.423).
```

If `Best Distance` is > 0.65, matches are too poor.
If `Good Matches` is 0, threshold is too strict.

---

## Expected Behavior After Fix

### Question: "who is aina rai?"

**Expected Flow:**
1. ✅ Brand detection: `✅ BRAND` (matches "aina rai")
2. ✅ KB search: Finds chunks from `static_founder_story`
3. ✅ Similarity: Distance ~0.30-0.45 (good match)
4. ✅ Decision: `✅ Using KB`
5. ✅ Answer: Returns KB content about Aina Rai with citations

### Question: "who is the founder of this community?"

**Expected Flow:**
1. ✅ Brand detection: `✅ BRAND (strong context)` (matches founder pattern)
2. ✅ KB search: Finds chunks from `static_founder_story`
3. ✅ Similarity: Distance ~0.35-0.50 (good match)
4. ✅ Decision: `✅ Using KB`
5. ✅ Answer: Returns KB content about Aina Rai with citations

---

## Quick Fix Checklist

- [ ] Deploy updated `assistant.ts` function
- [ ] Sync static content to KB (`syncSiteCopyToKnowledgeBase`)
- [ ] Verify KB chunks exist in `kb_chunks` collection
- [ ] Verify embeddings are `ready` (not `pending` or `error`)
- [ ] Verify vector index exists and is built
- [ ] Test question and check logs for brand detection
- [ ] Check similarity scores in logs

---

## If Still Not Working

1. **Check Firebase Function Logs:**
   - Go to Firebase Console → Functions → Logs
   - Look for `[assistant.chatAsk]` and `[assistant.isBrandQuestion]` entries
   - Share the logs to identify the exact issue

2. **Check KB Content:**
   - Verify `static_founder_story` exists in `kb_sources`
   - Verify chunks exist in `kb_chunks` with `sourceKey: 'static_founder_story'`
   - Verify chunks have `embeddingStatus: 'ready'`

3. **Test with Explicit Brand:**
   - Try: "who is the founder of Moms Fitness Mojo?"
   - This should definitely work if KB is set up correctly

---

## Summary

The most likely issues are:
1. **Code not deployed** - Deploy the updated `assistant.ts`
2. **KB not synced** - Run `syncSiteCopyToKnowledgeBase`
3. **Embeddings not ready** - Wait or trigger backfill

After fixing these, your questions should work! 🎯

