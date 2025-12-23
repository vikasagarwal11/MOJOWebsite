# Assistant KB Routing Bug Analysis

## Executive Summary
Brand detection is working correctly, but distance extraction from Firestore vector search is failing. Distances are present in the Firestore response but `d.get('distance')` returns `undefined`, causing brand questions to incorrectly fall back to general knowledge.

## Key Findings

### ✅ What's Working
1. **Brand Detection**: 100% accurate - all brand questions correctly identified
2. **Vector Search**: Finding 7 docs consistently
3. **Non-Brand Routing**: Correctly routes to general knowledge
4. **Distance Values**: Firestore IS returning distance values

### ❌ What's Broken
1. **Distance Extraction**: `d.get('distance')` returns `undefined` even though distances exist
2. **Similarity Threshold**: Too strict (0.22) for brand questions
3. **New Code**: Enhanced distance extraction code not executing

## Evidence from Firebase Logs

### Question: "who is the founder of Moms Fitness Mojo?"
```
✅ Brand Detection: WORKING
✅ Vector Search: WORKING (7 docs found)
❌ Distance Extraction: FAILING
   - Top 5 distances: [0.252, 0.260, 0.280, 0.280, 0.307] ← DISTANCES EXIST!
   - Best Distance: N/A ← BUT CODE SAYS N/A!
   - Result: Falls back to general knowledge
```

### Question: "what is the mission of Moms Fitness Mojo?" (ONLY WORKING CASE)
```
✅ Brand Detection: WORKING
✅ Vector Search: WORKING (7 docs found)
✅ Distance Extraction: WORKING
   - Top 5 distances: [0.158, 0.189, 0.248, 0.271, 0.292]
   - Best Distance: 0.158 ← EXTRACTED CORRECTLY!
   - Good Matches: 2
   - Result: ✅ Uses KB successfully
```

## Root Cause Analysis

### Critical Bug: Distance Extraction Failure

**The Problem:**
- Firestore vector search IS returning distance values (visible in logs)
- But `d.get('distance')` returns `undefined` for most queries
- Only works when distances are below threshold (0.22) - suggesting a code path issue

**Code Location:**
- File: `functions/src/assistant.ts`
- Lines: ~1213-1240 (distance extraction logic)
- Current code: `const dist = d.get('distance') as number | undefined;`

**Why "mission" question worked:**
- Best distance: 0.158 (below 0.22 threshold)
- This suggests distance extraction works in some cases but not others
- Possibly related to how Firestore returns distances for different similarity ranges

## Questions for Investigation

1. Why does `d.get('distance')` return undefined when distances clearly exist in logs?
2. Why did the "mission" question extract distances correctly?
3. Is there a Firestore SDK version issue affecting distance field access?
4. Should we use `d.data()?.distance` instead of `d.get('distance')`?

## Recommended Fixes

### Priority 1: Fix Distance Extraction
Try alternative methods to access distance:
```typescript
// Current (FAILING):
const dist = d.get('distance');

// Alternatives:
const dist = d.data()?.distance;
// OR
const dist = (d as any).distance;
// OR check snapshot metadata
```

### Priority 2: Adjust Threshold Logic
- For brand questions: use 0.5 threshold (more lenient)
- For generic questions: keep 0.22 threshold

### Priority 3: Add Fallback Logic
- If distances are missing but docs exist, still use KB for brand questions
- Log the issue for investigation

## Files to Review

1. `functions/src/assistant.ts` (lines 1165-1290) - Main bug location
2. `firestore.indexes.json` (lines 676-725) - Vector index configuration
3. `functions/src/kbEmbeddingWorker.ts` - How embeddings are stored
4. Firebase logs - Evidence of the bug

## Next Steps

1. Investigate Firestore vector search distance field access patterns
2. Test alternative methods to extract distance values
3. Verify if there's a SDK version or configuration issue
4. Implement fallback logic for brand questions when distances are missing

