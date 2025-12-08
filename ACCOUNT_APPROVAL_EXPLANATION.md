# Account Approval System - Complete Explanation

## 🎯 Why No Users Are Showing

**The Account Approvals screen queries the `accountApprovals` collection, NOT the `users` collection.**

### How It Works:

1. **New User Registration:**
   - User registers through `/register` → Creates TWO things:
     - ✅ User document in `users` collection with `status: 'pending'`
     - ✅ AccountApproval document in `accountApprovals` collection
   - **This user WILL show up** in Account Approvals screen

2. **Manually Updated Users:**
   - You manually set `status: 'pending'` in `users` collection
   - **But no `accountApproval` document exists**
   - **This user will NOT show up** in Account Approvals screen

### To See Users in Account Approvals:

**Option 1: Register a New User** (Easiest)
- Go to `/register` as a new user
- Complete registration
- This creates everything automatically

**Option 2: Manually Create accountApproval Document**
- Go to Firestore Console
- Create document in `accountApprovals` collection with:
  - `userId`: (user ID)
  - `firstName`, `lastName`, `email`, `phoneNumber`
  - `status`: `'pending'` (lowercase!)
  - `submittedAt`: (timestamp)

---

## ✅ Status Case Sensitivity

**MUST be lowercase:**
- ✅ `'pending'` (correct)
- ✅ `'approved'` (correct)  
- ✅ `'rejected'` (correct)
- ✅ `'needs_clarification'` (correct)

**WRONG:**
- ❌ `'Pending'` or `'PENDING'`
- ❌ `'Approved'` or `'APPROVED'`

The system is case-sensitive. Use lowercase only!

---

## 🔍 Where to Check User Status

### In Firebase Console:
1. Go to: https://console.firebase.google.com/project/momsfitnessmojo-65d00/firestore
2. Open `users` collection
3. Check `status` field (lowercase values)

### In Application (Admin):
1. Go to: Profile → Admin Tools → Account Approvals
2. This shows users with `accountApproval` documents
3. Filter by status: pending, approved, rejected, needs_clarification

---

## 📋 Complete Workflow

### For New Users:
1. User registers → Gets `status: 'pending'` + `accountApproval` document
2. Shows in Account Approvals screen
3. Admin reviews → Approves/Rejects/Asks questions
4. User gets notified

### For Existing Users (Manual Update):
1. Set `status: 'approved'` in `users` collection (you did this)
2. No `accountApproval` document needed (old users)
3. They won't show in Account Approvals screen (that's OK - they're already approved!)

---

## 💡 Recommendation

**To test the approval workflow:**
1. Log out
2. Register as a NEW user
3. Complete the 3-step registration
4. This user will appear in Account Approvals
5. Test approve/reject/Q&A

**Existing users** are already approved and don't need to show in Account Approvals.

