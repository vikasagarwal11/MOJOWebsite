# How the Authentication & Approval System Works Now

## 🎯 Complete User Journey Flow

---

## 1️⃣ NEW USER REGISTRATION (3 Steps)

### Step 1: Phone Verification + Name Collection
**User Action:**
- Enters: First Name, Last Name, Phone Number
- Clicks "Send Verification Code"

**What Happens:**
1. Phone number is normalized to E.164 format (`+1XXXXXXXXXX`)
2. System checks if phone number already exists
   - If exists → Error: "Phone number already registered. Please sign in instead."
   - If new → Proceeds
3. SMS verification code sent via Firebase Phone Auth
4. 5-minute countdown timer starts
5. User moves to Step 2

**State:** User is NOT logged in yet, no Firebase Auth session

---

### Step 2: SMS Code Verification
**User Action:**
- Enters 6-digit verification code
- Clicks "Verify"

**What Happens:**
1. Code is verified using `verifyPhoneCode()` function
2. **Firebase Auth user is created** (phone-authenticated)
   - This creates a Firebase Auth session
   - User is now "logged in" at Firebase Auth level
3. Firebase User object is stored in component state
4. User moves to Step 3

**State:** 
- ✅ Firebase Auth session active (user is authenticated)
- ❌ No Firestore user document yet
- ❌ No status assigned yet

---

### Step 3: Additional Information + Profile Creation
**User Action:**
- Enters: Email, Location, "How did you hear about us", Optional referrer, Optional notes
- Clicks "Submit for Approval"

**What Happens:**
1. `createPendingUser()` function is called with all collected data
2. **Firestore user document is created** with:
   ```javascript
   {
     email: "...",
     firstName: "...",
     lastName: "...",
     displayName: "...",
     phoneNumber: "...",
     role: 'member',
     status: 'pending',  // 🔥 CRITICAL: Always 'pending'
     approvalRequestedAt: timestamp,
     createdAt: timestamp,
     updatedAt: timestamp
   }
   ```
3. **Account approval document is created** in `accountApprovals` collection
4. `onSnapshot` listener in `AuthContext` detects the new user document
5. `currentUser` state is updated with `status: 'pending'`
6. User is redirected to `/pending-approval`

**State:**
- ✅ Firebase Auth session active
- ✅ Firestore user document exists with `status: 'pending'`
- ✅ Account approval request created
- ✅ User is on `/pending-approval` page

---

## 2️⃣ PENDING USER STATE (After Registration)

### What the User Sees
- **Page:** `/pending-approval`
- **Content:**
  - Status message: "Account Pending Approval"
  - Q&A message thread (if admin has asked questions)
  - Message composer (if admin is awaiting response)
  - Contact information

### What Happens Behind the Scenes

#### Session Management
1. **Firebase Auth:** User remains authenticated (session persists)
2. **Firestore Listener:** `onSnapshot` watches user document for status changes
3. **Layout Component:** Checks user status on every route change

#### Access Control (Layout.tsx Logic)
```javascript
// Layout checks user status
const status = currentUser.status || 'pending'; // Defaults to 'pending'

if (status === 'pending' || status === 'needs_clarification') {
  // Redirect to /pending-approval
  return '/pending-approval';
}
```

#### What Pending Users CAN Do
✅ **View Public Content:**
- `/events` - See public events (read-only)
- `/posts` - See public posts (read-only)
- `/media` - Browse media gallery
- `/challenges` - View challenges (read-only)
- `/about`, `/contact`, `/sponsors` - Public pages

✅ **Manage Approval:**
- View approval status
- Read admin questions
- Reply to admin questions via Q&A thread
- See last admin reply timestamp

#### What Pending Users CANNOT Do
❌ **Protected Routes:**
- `/profile` - Redirected to `/pending-approval`
- `/admin` - Redirected to `/pending-approval`
- `/family-management` - Redirected to `/pending-approval`
- `/workouts` - Redirected to `/pending-approval`

