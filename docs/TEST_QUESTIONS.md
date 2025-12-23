# Test Questions for Assistant - KB vs General Knowledge

## How the System Works:
1. **KB Questions**: If KB search finds relevant content → Uses KB context → **CAN answer community questions**
2. **General Knowledge Questions**: If KB search fails → Uses general knowledge prompt → **Says "I don't have access" for community questions**

---

## 10 Test Questions (Mix of KB and Non-KB)

### KB-Based Questions (Should find answers from KB):

1. **"who is the founder of this community?"**
   - Expected: Should find Aina Rai from KB (`founder_story`)
   - Should show KB citations
   - Should NOT say "I don't have access"

2. **"what is the mission of moms fitness mojo?"**
   - Expected: Should find mission from KB (`about_mission`)
   - Should show KB citations
   - Should include quote from Aina Rai

3. **"tell me about aina rai"**
   - Expected: Should find founder story from KB (`founder_story`)
   - Should show KB citations
   - Should mention her story about creating the community

4. **"what are the values of mfm?"**
   - Expected: Should find values from KB (`about_values`)
   - Should show KB citations
   - Should list: Empowerment, Community, Goals, Excellence

5. **"tell me about the diwali event"** (if event exists in Firestore)
   - Expected: Should find event from KB (synced from Firestore events)
   - Should show KB citations with event details (date, location, etc.)
   - Should NOT be generic blurb

6. **"what is mfm?"**
   - Expected: Should find overview from KB (`home_highlights`)
   - Should show KB citations
   - Should explain what Moms Fitness Mojo is

### General Knowledge Questions (Should NOT find KB, use general knowledge):

7. **"what are some good exercises for postpartum recovery?"**
   - Expected: Should NOT find KB content
   - Should use general knowledge
   - Should answer with fitness advice
   - Should NOT show citations (source hygiene fix)

8. **"how do I balance fitness with motherhood?"**
   - Expected: Should NOT find KB content
   - Should use general knowledge
   - Should answer with general wellness advice
   - Should NOT show citations

9. **"what are healthy snack ideas for busy moms?"**
   - Expected: Should NOT find KB content
   - Should use general knowledge
   - Should answer with nutrition tips
   - Should NOT show citations

### Hallucination Prevention Test:

10. **"who is sarah chen?"**
    - Expected: Should NOT find KB content (name doesn't exist)
    - Should use general knowledge
    - Should say "I don't have access to that information" (NOT invent the name)
    - Should NOT show citations

---

## Expected Behavior Summary:

### ✅ KB Questions (1-6):
- Find content from KB
- Show KB citations (with proper source titles)
- Answer community-specific questions
- Use `DEFAULT_KB_CONTEXT_PROMPT`

### ✅ General Knowledge Questions (7-9):
- Do NOT find KB content
- Answer with general fitness/wellness advice
- Do NOT show citations (source hygiene - fixed)
- Use `DEFAULT_GENERAL_KNOWLEDGE_PROMPT`

### ✅ Hallucination Prevention (10):
- Do NOT find KB content
- Say "I don't have access" (NOT invent names)
- Do NOT show citations
- Use `DEFAULT_GENERAL_KNOWLEDGE_PROMPT`

---

## What to Check:

1. **Source Hygiene**: No "General Knowledge" citations should appear
2. **KB Citations**: Only show when KB docs are actually used
3. **Founder Info**: Should find Aina Rai from KB, not say "I don't have access"
4. **Event Details**: Should show real event details (date/location) from KB, not generic blurbs
5. **No Hallucination**: Should NOT invent names like "Sarah Chen"
6. **Clean Logs**: No emoji sequences in logs

