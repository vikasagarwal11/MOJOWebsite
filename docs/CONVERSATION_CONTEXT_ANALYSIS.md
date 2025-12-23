# Conversation Context Analysis & Current Issues

## 1. Does the System Keep Conversation Context?

### Current Implementation: ❌ **NO**

**Frontend (AssistantWidget.tsx):**
- ✅ Sends conversation history: `history: AssistantMessage[]` (lines 311-315)
- ✅ Builds history from previous messages in the thread

**Backend (assistant.ts):**
- ❌ **History is received but NEVER USED**
- The `AssistantRequest` interface includes `history?: Array<{ from: 'user' | 'assistant'; text: string }>` (line 32)
- But `chatAsk` function **never extracts or uses `data.history`**
- The `answerQuestion` function only takes:
  - `question: string`
  - `context: string` (KB context, not conversation history)
  - `profileSummary: string`
  - `allowGeneralKnowledge: boolean`

**Result:** Each question is answered in isolation, without any memory of previous conversation.

---

## 2. Should We Keep Conversation Context?

### ✅ **YES - It's a Good Idea, BUT with Caveats**

### Benefits:
1. **Natural Conversation Flow**: Users can ask follow-ups like "tell me more" or "what about her background?"
2. **Contextual Understanding**: "this group" or "the community" can refer to previous mentions
3. **Better User Experience**: More human-like interaction
4. **Reduced Repetition**: User doesn't need to repeat brand name in every question

### Challenges:
1. **Token Costs**: Including full history increases API costs
2. **Context Window Limits**: LLMs have token limits (e.g., Gemini 1.5 Flash: 1M tokens, but still need to manage)
3. **KB vs General Knowledge Confusion**: Need to ensure conversation context doesn't override KB routing logic
4. **Hallucination Risk**: LLM might "remember" incorrect information from earlier in conversation

### Best Practice Approach:
- **Include last 3-5 messages** (not entire conversation)
- **Add conversation summary** for longer sessions
- **Keep KB routing logic separate** from conversation context
- **Use conversation context only for LLM prompt**, not for routing decisions

---

## 3. Current Issues - Why Questions Are Failing

### Failed Questions Analysis:

| Question | Expected | Actual | Root Cause |
|----------|----------|--------|------------|
| "who is the founder of the community?" | KB | General Knowledge | ❌ No explicit brand mention ("community" ≠ "Moms Fitness Mojo") |
| "what is the motto or mission of this group?" | KB | General Knowledge | ❌ No explicit brand mention ("this group" ≠ "Moms Fitness Mojo") |
| "how did MFM begin?" | KB | General Knowledge | ⚠️ **BUG**: "MFM" should match brand pattern but might be failing elsewhere |
| "who is the founder of Moms Fitness Mojo?" | KB | KB ✅ | ✅ Works correctly |

### Root Cause:

The `isBrandQuestion()` function **requires explicit brand mention**:
- ✅ Matches: "moms fitness mojo", "mfm", "aina rai", "aina"
- ❌ Doesn't match: "the community", "this group", "it"

**Without conversation context**, questions like:
- "who is the founder of **the community**?" (referring to MFM from earlier)
- "what is **this group's** mission?" (referring to MFM from earlier)

...cannot be understood as brand questions because there's no explicit brand mention.

---

## 4. Alignment with Best Practices

### Your Provided Explanation (RAG Pattern):
```
1. KB-First Retrieval → Use semantic search to query KB
2. Confidence Threshold → If match found (e.g., >0.8), use KB
3. Fallback to LLM → If no match, use general LLM
4. Response Generation → Cite sources, handle edge cases
```

### Our Current Implementation:
✅ **ALIGNED** - We follow this exact pattern:
1. ✅ **KB-First**: Brand questions → vector search KB
2. ✅ **Confidence Threshold**: `SIMILARITY_THRESHOLD` (0.4 for brand, 0.22 for generic)
3. ✅ **Fallback to LLM**: General knowledge when KB doesn't match
4. ✅ **Response Generation**: Citations included, `NO_KB_ANSWER` sentinel for gaps