❌ **Interactive Features:**
- Create posts (blocked by Firestore rules `isApprovedUser()`)
- Create comments (blocked by Firestore rules)
- Like posts/media (blocked by Firestore rules)
- RSVP to events (blocked by Firestore rules)
- Upload media (blocked by Firestore rules)
- Join challenges (blocked by Firestore rules)

#### Firestore Security Rules
```javascript
// Example: Posts creation rule
allow create: if isSignedIn() && isApprovedUser() && ...
// isApprovedUser() returns false for pending users
```

---

## 3️⃣ PENDING USER LOGIN ATTEMPT

### What Happens

#### Step 1: Phone Number Entry
- User enters phone number
- System checks if user exists → ✅ Found
- SMS code sent

#### Step 2: Code Verification
- User enters verification code
- `verifyCode()` is called with `isLogin=true`

**Critical Security Check (AuthContext.tsx):**
```javascript
// Check user status
const status = userData?.status || 'pending';

if (status === 'pending' || status === 'needs_clarification') {
  // 🔥 IMMEDIATELY SIGN OUT
  await signOut(auth);
  throw new Error('pending approval');
}
```

**Result:**
1. User is **immediately signed out** from Firebase Auth
2. Error is thrown: "pending approval"
3. `Login.tsx` catches error and redirects to `/pending-approval`
4. User sees: "Your account status is under review. Redirecting..."

**State:**
- ❌ Firebase Auth session terminated
- ✅ User redirected to `/pending-approval`
- ❌ Cannot access any protected routes

---

## 4️⃣ ADMIN APPROVAL PROCESS

### Admin Actions (Account Approvals Tab)

#### Option A: Approve Account
1. Admin clicks "Approve" on user's approval request
2. `AccountApprovalService.approveAccount()` is called
3. **Two documents updated:**
   - `accountApprovals/{approvalId}` → `status: 'approved'`
   - `users/{userId}` → `status: 'approved'`, `approvedAt`, `approvedBy`

#### Option B: Ask Question (Needs Clarification)
1. Admin clicks "Ask Question" and sends message
2. Message created in `approvalMessages` collection
3. Approval status updated to `needs_clarification`
4. User status remains `pending` (but approval shows `needs_clarification`)

#### Option C: Reject Account
1. Admin clicks "Reject" and provides reason
2. `AccountApprovalService.rejectAccount()` is called
3. **Two documents updated:**
   - `accountApprovals/{approvalId}` → `status: 'rejected'`, `rejectionReason`
   - `users/{userId}` → `status: 'rejected'`, `rejectedAt`, `rejectedBy`, `rejectionReason`

---

## 5️⃣ STATUS CHANGE DETECTION (Real-Time)

### When Admin Approves User

**What Happens:**
1. Admin updates user document: `status: 'approved'`
2. **Firestore `onSnapshot` listener fires** (in AuthContext)
3. `currentUser` state is updated with new status
4. **Layout component re-evaluates** redirect logic
5. Since status is now `'approved'`, no redirect happens
6. User can now access all routes

**If User is on `/pending-approval` Page:**
- Page shows real-time status update
- User can refresh or navigate to home
- Full access is now available

**If User is Logged Out:**
- User can now log in successfully
- Login check passes (status is `'approved'`)
- User gets full access

---

## 6️⃣ APPROVED USER STATE

### What Approved Users Can Do
✅ **All Routes:**
- `/profile` - Full access
- `/admin` - If role is admin
- `/family-management` - Full access
- `/workouts` - Full access
- All public routes

✅ **All Interactive Features:**
- Create posts
- Create comments
- Like posts/media
- RSVP to events
- Upload media
- Join challenges
- Create testimonials

### Session Management
- Firebase Auth session persists
- Firestore listener continues watching for changes
- Status changes are reflected in real-time

---

## 7️⃣ REJECTED USER STATE

