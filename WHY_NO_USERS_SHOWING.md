# Why Account Approvals Screen Shows "No approval requests found"

## 🔍 The Issue

The Account Approvals screen shows "No approval requests found" because:

**The screen queries the `accountApprovals` collection, NOT the `users` collection.**

## 📋 How It Works

### ✅ What Shows Up in Account Approvals:
- Only users who have an `accountApproval` document in the `accountApprovals` collection
- These documents are created automatically when users register through the NEW registration flow

### ❌ What Does NOT Show Up:
- Users who were manually updated in Firestore (just setting `status` field)
- Users created before the approval system was added
- Users without an `accountApproval` document

## 🎯 Why This Design?

The `accountApprovals` collection stores:
- Registration information (how they heard, location, referrer)
- Q&A message threads
- Approval history and notes
- Status workflow

This is separate from the user's `status` field in the `users` collection.

## ✅ Solution

To see users in the Account Approvals screen, you need **BOTH**:

1. **User document** with `status` field (you already did this)
2. **AccountApproval document** in `accountApprovals` collection (missing!)

### Option 1: Create AccountApproval Document for Test User

For your test user with `status: 'pending'`, create an `accountApproval` document:

**Collection:** `accountApprovals`

**Document fields:**
- `userId`: (the user's ID)
- `firstName`: (user's first name)
- `lastName`: (user's last name)
- `email`: (user's email)
- `phoneNumber`: (user's phone)
- `status`: `'pending'` (lowercase!)
- `submittedAt`: (current timestamp)

### Option 2: Register a New User (Easiest for Testing)

1. Log out
2. Go to `/register`
3. Register as a new user
4. Complete the 3-step registration
5. This will automatically create both:
   - User document with `status: 'pending'`
   - `accountApproval` document
6. Now it will show in Account Approvals!

## 📝 Status Case Sensitivity

**MUST be lowercase:**
- ✅ `'pending'` (correct)
- ✅ `'approved'` (correct)
- ✅ `'rejected'` (correct)
- ✅ `'needs_clarification'` (correct)

**WRONG:**
- ❌ `'Pending'` or `'PENDING'`
- ❌ `'Approved'` or `'APPROVED'`

## 🎯 Recommendation

**Easiest way to test:** Register a new test user through the registration flow. This will create everything automatically and you'll see them in Account Approvals immediately!

