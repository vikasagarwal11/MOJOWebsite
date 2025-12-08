# Complete Authentication & Account Approval System Review

## 📋 Overview

This document provides a comprehensive review of the user account creation, authentication, session management, and account approval workflow in the MOJO Website project.

---

## 🔐 1. User Account Creation & Authentication Flow

### Files Involved

1. **`src/components/auth/RegisterNew.tsx`** - New user registration component (3-step flow)
2. **`src/components/auth/Login.tsx`** - User login component (2-step flow)
3. **`src/contexts/AuthContext.tsx`** - Core authentication context and session management
4. **`src/services/accountApprovalService.ts`** - Account approval workflow service
5. **`src/config/firebase.ts`** - Firebase configuration

### Registration Flow (3 Steps)

#### Step 1: Phone Verification + Name Collection
- **Component**: `RegisterNew.tsx` (lines 179-238)
- **User Input**: 
  - First Name (required, min 2 chars)
  - Last Name (required, min 2 chars)
  - Phone Number (required, validated)
- **Process**:
  1. Normalize phone to E.164 format (`+1XXXXXXXXXX`)
  2. Check if phone number already exists via `checkIfUserExists()`
  3. If exists → Show error: "Phone number already registered. Please sign in instead."
  4. If new → Send SMS verification code via `sendVerificationCode()`
  5. Set 5-minute expiry timer for code
  6. Store `firstName`, `lastName`, `phoneNumber` in component state
  7. Move to Step 2

#### Step 2: SMS Code Verification
- **Component**: `RegisterNew.tsx` (lines 240-267)
- **User Input**: 6-digit verification code
- **Process**:
  1. Verify code using `verifyPhoneCode()` (AuthContext)
  2. This creates Firebase Auth user (phone-authenticated)
  3. Store Firebase user in `verifiedFirebaseUser` state
  4. Move to Step 3
- **Features**:
  - Code expiry countdown (5 minutes)
  - Resend code functionality (max 3 attempts)
  - Auto-format code input

#### Step 3: Additional Information Collection
- **Component**: `RegisterNew.tsx` (lines 269-322)
- **User Input**:
  - Email (required, validated)
  - Location (required, min 2 chars)
  - How did you hear about us? (required dropdown)
  - Referred by member? (optional, with search)
  - Additional notes (optional)
- **Process**:
  1. Call `createPendingUser()` from AuthContext
  2. Creates user document in Firestore with `status: 'pending'`
  3. Creates `accountApproval` document in `accountApprovals` collection
  4. Navigate to `/pending-approval` page

### Login Flow (2 Steps)

#### Step 1: Phone Number Entry
- **Component**: `Login.tsx` (lines 35-109)
- **User Input**: Phone number
- **Process**:
  1. Normalize phone to E.164 format
  2. Check if user exists via `checkIfUserExists()`
  3. If not exists → Error: "Phone number not registered. Please register first."
  4. If exists → Send SMS verification code
  5. Move to Step 2

#### Step 2: Code Verification
- **Component**: `Login.tsx` (lines 111-154)
- **User Input**: 6-digit verification code
- **Process**:
  1. Call `verifyCode()` with `isLogin=true` flag
  2. **CRITICAL SECURITY CHECK** (AuthContext lines 638-665):
     - If user status is `pending` or `needs_clarification` → **Sign out immediately** + Block login
     - If user status is `rejected` → **Sign out immediately** + Block login
     - Only `approved` users (or legacy users without status) can log in
  3. If approved → Load user data via `onSnapshot` listener
  4. Navigate to home page

---

## 🔄 2. Session Management

### Core Mechanism: `AuthContext.tsx`

#### Firebase Auth State Listener
- **Location**: `AuthContext.tsx` (lines 204-312)
- **Setup**: `onAuthStateChanged()` listener monitors Firebase Auth state
- **Behavior**:
  - When Firebase user logs in → Set up Firestore user document listener
  - When Firebase user logs out → Clear user state and listeners

#### Firestore User Document Listener
- **Location**: `AuthContext.tsx` (lines 235-296)
- **Setup**: `onSnapshot()` listener on `users/{userId}` document
- **Real-time Updates**:
  - Listens for changes to user document in Firestore
  - Updates `currentUser` state when document changes
  - Handles user status changes (pending → approved, etc.)