### Differences:
- **Our approach is MORE sophisticated**: We classify questions as "brand" vs "generic" BEFORE KB search
- **Generic questions skip KB entirely** (more efficient, prevents false KB matches)
- **Brand questions get lenient threshold** (0.4 vs 0.22) because KB is small and focused

---

## 5. Why "how did MFM begin?" Is Still Failing

### Possible Causes:

1. **Brand Detection Working**: "MFM" should match `/\b(moms fitness mojo|mfm|aina rai|aina)\b/`
2. **But KB Routing Failing**: Even if detected as brand, the KB search might be:
   - Not finding good matches (distance > 0.7)
   - Distance extraction still broken
   - `shouldUseKB` evaluating to `false`

### Need to Check Logs For:
```
[assistant.isBrandQuestion] Question: "how did MFM begin?"
[assistant.isBrandQuestion] - Has explicit brand: true/false?
[assistant.isBrandQuestion] - Result: ✅ BRAND or ❌ NON-BRAND?
[assistant.chatAsk] 🎯 Brand Question Decision:
[assistant.chatAsk]   - shouldUseKB: true/false?
```

---

## 6. Recommendations

### Immediate Fixes Needed:

1. **Fix Brand Detection for Contextual Questions**:
   - Option A: Add conversation context to help understand "the community" = "Moms Fitness Mojo"
   - Option B: Make brand detection smarter (e.g., "founder" + "community" in same question → likely brand)
   - Option C: Use conversation history to resolve pronouns/references

2. **Verify "MFM" Pattern Matching**:
   - Check if `/\bmfm\b/` is case-sensitive or has word boundary issues
   - Test: "how did MFM begin?" vs "how did mfm begin?"

3. **Add Conversation Context** (Recommended):
   - Extract last 3-5 messages from `data.history`
   - Include in LLM prompt (not in routing logic)
   - Helps with: "this group", "the community", "her", "it"

### Implementation Plan for Conversation Context:

```typescript
// In chatAsk function:
const conversationHistory = data.history || [];
const lastMessages = conversationHistory.slice(-5); // Last 5 messages

// Build conversation context string
const conversationContext = lastMessages
  .map(msg => `${msg.from === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
  .join('\n');

// Pass to answerQuestion (add new parameter)
const answer = await answerQuestion(
  question, 
  context, // KB context
  profileSummary,
  allowGeneralKnowledge,
  conversationContext // NEW: conversation history
);

// In answerQuestion function:
async function answerQuestion(
  question: string, 
  context: string, 
  profileSummary: string, 
  allowGeneralKnowledge = false,
  conversationHistory?: string // NEW parameter
) {
  // Build prompt with conversation history
  const prompt = conversationHistory
    ? `${systemPrompt}\n\nPrevious conversation:\n${conversationHistory}\n\nContext:\n${context}\n\nQuestion: ${question}`
    : `${systemPrompt}\n\nContext:\n${context}\n\nQuestion: ${question}`;
  // ... rest of function
}
```

---

## 7. Summary

### Current State:
- ❌ **No conversation context** - each question is isolated
- ⚠️ **Brand detection too strict** - requires explicit brand mention
- ⚠️ **Some brand questions failing** - need to check logs for "MFM" case

### What's Working:
- ✅ KB-first routing architecture (aligned with best practices)
- ✅ Generic questions correctly skip KB
- ✅ Some brand questions work ("who is the founder of Moms Fitness Mojo?")

### What Needs Fixing:
1. **Add conversation context** to help with contextual references
2. **Debug "MFM" brand detection** - verify it's matching correctly
3. **Check KB routing logs** for "how did MFM begin?" to see why it's falling back

### Next Steps:
1. Check Firebase logs for the failing questions
2. Verify brand detection is working for "MFM"
3. Implement conversation context (if user approves)
4. Test with the provided question set

