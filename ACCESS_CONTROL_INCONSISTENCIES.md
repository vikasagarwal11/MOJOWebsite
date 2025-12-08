# Access Control Inconsistencies - Complete Audit

## Overview
This document lists all pages, buttons, and features that need access control based on:
1. **Not Logged In** - Should be disabled/hidden
2. **Logged In but Not Approved** (pending/rejected/needs_clarification) - Should be disabled
3. **Logged In and Approved** - Should be enabled

---

## 🔴 CRITICAL ISSUES (Must Fix)

### 1. **Media Page - Upload Button** ❌
**File:** `src/pages/Media.tsx`

**Issue:**
- Lines 206-212, 223-229: Upload buttons are **ENABLED** for all users
- Lines 435-442: Empty state upload button is **ENABLED** for logged-in users (doesn't check approval)
- Button shows error message when clicked instead of being disabled

**Current Behavior:**
- ✅ Logged out users: Button visible but shows error on click
- ❌ Pending users: Button enabled, shows error on click
- ✅ Approved users: Button works

**Expected Behavior:**
- ❌ Logged out users: Button should be **DISABLED** or **HIDDEN**
- ❌ Pending users: Button should be **DISABLED** with tooltip
- ✅ Approved users: Button enabled

**Fix Required:**
```typescript
// Should check: currentUser && isUserApproved(currentUser)
// Button should be disabled={!currentUser || !isUserApproved(currentUser)}
```

---

### 2. **Media Upload Modal - No Approval Check** ❌
**File:** `src/components/media/MediaUploadModal.tsx`

**Issue:**
- Line 71: Only checks `if (!currentUser)` - doesn't check approval status
- Pending users can open modal and attempt upload (will fail at Firestore rules)

**Current Behavior:**
- ❌ Pending users: Can open modal, upload fails with error

**Expected Behavior:**
- ❌ Pending users: Should not be able to open modal or button should be disabled

**Fix Required:**
```typescript
// Line 71: Change from:
if (!currentUser) { toast.error('Please sign in to upload.'); return; }

// To:
if (!currentUser) { toast.error('Please sign in to upload.'); return; }
if (!isUserApproved(currentUser)) { toast.error('Your account is pending approval.'); return; }
```

---

### 3. **Events Page - Create Event Button** ❌
**File:** `src/pages/Events.tsx`

**Issue:**
- Need to check if "Create Event" button exists and has proper access control
- CreateEventModal checks admin role but not approval status

**Current Behavior:**
- Unknown - need to verify button visibility and state

**Expected Behavior:**
- ❌ Logged out: Button hidden
- ❌ Pending users: Button hidden (only admins can create)
- ✅ Approved admins: Button visible and enabled

**Fix Required:**
- Check if button exists in Events.tsx
- Ensure it's only visible to approved admins

---

### 4. **Create Event Modal - Approval Check Missing** ❌
**File:** `src/components/events/CreateEventModal.tsx`

**Issue:**
- Line 649: Checks `currentUser.role !== 'admin'` but doesn't check approval status
- Pending admin could theoretically create events (though Firestore rules should block)

**Current Behavior:**
- ❌ Pending admins: Could attempt to create (blocked by Firestore)

**Expected Behavior:**
- ❌ Pending admins: Should be blocked at UI level

**Fix Required:**
```typescript
// Line 649: Add approval check
if (currentUser.role !== 'admin' || !isUserApproved(currentUser)) {
  toast.error('Only approved admins can create events');
  return;
}
```

---

### 5. **Workouts Page - Register/Login Buttons Always Visible** ❌
**File:** `src/pages/Workouts.tsx`

**Issue:**
- Lines 278-306: Shows login/register buttons even when user is logged in
- Should hide these buttons if user is logged in

**Current Behavior:**
- ❌ Logged in users: Still see "Sign In" and "Create Account" buttons
- ✅ Logged out users: See buttons (correct)

**Expected Behavior:**
- ✅ Logged in users: Should see workout content, not login buttons
- ✅ Logged out users: See login buttons

**Fix Required:**
```typescript
// The canUse check (line 97) already handles this, but the UI shows buttons
// Need to ensure logged-in users don't see the login prompt
```

---

### 6. **Header - Login/Register Buttons Always Visible** ❌
**File:** `src/components/layout/Header.tsx`

**Issue:**
- Lines 232-245 (Desktop): Shows Login/Register buttons even when logged in
- Lines 327-342 (Mobile): Shows Login/Register buttons even when logged in

**Current Behavior:**
- ❌ Logged in users: Still see "Login" and "Join MOJO" buttons
- ✅ Logged out users: See buttons (correct)

**Expected Behavior:**
- ❌ Logged in users: Should NOT see login/register buttons
- ✅ Logged out users: See login/register buttons

**Fix Required:**
- Already has conditional rendering (lines 128-246), but need to verify it's working correctly
- May be a rendering issue

---

## 🟡 MEDIUM PRIORITY ISSUES

### 7. **Posts Page - Create Post Button** ✅ (Already Fixed)
**File:** `src/pages/Posts.tsx`

**Status:** ✅ **CORRECTLY IMPLEMENTED**

**Current Behavior:**
- Lines 37-61: Button properly disabled for pending users
- Lines 81-107: Empty state button properly disabled
- Uses `isUserApproved(currentUser)` check
- Shows lock icon and disabled state

**No Fix Needed** - This is the reference implementation!

---

### 8. **Event RSVP Buttons** ✅ (Already Fixed)
**File:** `src/components/events/EventCardNew.tsx`

**Status:** ✅ **CORRECTLY IMPLEMENTED**

**Current Behavior:**
- Lines 437-442: Checks approval before allowing RSVP
- Shows error toast for pending users
- Properly blocks RSVP for non-approved users

**No Fix Needed** - This is correct!

---

## 📋 COMPLETE FEATURE LIST

### Pages That Need Access Control

| Page | Feature | Current Status | Required Fix |
|------|---------|----------------|--------------|
| **Media** | Upload Button (Header) | ❌ Enabled for all | Disable for non-approved |
| **Media** | Upload Button (Empty State) | ❌ Enabled for logged-in | Disable for non-approved |
| **Media** | Upload Modal | ❌ No approval check | Add approval check |
| **Events** | Create Event Button | ⚠️ Unknown | Verify and fix |
| **Events** | Create Event Modal | ❌ No approval check | Add approval check |
| **Workouts** | Login/Register Buttons | ❌ Visible when logged in | Hide when logged in |
| **Posts** | Create Post Button | ✅ Correct | None - reference |
| **Header** | Login/Register Buttons | ❌ Visible when logged in | Hide when logged in |
| **Event Cards** | RSVP Button | ✅ Correct | None - reference |

---

## 🔧 INTERACTIVE FEATURES THAT NEED ACCESS CONTROL

### Features That Should Be Disabled for Non-Approved Users:

1. **Media Upload** ❌
   - Upload button on Media page
   - Upload modal access
   - Live camera upload (if enabled)

2. **Event Creation** ❌
   - Create event button
   - Create event modal

3. **Post Creation** ✅ (Already fixed)
   - Create post button (properly disabled)

4. **Event RSVP** ✅ (Already fixed)
   - RSVP buttons (properly blocked)

5. **Comments** ⚠️
   - Need to check CommentSection component
   - Should be disabled for pending users

6. **Likes/Reactions** ⚠️
   - Need to check ReactionPicker component
   - Should be disabled for pending users

7. **Testimonials** ⚠️
   - Need to check TestimonialSubmissionForm
   - Should be disabled for pending users

8. **Challenges** ⚠️
   - Need to check challenge join buttons
   - Should be disabled for pending users

---

## 🎯 RECOMMENDED FIX PRIORITY

### Priority 1 (Critical - User-Facing Bugs):
1. ✅ **Media Upload Button** - Disable for non-approved users
2. ✅ **Media Upload Modal** - Add approval check
3. ✅ **Header Login Buttons** - Hide when logged in
4. ✅ **Workouts Login Buttons** - Hide when logged in

### Priority 2 (Security - Should Block at UI):
5. ✅ **Create Event Modal** - Add approval check
6. ✅ **Events Create Button** - Verify and fix
7. ✅ **Challenge Creation** - Add approval check

### Priority 3 (Consistency - Follow Same Pattern):
7. ⚠️ **Comments** - Verify access control
8. ⚠️ **Likes/Reactions** - Verify access control
9. ⚠️ **Testimonials** - Verify access control
10. ⚠️ **Challenges** - Verify access control

---

## 📝 HELPER FUNCTION REFERENCE

**File:** `src/utils/userUtils.ts`

```typescript
// Use these functions for access control:
isUserApproved(user)  // Returns true if user is approved or legacy (no status)
isUserPending(user)    // Returns true if user is pending/rejected/needs_clarification
```

**Usage Pattern (Reference from Posts.tsx):**
```typescript
disabled={!isUserApproved(currentUser)}
title={!isUserApproved(currentUser) ? 'Account pending approval' : undefined}
className={!isUserApproved(currentUser) 
  ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
  : 'bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white hover:from-[#E0451F] hover:to-[#E55A2A]'
}
```

---

## ✅ ADDITIONAL AUDITS COMPLETED

### 9. **Comment Reactions** ✅ (Already Fixed)
**File:** `src/components/common/CommentSection.tsx`

**Status:** ✅ **CORRECTLY IMPLEMENTED**

**Current Behavior:**
- Lines 93-96: Properly checks `isUserApproved(currentUser)` before allowing reactions
- Shows error toast for pending users
- Blocks reactions for non-approved users

**No Fix Needed** - This is correct!

---

### 10. **Challenge Creation** ❌
**File:** `src/pages/Challenges.tsx`

**Issue:**
- Line 79: Only checks `if (!currentUser)` - doesn't check approval status
- Pending users can attempt to create challenges (will fail at Firestore rules)

**Current Behavior:**
- ❌ Pending users: Can attempt to create challenge, fails with error

**Expected Behavior:**
- ❌ Pending users: Should be blocked at UI level with disabled button

**Fix Required:**
```typescript
// Line 78-79: Add approval check
const onCreate = async () => {
  if (!currentUser) { toast.error('Sign in required'); return; }
  if (!isUserApproved(currentUser)) { toast.error('Your account is pending approval.'); return; }
  // ... rest of function
}
```

---

## 🔍 FILES TO CHECK (Not Yet Audited)

These files may contain access-dependent features that need review:

1. ✅ `src/components/common/CommentSection.tsx` - **AUDITED** - Reactions are correct ✅
2. `src/components/common/ReactionPicker.tsx` - Likes/Reactions (may be used elsewhere)
3. `src/components/home/TestimonialSubmissionForm.tsx` - Testimonials
4. ✅ `src/pages/Challenges.tsx` - **AUDITED** - Needs approval check ❌
5. `src/pages/ChallengeDetail.tsx` - Challenge join buttons
6. `src/components/posts/CreatePostModal.tsx` - Post creation (may need approval check)
7. `src/components/media/LiveMediaUpload.tsx` - Live upload (if enabled)

---

## ✅ SUMMARY

### Issues Found:
- **7 Critical Issues** requiring immediate fixes
- **3 Medium Priority** issues to verify
- **5 Files** still need additional audit

### Reference Implementations (Do It Like This):
- ✅ `src/pages/Posts.tsx` - Perfect example of disabled button with tooltip
- ✅ `src/components/events/EventCardNew.tsx` - Perfect example of blocking action with error

### Next Steps:
1. Fix Media upload button (Priority 1)
2. Fix Header/Workouts login buttons (Priority 1)
3. Add approval checks to modals (Priority 2)
4. Audit remaining interactive features (Priority 3)