#### Session State Management
- **State Variables**:
  - `currentUser: User | null` - Current logged-in user data
  - `loading: boolean` - Initial auth check in progress
  - `listenersReady: boolean` - User data listeners are ready

#### Key Functions

1. **`sendVerificationCode(phoneNumber)`** (lines 317-464)
   - Sends SMS via Firebase Phone Auth
   - Handles reCAPTCHA setup
   - Returns `ConfirmationResult` for code verification

2. **`verifyCode(confirmationResult, code, firstName, lastName, phoneNumber, isLogin)`** (lines 545-708)
   - Verifies SMS code
   - **For Login** (`isLogin=true`):
     - Checks user status before allowing login
     - Blocks pending/rejected users
   - **For Registration** (`isLogin=false`):
     - Creates or updates user document
   - Does NOT create user document if it doesn't exist (prevents ghost users)

3. **`verifyPhoneCode(confirmationResult, code)`** (lines 711-722)
   - Verifies phone code only (for new registration flow)
   - Returns Firebase user object
   - Does NOT create user document

4. **`createPendingUser(data)`** (lines 725-806)
   - Creates user document with `status: 'pending'`
   - Creates `accountApproval` document
   - Called after phone verification in registration

5. **`logout()`** (lines 808-823)
   - Signs out from Firebase Auth
   - Clears reCAPTCHA
   - Resets all state

---

## 🚦 3. User Status States

### Status Types (from `src/types/index.ts`)

```typescript
type UserStatus = 'pending' | 'approved' | 'rejected' | 'needs_clarification';
```

### Status Definitions

1. **`pending`**
   - Initial status for new registrations
   - User has completed registration but not yet approved
   - Cannot log in (blocked at login)
   - Can access public routes only

2. **`needs_clarification`**
   - Admin has asked a question about the application
   - User needs to respond via Q&A thread
   - Cannot log in (blocked at login)
   - Can access public routes only

3. **`approved`**
   - User has been approved by admin
   - Full access to all features
   - Can log in successfully

4. **`rejected`**
   - User account has been rejected
   - Cannot log in (blocked at login)
   - Can access public routes only
   - Can reapply after 30-day cooldown

---

## 🚫 4. Access Control During Pending Approval

### Route Protection: `Layout.tsx`

#### Public Routes (Accessible to Everyone)
- **Location**: `Layout.tsx` (line 12)
- **Routes**:
  - `/` (Home)
  - `/events` (Events listing)
  - `/events-readonly` (Read-only events)
  - `/posts` (Posts listing)
  - `/media` (Media gallery)
  - `/sponsors`
  - `/founder`
  - `/contact`
  - `/about`
  - `/press`
  - `/community-guidelines`
  - `/challenges` (Challenge listing)
  - `/pending-approval` (Status page)
  - `/account-rejected` (Rejection page)

#### Protected Routes (Require Approved Status)
- **Location**: `Layout.tsx` (line 15)
- **Routes**:
  - `/profile` (User profile)
  - `/admin` (Admin console)
  - `/family-management`
  - `/workouts`

#### Access Control Logic (Layout.tsx lines 30-74)

1. **Public Routes**: Always accessible (logged out, pending, rejected, approved)
2. **Not Logged In + Protected Route**: Redirect to `/`
3. **Pending/Needs Clarification Status**: Redirect to `/pending-approval`
4. **Rejected Status**: Redirect to `/account-rejected`
5. **Approved Status**: Full access to all routes

### What Pending Users CAN Access

✅ **Public Content**:
- View events (read-only)
- View posts (read-only)
- View media gallery
- View challenges (read-only)
- View sponsors, founder, about, press pages
- Access contact form
- View community guidelines

✅ **Status Pages**:
- `/pending-approval` - View approval status and Q&A thread
- `/account-rejected` - View rejection reason (if rejected)

### What Pending Users CANNOT Access

❌ **Protected Features**:
- `/profile` - User profile management
- `/admin` - Admin console
- `/family-management` - Family member management
- `/workouts` - Workout plans

❌ **Interactive Features** (Even on Public Routes):
- Create posts
- Create comments
- Like posts/media
- RSVP to events
- Upload media
- Join challenges
- Create testimonials

### Firestore Security Rules

#### User Document Rules (firestore.rules lines 257-301)

**Read Access**:
- Signed-in users can read their own document
- Public read for basic info (displayName, photoURL, etc.)

