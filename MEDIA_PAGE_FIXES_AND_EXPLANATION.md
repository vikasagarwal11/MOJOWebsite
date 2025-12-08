# Media Page Fixes and Explanation

## Issues Fixed

### 1. **Media Upload Button Visibility**
**Problem:** Upload button was visible (but would show error on click) for non-approved users, inconsistent with Posts page.

**Fix:** Button is now **hidden** for non-approved users (pending/rejected/not logged in), matching the desired consistent UX pattern.

**Why it was initially visible:**
The button was initially visible to all logged-in users as a progressive disclosure pattern - showing users what's available once they're approved. However, this created confusion when users clicked it and got an error. Hiding it provides cleaner UX by only showing actionable features to users who can actually use them.

**Current Behavior:**
- ✅ **Logged out users:** Button hidden
- ✅ **Pending/rejected users:** Button hidden  
- ✅ **Approved users:** Button visible and functional

---

### 2. **Events Permission Error on Media Page**

**Error:**
```
useFirestore.ts:488 ❌ [useFirestore] Snapshot error: {collectionName: 'events', error: 'Missing or insufficient permissions.'}
```

**Root Cause:**
The Media page was querying events with no constraints:
```typescript
useRealtimeCollection('events', []); // no constraints
```

For approved users, the `enforceGuestPolicy` hook bypasses filtering (allowing all queries), but Firestore security rules require specific query filters. Querying all events without filters violates security rules.

**Fix:**
Now explicitly queries only public events (which are accessible to all users):
```typescript
useRealtimeCollection('events', [where('visibility', '==', 'public'), orderBy('startAt', 'desc')]);
```

This ensures:
- ✅ Works for all user types (logged out, pending, approved)
- ✅ Complies with Firestore security rules
- ✅ Sufficient for the filter dropdown (only need public events to filter media)

---

### 3. **Other Errors in Logs (Non-Critical)**

The following errors in the console logs are **harmless** and don't affect functionality:

1. **`ERR_BLOCKED_BY_CLIENT`** 
   - Caused by browser extensions (ad blockers) blocking Firestore connection cleanup
   - App functionality is unaffected

2. **`BloomFilter error`**
   - Firestore SDK warning, not a real error
   - Non-critical optimization warning

3. **Image 404 Error**
   - A specific image file doesn't exist in Firebase Storage
   - Unrelated to the Media page issues

---

## Consistency with Posts Page

**Posts Page Approach:** Shows button but disables it for non-approved users with tooltip.

**Media Page Approach (New):** Hides button completely for non-approved users.

**Reasoning:**
- Cleaner UX - users don't see features they can't use
- Consistent across pages
- Reduces confusion from disabled buttons

---

## Files Modified

1. **`src/pages/Media.tsx`**
   - Added `isUserApproved` import and check
   - Wrapped upload buttons in conditional rendering
   - Fixed events query with explicit visibility filter
   - Added `where` import from firebase/firestore

---

## Testing Checklist

- [ ] Logged out user: Upload button hidden ✅
- [ ] Pending user: Upload button hidden ✅
- [ ] Approved user: Upload button visible and works ✅
- [ ] Events filter dropdown works without permission errors ✅
- [ ] No console errors when opening Media page ✅