### What Happens When User is Rejected

1. Admin rejects account with reason
2. User document updated: `status: 'rejected'`
3. `onSnapshot` listener detects change
4. `currentUser` state updated
5. **Layout redirects to `/account-rejected`**

### Rejected User Access
✅ **Can View:**
- Public routes (events, posts, media)
- `/account-rejected` page

❌ **Cannot:**
- Log in (blocked at login step)
- Access protected routes
- Use interactive features

### Reapply Process
- 30-day cooldown period
- `AccountApprovalService.canReapply()` checks eligibility
- After cooldown, user can register again
- New approval request created

---

## 8️⃣ SESSION PERSISTENCE & REFRESH

### Page Refresh Behavior

#### Pending User Refreshes Page
1. Firebase Auth session persists (cookies/localStorage)
2. `onAuthStateChanged` fires
3. `onSnapshot` loads user document
4. Status is `'pending'`
5. Layout redirects to `/pending-approval`
6. User stays on status page

#### Approved User Refreshes Page
1. Firebase Auth session persists
2. `onAuthStateChanged` fires
3. `onSnapshot` loads user document
4. Status is `'approved'`
5. Layout allows access
6. User maintains full access

#### Rejected User Refreshes Page
1. Firebase Auth session persists
2. `onAuthStateChanged` fires
3. `onSnapshot` loads user document
4. Status is `'rejected'`
5. Layout redirects to `/account-rejected`
6. User stays on rejection page

---

## 9️⃣ SECURITY FLOW DIAGRAM

```
NEW USER REGISTRATION
├─ Step 1: Phone + Name → SMS Code Sent
├─ Step 2: Verify Code → Firebase Auth User Created
└─ Step 3: Additional Info → createPendingUser()
    ├─ User Doc Created: status='pending'
    ├─ Approval Request Created
    └─ Redirect to /pending-approval

PENDING USER STATE
├─ Firebase Auth: ✅ Authenticated
├─ Firestore: status='pending'
├─ Access: Public routes only
├─ Login Attempt: ❌ Blocked (signs out immediately)
└─ Real-time: Listens for status changes

ADMIN ACTION
├─ Approve → status='approved' → Full Access
├─ Ask Question → status='needs_clarification' → Still Pending
└─ Reject → status='rejected' → Redirect to /account-rejected

APPROVED USER
├─ Firebase Auth: ✅ Authenticated
├─ Firestore: status='approved'
├─ Access: All routes + features
└─ Login: ✅ Allowed

REJECTED USER
├─ Firebase Auth: ❌ Blocked at login
├─ Firestore: status='rejected'
├─ Access: Public routes only
└─ Reapply: After 30-day cooldown
```

---

## 🔟 KEY SECURITY POINTS

### 1. No Auto-Approval
- Missing status defaults to `'pending'` (not `'approved'`)
- All new users must go through approval
- No bypass path exists

### 2. Login Blocking
- Pending/rejected users cannot complete login
- Immediate sign-out on status check
- Clear error messages and redirects

### 3. Real-Time Updates
- Status changes reflected immediately
- No page refresh needed
- Consistent state across app

### 4. Firestore Rules
- All write operations require `isApprovedUser()`
- Pending users can only read public content
- Admin-only status updates

### 5. Session Consistency
- Firebase Auth maintains session
- Firestore listener keeps state in sync
- Layout enforces access control

---

## 🎯 Summary: The Complete Flow

1. **Registration** → Creates user with `status: 'pending'` → Redirects to `/pending-approval`
2. **Pending State** → Can view public content, cannot interact, cannot log in if logged out
3. **Admin Approval** → Status changes to `'approved'` → Real-time update → Full access
4. **Approved State** → Can access all routes and features
5. **Rejection** → Status changes to `'rejected'` → Redirects to `/account-rejected` → Can reapply after 30 days

The system is now secure, consistent, and provides a smooth user experience with real-time status updates!