**Create Access**:
- Users can create their own document
- Must have `status: 'pending'` (or no status field)
- Cannot set `role` to admin (unless blocked phone check passes)

**Update Access**:
- Users CANNOT update their own `status`, `role`, `approvedAt`, `approvedBy`, `rejectedAt`, `rejectedBy`, `rejectionReason`
- Only admins can update status fields
- Users can update profile fields (displayName, photoURL, etc.)

#### Account Approval Rules (firestore.rules lines 948-998)

**Read Access**:
- Users can read their own approval request
- Admins can read all approval requests

**Create Access**:
- Users can create their own approval request
- Must have `status: 'pending'`

**Update Access**:
- Only admins can update approval status

**Message Access**:
- Users can read/write messages for their own approval
- Admins can read/write messages for any approval

#### Feature-Specific Rules

**Events** (lines 341-520):
- Pending users can READ public events
- Pending users CANNOT create/update/delete events
- Pending users CANNOT RSVP (requires `isApprovedUser()`)

**Posts** (lines 556-622):
- Pending users can READ public posts
- Pending users CANNOT create posts (requires `isApprovedUser()`)
- Pending users CANNOT like/comment (requires `isApprovedUser()`)

**Media** (lines 714-774):
- Pending users can READ all media
- Pending users CANNOT upload media (requires `isApprovedUser()`)
- Pending users CANNOT like/comment (requires `isApprovedUser()`)

**Challenges** (lines 522-537):
- Pending users can READ challenges
- Pending users CANNOT join challenges (requires `isApprovedUser()`)

---

## 📄 5. Pending Approval Page

### Component: `src/pages/PendingApproval.tsx`

#### Features

1. **Status Display**
   - Shows current approval status
   - Displays "Under review" or "Awaiting your response"
   - Shows last admin reply timestamp

2. **Q&A Message Thread**
   - Real-time message updates via `onSnapshot`
   - Shows admin questions and user responses
   - Color-coded: Admin messages (purple), User messages (gray)

3. **Message Composer**
   - Only shown if:
     - Admin has sent a message, OR
     - Admin is awaiting user response
   - Allows user to reply to admin questions
   - Updates approval status to `needs_clarification` when admin asks question

4. **Contact Information**
   - Email: `momsfitnessmojo@gmail.com`

#### Data Flow

1. Load approval request via `AccountApprovalService.getApprovalByUserId()`
2. Subscribe to messages via `onSnapshot` on `approvalMessages` collection
3. Filter messages by `approvalId`
4. Send messages via `AccountApprovalService.sendMessage()`

---

## 🔄 6. Account Approval Workflow

### Service: `src/services/accountApprovalService.ts`

#### Key Functions

1. **`createApprovalRequest(data)`**
   - Creates document in `accountApprovals` collection
   - Sets `status: 'pending'`
   - Stores user information (email, location, howDidYouHear, etc.)

2. **`getApprovalByUserId(userId)`**
   - Retrieves approval request for a user
   - Returns `AccountApproval` object or `null`

3. **`sendMessage(data)`**
   - Creates message in `approvalMessages` collection
   - Updates approval document:
     - Sets `awaitingResponseFrom` (admin or user)
     - Increments unread count
     - Updates `lastMessageAt`
     - Changes status to `needs_clarification` if admin asks question

4. **`approveAccount(approvalId, adminId)`**
   - Updates approval document: `status: 'approved'`
   - Updates user document: `status: 'approved'`, `approvedAt`, `approvedBy`
   - User can now log in and access all features

5. **`rejectAccount(approvalId, adminId, rejectionReason)`**
   - Updates approval document: `status: 'rejected'`, `rejectionReason`
   - Updates user document: `status: 'rejected'`, `rejectedAt`, `rejectedBy`, `rejectionReason`
   - User cannot log in

6. **`canReapply(userId)`**
   - Checks if user can reapply after rejection
   - 30-day cooldown period
   - Returns `{ canReapply: boolean, reapplyDate?: Date }`

---

## 🔒 7. Security Measures

### Login Blocking

**Location**: `AuthContext.tsx` (lines 638-665)

- **Pending/Needs Clarification**: Immediately sign out + block login
- **Rejected**: Immediately sign out + block login with rejection reason
- **Approved**: Allow login

### Firestore Rules

