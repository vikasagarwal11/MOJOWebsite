# Ideal Page Behavior - Access Control Documentation

## Overview

This document outlines the ideal access control behavior for all pages in the application, ensuring consistency across the user experience.

---

## Access Control Principles

### User Status Categories
1. **Not Logged In** - No authentication
2. **Pending Approval** - Logged in but `status: 'pending'` or `'needs_clarification'`
3. **Rejected** - Logged in but `status: 'rejected'`
4. **Approved** - Logged in and `status: 'approved'` or no status (legacy users)

### Action Categories
- **View** - Read-only access to content
- **Create** - Create new content/features
- **Interact** - Like, comment, RSVP, join, etc.

---

## Page-by-Page Ideal Behavior

### 1. **Posts Page** (`/posts`)

**Route Type:** Public route (accessible to all)

**Viewing Posts:**
- ✅ **Not logged in:** Can view public posts
- ✅ **Pending/Rejected:** Can view public posts
- ✅ **Approved:** Can view all posts (public + members)

**Creating Posts:**
- ❌ **Not logged in:** Button **HIDDEN**
- ❌ **Pending/Rejected:** Button **HIDDEN**
- ✅ **Approved:** Button visible and functional

**Current Status:** ✅ Fixed - Button now hidden for non-approved users (consistent with Media page)

---

### 2. **Media Page** (`/media`)

**Route Type:** Public route (accessible to all)

**Viewing Media:**
- ✅ **Not logged in:** Can view public media
- ✅ **Pending/Rejected:** Can view public media
- ✅ **Approved:** Can view all media

**Uploading Media:**
- ❌ **Not logged in:** Button **HIDDEN**
- ❌ **Pending/Rejected:** Button **HIDDEN**
- ✅ **Approved:** Button visible and functional

**Current Status:** ✅ Fixed - Button hidden for non-approved users

---

### 3. **Workouts Page** (`/workouts`)

**Route Type:** Protected route (requires approval)

**Ideal Behavior:**
- ❌ **Not logged in:** Redirect to home (`/`) with login prompt
- ❌ **Pending/Rejected:** Redirect to status page (`/pending-approval` or `/account-rejected`)
- ✅ **Approved:** Full access to workout features

**Features Available (Approved Users Only):**
- Create workout plans
- Get daily workout suggestions
- Track workout sessions
- View workout history
- Export workout data

**Current Status:** 
- Route is already in protected routes list ✅
- Should redirect pending users automatically via `Layout.tsx`
- Page shows login prompt for non-logged-in users (correct behavior)

**Note:** The Workouts page is **intentionally a protected route** because it requires:
- Personal workout plan creation
- Session tracking
- Progress monitoring
- Challenge participation

---

### 4. **Challenges Page** (`/challenges`)

**Route Type:** Public route (accessible to all)

**Viewing Challenges:**
- ✅ **Not logged in:** Can view public challenges
- ✅ **Pending/Rejected:** Can view public/member challenges
- ✅ **Approved:** Can view all challenges

**Creating Challenges:**
- ❌ **Not logged in:** Button **HIDDEN**
- ❌ **Pending/Rejected:** Button **HIDDEN**
- ✅ **Approved:** Button visible and functional

**Joining Challenges:**
- ❌ **Not logged in:** Button disabled with "Sign in required" message
- ❌ **Pending/Rejected:** Button disabled with approval message (already implemented)
- ✅ **Approved:** Button functional

**Current Status:** ✅ Fixed - Create button now hidden for non-approved users

---

### 5. **Events Page** (`/events`)

**Route Type:** Public route (accessible to all)

**Viewing Events:**
- ✅ **Not logged in:** Can view public events
- ✅ **Pending/Rejected:** Can view public events
- ✅ **Approved:** Can view public + member events

**Creating Events:**
- ❌ **Not logged in:** Button **HIDDEN** (should be hidden)
- ❌ **Pending/Rejected:** Button **HIDDEN** (should be hidden)
- ✅ **Approved:** Button visible and functional (admin/member)

**RSVP to Events:**
- ❌ **Not logged in:** Button disabled with "Sign in required"
- ❌ **Pending/Rejected:** Button disabled with approval message
- ✅ **Approved:** Button functional

**Current Status:** ⚠️ Needs verification - Create Event button access control

---

## Consistency Pattern

### Button Visibility Pattern (Applied Across All Pages)

**Pattern:** **HIDE** buttons for non-approved users (cleaner UX)

**Instead of:** Show button but disable it (creates confusion)

**Rationale:**
- Cleaner user experience
- No confusion from disabled buttons
- Clear indication that feature requires approval
- Consistent across all pages

### Applied To:
- ✅ Media page - Upload button
- ✅ Posts page - Create Post button
- ✅ Challenges page - Create Challenge button
- ⚠️ Events page - Create Event button (needs verification)

---

## Route Protection Summary

### Public Routes (Accessible to All)
- `/` (Home)
- `/events` (Event listing)
- `/posts` (Post feed)
- `/media` (Media gallery)
- `/challenges` (Challenge listing)
- `/sponsors`
- `/founder`
- `/contact`
- `/about`
- `/press`
- `/community-guidelines`
- `/pending-approval` (Status page)
- `/account-rejected` (Rejection page)

### Protected Routes (Require Approval)
- `/profile` (User profile)
- `/admin` (Admin console)
- `/family-management` (Family members)
- `/workouts` (Workout plans and tracking)

---

## Interactive Features Access Control

All interactive features require **approved user status**:

### Create Actions:
- ✅ Create Post → Button hidden for non-approved
- ✅ Upload Media → Button hidden for non-approved
- ✅ Create Challenge → Button hidden for non-approved
- ⚠️ Create Event → Needs verification

### Interaction Actions:
- ✅ Join Challenge → Disabled with approval message
- ✅ RSVP to Events → Disabled with approval message
- ✅ Comment on Posts → Should check approval
- ✅ Like/React → Should check approval

---

## Challenge Creation Error Analysis

**Error:** `FirebaseError: Missing fields`

**Root Cause Investigation:**
The Cloud Function expects:
- `title` (string) ✅
- `target` (number) ✅
- `startAt` (number - timestamp) ✅
- `endAt` (number - timestamp) ✅

**Fix Applied:**
1. Added explicit `Number()` conversion for `startAt` and `endAt`
2. Added validation to ensure dates are valid numbers
3. Added detailed logging to see exactly what's being sent
4. Ensured dates are in milliseconds (timestamp format)

**Next Steps:**
- Check Cloud Function logs to see what data it actually receives
- Verify that `startAt` and `endAt` are not being filtered out during serialization


