# KB Diagnostic Guide - How to Check KB Status

## Quick Check via Admin Panel

The easiest way is to use your app's admin panel:

1. **Go to Admin Panel → Knowledge Base Tab**
2. **Check Embedding Status** - Should show:
   - Ready: X chunks
   - Pending: Y chunks
   - Error: Z chunks

3. **Check Static Entries** - Should see:
   - `static_founder_story` entry
   - With chunk count > 0

---

## Method 1: Using Admin Panel (Easiest)

### Step 1: Check KB Sources
1. Go to your app → Admin Panel → Knowledge Base Tab
2. Look for "Static Entries" section
3. Check if `static_founder_story` exists
4. Check the "Chunk Count" - should be > 0

### Step 2: Check Embedding Status
1. In the same Admin Panel, look for "Embedding Status"
2. Should show:
   - Ready: Should be > 0
   - Pending: Should be 0 (or low)
   - Error: Should be 0

### Step 3: Sync if Needed
1. If `static_founder_story` is missing, click "Sync Static Content" button
2. Wait a few minutes for chunks to be created
3. Wait a few more minutes for embeddings to be generated

---

## Method 2: Using Firebase Console (Manual)

### Check KB Sources
1. Go to [Firebase Console](https://console.firebase.google.com/project/momsfitnessmojo-65d00/firestore)
2. Navigate to **Firestore Database**
3. Open `kb_sources` collection
4. Look for document: `static_founder_story`
5. **What to check:**
   - ✅ Document exists
   - ✅ `sourceType: 'static'`
   - ✅ `chunkIds` array exists and has items
   - ✅ `title` contains "Aina Rai" or "Founder"

### Check KB Chunks
1. In Firestore, open `kb_chunks` collection
2. Filter by: `sourceKey == 'static_founder_story'`
3. **What to check:**
   - ✅ Multiple chunks exist (usually 2-5 chunks)
   - ✅ Each chunk has `embeddingStatus: 'ready'`
   - ✅ Each chunk has `embedding` field (vector data)
   - ❌ If `embeddingStatus: 'pending'` → embeddings not ready
   - ❌ If `embeddingStatus: 'error'` → check `embeddingError` field

### Check Function Logs
1. Go to [Firebase Console → Functions](https://console.firebase.google.com/project/momsfitnessmojo-65d00/functions)
2. Click on `chatAsk` function
3. Go to **Logs** tab
4. Filter by: `[assistant.isBrandQuestion]` or `[assistant.chatAsk]`
5. **What to look for:**
   - ✅ `[assistant.isBrandQuestion] - Result: ✅ BRAND`
   - ✅ `[assistant.chatAsk] Using similarity threshold: 0.50`
   - ✅ `[assistant.chatAsk] KB Search Results: ... Best Distance: 0.XXX`
   - ✅ `[assistant.chatAsk] 🎯 KB Decision: ✅ Using KB`

---

## Method 3: Using Node Script (Advanced)

If you have Firebase Admin SDK set up:

```bash
node check-kb-status.js
```

**Requirements:**
- Node.js installed
- Firebase Admin SDK: `npm install firebase-admin`
- Service account key file (optional - can use Application Default Credentials)

---

## Method 4: Using Cloud Function (Via App)

You can call the existing function from your app's browser console:

```javascript
// In browser console (while logged in as admin)
const getStatus = firebase.functions().httpsCallable('getKnowledgeEmbeddingStatus');
const result = await getStatus();
console.log(result.data);
```

This will show:
- Total chunks, ready, pending, error counts
- Recent errors (if any)

---

## Expected Results

### ✅ Everything Working:
- `static_founder_story` exists in `kb_sources`
- 2-5 chunks exist in `kb_chunks` with `sourceKey: 'static_founder_story'`
- All chunks have `embeddingStatus: 'ready'`
- All chunks have `embedding` field (vector data)
- Function logs show brand detection working
- Function logs show KB being used (not general knowledge)

### ❌ Common Issues:

**Issue 1: Source Missing**
- Symptom: `static_founder_story` not in `kb_sources`
- Fix: Run `syncSiteCopyToKnowledgeBase()` function

**Issue 2: Chunks Missing**
- Symptom: Source exists but `chunkIds` is empty
- Fix: Wait a few minutes or trigger chunking manually

**Issue 3: Embeddings Pending**
- Symptom: Chunks exist but `embeddingStatus: 'pending'`
- Fix: Wait a few minutes or run `backfillKnowledgeBaseEmbeddings()`

**Issue 4: Embeddings Error**
- Symptom: `embeddingStatus: 'error'`
- Fix: Check `embeddingError` field, fix API key issues, run `retryFailedKnowledgeEmbeddings()`

**Issue 5: Brand Detection Not Working**
- Symptom: Logs show `❌ NON-BRAND` for founder questions
- Fix: Code changes not deployed, redeploy `chatAsk` function

**Issue 6: Similarity Scores Too High**
- Symptom: Logs show `Best Distance: 0.6+` (too high)
- Fix: Lower thresholds or improve KB content

---

## Quick Fixes

### If KB Not Synced:
```javascript
// In browser console (admin only)
const sync = firebase.functions().httpsCallable('syncSiteCopyToKnowledgeBase');
await sync();
```

### If Embeddings Pending:
```javascript
// In browser console (admin only)
const backfill = firebase.functions().httpsCallable('backfillKnowledgeBaseEmbeddings');
await backfill({ limit: 50 });
```

### If Embeddings Error:
```javascript
// In browser console (admin only)
const retry = firebase.functions().httpsCallable('retryFailedKnowledgeEmbeddings');
await retry({ limit: 50 });
```

---

## Next Steps After Checking

1. **If KB not synced** → Sync static content
2. **If embeddings pending** → Wait or trigger backfill
3. **If embeddings error** → Check GEMINI_API_KEY, retry failed
4. **If brand detection not working** → Redeploy chatAsk function
5. **If similarity scores too high** → Check logs, may need to adjust thresholds

---

## Still Not Working?

Check the function logs for these specific entries when you ask "who is aina rai?":

```
[assistant.isBrandQuestion] Question: "who is aina rai?"
[assistant.isBrandQuestion] - Has explicit brand: true
[assistant.isBrandQuestion] - Result: ✅ BRAND

[assistant.chatAsk] Using similarity threshold: 0.50 (brand question: true)
[assistant.chatAsk] KB Search Results: "who is aina rai?"
[assistant.chatAsk] - Best Distance: 0.XXX
[assistant.chatAsk] - Good Matches (dist < 0.50): X
[assistant.chatAsk] 🎯 KB Decision: ✅ Using KB
```

If you see `❌ NON-BRAND` or `Skipping KB`, that's the issue!