**User Status Updates**:
- Users CANNOT update their own status
- Only admins can update status fields
- Users can only create documents with `status: 'pending'`

**Feature Access**:
- All write operations require `isApprovedUser()` check
- Read operations are more permissive (public content)

### Session Persistence

- Firebase Auth maintains session across page refreshes
- Firestore listener automatically updates user state when document changes
- Status changes (pending → approved) are reflected immediately

---

## 📊 8. Data Model

### User Document (`users/{userId}`)

```typescript
{
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phoneNumber: string;
  role: 'admin' | 'trainer' | 'member';
  status?: 'pending' | 'approved' | 'rejected' | 'needs_clarification';
  approvalRequestedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
  // ... other fields
}
```

### Account Approval Document (`accountApprovals/{approvalId}`)

```typescript
{
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  location?: string;
  howDidYouHear?: string;
  howDidYouHearOther?: string;
  referredBy?: string;
  referralNotes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_clarification';
  submittedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
  awaitingResponseFrom?: 'admin' | 'user' | null;
  unreadCount: { admin: number; user: number };
  lastMessageAt?: Date;
}
```

### Approval Message Document (`approvalMessages/{messageId}`)

```typescript
{
  id: string;
  approvalId: string;
  userId: string;
  senderRole: 'admin' | 'user';
  senderName: string;
  message: string;
  createdAt: Date;
  read: boolean;
  readAt?: Date;
}
```

---

## 🎯 9. Summary: Pending User State

### What Happens When User Registers

1. User completes 3-step registration
2. User document created with `status: 'pending'`
3. Account approval document created
4. User is logged in (Firebase Auth session active)
5. User navigated to `/pending-approval` page

### What Pending Users Can Do

✅ **View Public Content**:
- Browse events, posts, media, challenges
- View community information pages
- Access contact form

✅ **Manage Approval**:
- View approval status
- Read admin questions
- Reply to admin questions via Q&A thread
- See last admin reply timestamp

### What Pending Users Cannot Do

❌ **Login**:
- If they log out, they cannot log back in
- Login is blocked for pending/rejected users

❌ **Interactive Features**:
- Create posts, comments, likes
- RSVP to events
- Upload media
- Join challenges
- Access profile, admin, family management, workouts

❌ **Protected Routes**:
- All routes except public routes redirect to `/pending-approval`

### Status Transitions

1. **Pending → Approved**:
   - Admin approves via admin console
   - User document updated: `status: 'approved'`
   - User can now log in and access all features
   - Real-time update via Firestore listener

2. **Pending → Needs Clarification**:
   - Admin asks question via Q&A thread
   - Approval status updated to `needs_clarification`
   - User can reply to question
   - User still cannot log in

3. **Pending/Needs Clarification → Approved**:
   - Admin approves after clarification
   - User document updated: `status: 'approved'`
   - User can now log in

4. **Pending/Needs Clarification → Rejected**:
   - Admin rejects with reason
   - User document updated: `status: 'rejected'`
   - User redirected to `/account-rejected`
   - User cannot log in
   - Can reapply after 30 days

---

## 🔍 10. Key Files Reference

| File | Purpose |
|------|---------|
| `src/contexts/AuthContext.tsx` | Core authentication & session management |
| `src/components/auth/RegisterNew.tsx` | New user registration (3-step) |
| `src/components/auth/Login.tsx` | User login (2-step) |
| `src/components/layout/Layout.tsx` | Route protection & access control |
| `src/pages/PendingApproval.tsx` | Pending approval status page |
| `src/pages/AccountRejected.tsx` | Rejected account page |
| `src/services/accountApprovalService.ts` | Account approval workflow service |
| `src/types/index.ts` | TypeScript type definitions |
| `firestore.rules` | Firestore security rules |
| `src/components/admin/AccountApprovalsAdmin.tsx` | Admin approval interface |

---

## ✅ Conclusion

The authentication and account approval system is well-structured with:

1. **Secure Registration Flow**: 3-step process with phone verification
2. **Strict Access Control**: Pending users can only view public content
3. **Real-time Updates**: Firestore listeners update UI when status changes
4. **Q&A System**: Two-way communication between admin and user
5. **Security Rules**: Firestore rules prevent unauthorized access
6. **Session Management**: Firebase Auth + Firestore listeners maintain state

The system ensures that pending users remain authenticated during registration but are blocked from accessing protected features until approved by an admin.

