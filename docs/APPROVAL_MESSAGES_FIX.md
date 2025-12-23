# Fix: Pending Users Cannot Send Messages - Firestore Security Rules

## 🔴 Problem

**Error:**
```
Error sending approval message: FirebaseError: Missing or insufficient permissions.
```

**Root Cause:**
When a pending user tries to respond to an admin question, the `sendMessage` function:
1. ✅ Creates a message in `approvalMessages` collection (allowed by rules)
2. ❌ **Tries to update the approval document** in `accountApprovals` collection (BLOCKED by rules)

The Firestore security rules (line 961) only allow **admins** to update approval documents:
```javascript
allow update: if isSignedIn() && isAdmin();
```

But when a user sends a message, the service needs to update:
- `lastMessageAt` - timestamp of last message
- `awaitingResponseFrom` - who needs to respond next
- `unreadCount` - unread message counts

---

## ✅ Solution

**Fix:** Allow users to update **specific fields** of their own approval document when sending messages.

**Updated Rule:**
```javascript
allow update: if isSignedIn() && (
  // Admins can update all fields including status
  isAdmin() ||
  // Users can update message-related fields of their own approval
  (resource.data.userId == request.auth.uid &&
   // Only allow: lastMessageAt, awaitingResponseFrom, unreadCount
   request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lastMessageAt', 'awaitingResponseFrom', 'unreadCount']) &&
   // Cannot change status
   request.resource.data.status == resource.data.status &&
   // Cannot change userId
   request.resource.data.userId == resource.data.userId)
);
```

**What This Allows:**
- ✅ Users can update `lastMessageAt`
- ✅ Users can update `awaitingResponseFrom`
- ✅ Users can update `unreadCount`
- ❌ Users **cannot** change `status`
- ❌ Users **cannot** change `userId` or other fields

---

## 📋 What Needs to Be Deployed

**File:** `firestore.rules`

**Changes:**
- Updated `accountApprovals` update rule (lines 960-961)
- Allows users to update message-related fields
- Maintains security (cannot change status or other sensitive fields)

**Deployment:**
```powershell
.\deploy-prod.ps1 firestore -SkipChecks
```

**OR:**
```powershell
firebase deploy --only firestore:rules --project=momsfitnessmojo-65d00 --config=firebase.prod.json
```

---

## 🔍 Why This Fix Works

1. **Message Creation** - Already allowed by rules ✅
2. **Approval Update** - Now allowed for specific fields ✅
3. **Status Protection** - Users still cannot change status ✅
4. **Security Maintained** - Only message-related fields can be updated ✅

---

## ✅ After Deployment

Pending users will be able to:
- ✅ Create messages in the Q&A thread
- ✅ Update approval document with message metadata
- ✅ See messages appear in real-time
- ❌ Still cannot change approval status (admin only)

---

## 📝 Summary

**Problem:** Firestore rules blocked users from updating approval documents when sending messages.

**Fix:** Allow users to update specific message-related fields (`lastMessageAt`, `awaitingResponseFrom`, `unreadCount`) while maintaining security on status changes.

**Action Required:** Deploy Firestore rules only.

