# Reapplication Process - How It Works

## 📋 **Current Implementation**

### **When Can User Reapply?**

**30-Day Cooldown Period:**
- User is rejected → `rejectedAt` timestamp is saved
- Cooldown period: **30 days** from rejection date
- After 30 days, user can submit a new registration request

### **How It Works:**

1. **User Gets Rejected**
   - Admin rejects account with reason
   - `user.rejectedAt` timestamp is set
   - `user.status` = `'rejected'`
   - User is redirected to `/account-rejected` page

2. **Cooldown Period (30 Days)**
   - User visits `/account-rejected` page
   - Page calls `AccountApprovalService.canReapply(userId)`
   - Checks if `now >= rejectedAt + 30 days`
   - Shows:
     - **If cooldown active:** "Reapplication Available Soon - You can reapply on [date]"
     - **If cooldown expired:** "You Can Reapply Now" with button

3. **After Cooldown Expires**
   - User clicks "Submit New Registration" button
   - Redirects to `/register` page
   - User goes through registration flow again

---

## ⚠️ **Current Issue**

### **Problem:**
The registration flow checks if phone number exists, and if it does, it blocks registration with error: "This phone number is already registered. Please sign in instead."

**This means rejected users can't reapply with the same phone number!**

### **Why This Happens:**
- `checkPhoneNumberExists` function only checks if phone number exists
- Doesn't check user status or cooldown period
- Rejected user's phone number still exists in database
- Registration is blocked

---

## ✅ **Solution Needed**

### **Option 1: Update `checkPhoneNumberExists` (Recommended)**
Modify the Cloud Function to:
- Check if user exists with that phone number
- If user exists and status is `'rejected'`:
  - Check if cooldown period has passed
  - If yes → Return `exists: false` (allow reapplication)
  - If no → Return `exists: true` (block reapplication)
- If user exists and status is NOT `'rejected'`:
  - Return `exists: true` (block - user already registered)

### **Option 2: Update Registration Flow**
Modify `RegisterNew.tsx` to:
- Check if user exists
- If exists and status is `'rejected'`:
  - Check `canReapply()` 
  - If can reapply → Allow registration (update existing user)
  - If cannot reapply → Show cooldown message

### **Option 3: Create New User Document**
When rejected user reapplies:
- Create a NEW user document (different userId)
- Keep old rejected user document for history
- Link them somehow (optional)

---

## 🎯 **Recommended Approach**

**Option 1 is best** because:
- ✅ Centralized logic in Cloud Function
- ✅ Works for all registration entry points
- ✅ Consistent behavior
- ✅ Easy to maintain

**Implementation:**
```typescript
export const checkPhoneNumberExists = onCallWithCors({}, async (request) => {
  const { phoneNumber } = request.data;
  
  // Find user with this phone number
  const usersSnapshot = await db.collection('users')
    .where('phoneNumber', '==', phoneNumber)
    .limit(1)
    .get();
  
  if (usersSnapshot.empty) {
    return { exists: false };
  }
  
  const userDoc = usersSnapshot.docs[0];
  const userData = userDoc.data();
  
  // If user is rejected, check cooldown period
  if (userData.status === 'rejected' && userData.rejectedAt) {
    const rejectedAt = userData.rejectedAt.toDate();
    const cooldownDays = 30;
    const reapplyDate = new Date(rejectedAt);
    reapplyDate.setDate(reapplyDate.getDate() + cooldownDays);
    const now = new Date();
    
    // If cooldown has passed, allow reapplication
    if (now >= reapplyDate) {
      return { 
        exists: false,  // Allow reapplication
        canReapply: true,
        message: 'You can reapply now'
      };
    } else {
      return { 
        exists: true,  // Block - still in cooldown
        canReapply: false,
        reapplyDate: reapplyDate.toISOString(),
        message: `You can reapply after ${format(reapplyDate, 'MMM d, yyyy')}`
      };
    }
  }
  
  // For all other statuses (pending, approved, etc.), block registration
  return { exists: true };
});
```

---

## 📱 **User Experience Flow**

### **Scenario 1: Rejected User Tries to Reapply (Cooldown Active)**

1. User visits `/account-rejected` page
2. Sees: "Reapplication Available Soon - You can reapply on Jan 1, 2026"
3. User clicks "Submit New Registration" (button might be disabled)
4. Goes to `/register` page
5. Enters phone number
6. **Gets error:** "This phone number is already registered. You can reapply after [date]"
7. User must wait until cooldown expires

### **Scenario 2: Rejected User Tries to Reapply (Cooldown Expired)**

1. User visits `/account-rejected` page
2. Sees: "You Can Reapply Now" with button
3. User clicks "Submit New Registration"
4. Goes to `/register` page
5. Enters phone number
6. **Registration proceeds** (phone check passes)
7. User completes registration
8. New approval request is created
9. User status changes from `'rejected'` → `'pending'`

---

## 🔧 **What Needs to Be Fixed**

1. **Update `checkPhoneNumberExists` Cloud Function**
   - Add logic to check rejected status
   - Check cooldown period
   - Return appropriate response

2. **Update Registration Error Messages**
   - If user is rejected and cooldown active → Show specific message with reapply date
   - If user is rejected and cooldown expired → Allow registration

3. **Update Existing User on Reapplication**
   - When rejected user reapplies, update existing user document
   - Change status from `'rejected'` → `'pending'`
   - Create new approval request
   - Keep rejection history (don't delete `rejectedAt`)

---

## ✅ **Summary**

**Current State:**
- ✅ Cooldown logic exists (`canReapply()`)
- ✅ UI shows reapplication status
- ❌ Registration flow blocks rejected users
- ❌ Can't reapply with same phone number

**After Fix:**
- ✅ Cooldown logic works
- ✅ UI shows reapplication status
- ✅ Registration flow allows reapplication after cooldown
- ✅ Can reapply with same phone number after 30 days

**Next Step:** Implement the fix in `checkPhoneNumberExists` Cloud Function.

