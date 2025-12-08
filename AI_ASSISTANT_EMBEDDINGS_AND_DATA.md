# AI Assistant: Embeddings, Weights, and Knowledge Base Data

## Quick Answer

**The embeddings (vector weights) are NOT stored in a file** - they are stored in **Firestore** (your database) in the `kb_chunks` collection.

However, the **code that generates and manages them** is in these files:

### Key Files:

1. **`functions/src/utils/embeddings.ts`** ⭐
   - Generates embeddings using Google Gemini API
   - Model: `text-embedding-004` (768 dimensions)

2. **`functions/src/kbEmbeddingWorker.ts`** ⭐
   - Processes embeddings and stores them in Firestore
   - Handles embedding status and errors

3. **`functions/src/knowledgeBase.ts`**
   - Creates knowledge base chunks from content
   - Syncs posts, events, challenges to knowledge base

4. **`functions/src/assistant.ts`** (lines 1175-1224)
   - Uses embeddings to search knowledge base
   - Performs vector similarity search

---

## How It Works

### 1. Embedding Generation

**File:** `functions/src/utils/embeddings.ts`

```typescript
// Uses Google Gemini API to generate embeddings
const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
const result = await model.embedContent(clean);
const embedding = result.embedding?.values; // Returns 768-dimensional vector
```

**Model Used:** Google's `text-embedding-004`
- **Dimensions:** 768
- **API:** Google Generative AI (Gemini)

### 2. Storage Location

**NOT in a file** - Stored in **Firestore Database**:

```
Collection: kb_chunks/{chunkId}
  - embedding: [vector field]  ← The actual weights/embeddings
  - text: string               ← Original text chunk
  - sourceId: string
  - sourceType: 'post' | 'event' | 'challenge' | 'static'
  - embeddingStatus: 'pending' | 'processing' | 'ready' | 'error'
  - embeddingProvider: 'gemini-text-embedding-004'
```

### 3. Processing Pipeline

**File:** `functions/src/kbEmbeddingWorker.ts`

1. When a document is created in `kb_chunks`, a trigger fires
2. `ensureChunkEmbedding` function processes it
3. Calls `embedText()` to generate embedding
4. Stores embedding in Firestore as a vector field

```typescript
// From kbEmbeddingWorker.ts
const embedding = await embedText(text);
await ref.update({
  embedding: FieldValue.vector(embedding),  // ← Stored as vector
  embeddingStatus: 'ready',
  embeddingProvider: 'gemini-text-embedding-004',
});
```

### 4. Knowledge Base Creation

**File:** `functions/src/knowledgeBase.ts`

- Automatically syncs content to knowledge base:
  - Posts → `syncPostToKnowledgeBase`
  - Events → `syncEventToKnowledgeBase`
  - Challenges → `syncChallengeToKnowledgeBase`

- Text is chunked (900 chars with 200 char overlap)
- Each chunk gets its own embedding

### 5. Search & Retrieval

**File:** `functions/src/assistant.ts` (lines 1180-1195)

```typescript
// Vector similarity search
const vectorQuery = chunksQuery.findNearest({
  vectorField: 'embedding',
  queryVector: embedding,          // User's question embedding
  limit: 16,
  distanceMeasure: 'COSINE',
  distanceResultField: 'distance',
});
```

---

## Where Data Actually Lives

### Database Collections:

1. **`kb_sources/{sourceKey}`**
   - Metadata about knowledge sources
   - Links to chunks
   - Example: `event_123`, `post_456`

2. **`kb_chunks/{chunkId}`** ⭐ **THIS IS WHERE EMBEDDINGS LIVE**
   - Each chunk has an `embedding` field (vector)
   - 768-dimensional vector
   - Used for similarity search

### Vector Search Index:

**File:** `firestore.indexes.json` (lines 698-716)

```json
{
  "collectionGroup": "kb_chunks",
  "fields": [
    {
      "fieldPath": "embedding",
      "vectorConfig": {
        "dimension": 768,
        "flat": {}
      }
    }
  ]
}
```

---

## File Structure Summary

```
functions/src/
├── utils/
│   └── embeddings.ts          ← Generates embeddings (calls Gemini API)
├── kbEmbeddingWorker.ts       ← Processes & stores embeddings
├── knowledgeBase.ts           ← Creates KB chunks from content
└── assistant.ts               ← Uses embeddings for search

Firestore Database:
├── kb_sources/{sourceKey}     ← Source metadata
└── kb_chunks/{chunkId}        ← **ACTUAL EMBEDDINGS STORED HERE**
    ├── embedding: [vector]    ← 768-dim vector (the "weights")
    ├── text: string
    └── embeddingStatus: string
```

---

## Important Notes

### 1. **No Local Model Files**
- Embeddings are generated via API (Google Gemini)
- Not using a local model
- No `.pt`, `.pb`, `.h5`, or `.onnx` files

### 2. **Embeddings Are Stored in Database**
- Firestore stores vectors natively
- Vector field type (not just an array)
- Indexed for fast similarity search

### 3. **Generated On-Demand**
- When content is created/updated, embeddings are generated automatically
- Cloud Function trigger processes new chunks
- Can take a few seconds per chunk

### 4. **Configuration**
- Model: `text-embedding-004` (Google Gemini)
- Dimensions: 768
- API Key: `GEMINI_API_KEY` environment variable

---

## To View Your Embeddings

### Option 1: Firestore Console
1. Go to Firebase Console
2. Navigate to Firestore Database
3. Open `kb_chunks` collection
4. Click on any document
5. See `embedding` field (will show as vector data)

### Option 2: Admin Panel
Check if you have admin tools to view embedding status:
- `getKnowledgeEmbeddingStatus` Cloud Function
- Shows counts of ready/pending/error embeddings

---

## To Rebuild/Regenerate Embeddings

### Backfill Function:
**File:** `functions/src/kbEmbeddingWorker.ts` (line 140)

```typescript
backfillKnowledgeBaseEmbeddings
// Callable function to regenerate embeddings
```

**Usage:**
- Admin-only function
- Processes chunks in batches
- Can retry failed embeddings

### Retry Failed:
```typescript
retryFailedKnowledgeEmbeddings
// Retries chunks with 'error' or 'pending' status
```

---

## Summary

| Item | Location |
|------|----------|
| **Embedding Generation Code** | `functions/src/utils/embeddings.ts` |
| **Embedding Processing** | `functions/src/kbEmbeddingWorker.ts` |
| **Knowledge Base Sync** | `functions/src/knowledgeBase.ts` |
| **Vector Search Code** | `functions/src/assistant.ts` (lines 1180-1195) |
| **Actual Embeddings Data** | Firestore: `kb_chunks/{chunkId}.embedding` |
| **Model Used** | Google Gemini `text-embedding-004` (via API) |
| **Vector Dimensions** | 768 |
| **Storage Type** | Firestore Vector Field |

---

## If You Want to Export Embeddings

Since embeddings are in Firestore, you would need to:

1. **Query Firestore:**
```typescript
const chunks = await db.collection('kb_chunks')
  .where('embeddingStatus', '==', 'ready')
  .get();

chunks.forEach(doc => {
  const embedding = doc.get('embedding');
  // embedding is a vector array
});
```

2. **Export to JSON:**
```typescript
// Note: Firestore vectors need special handling
// They're stored as special vector objects
```

3. **Backup:**
- Use Firestore export/import
- Or create a Cloud Function to export

---

*The embeddings/weights are stored in Firestore, not in files. The code files above manage the generation and usage of these embeddings.*

