# 📋 Account Approval Workflow - Complete Guide

## 🎯 Where to Check User Status & Complete Workflow

---

## **Step 1: Navigate to Admin Console**

### Path:
1. Go to your website: **https://momsfitnessmojo.com**
2. Log in as **admin user**
3. Click on **Profile** (top right, or from menu)
4. Click on the **"Admin Tools"** tab (at the top)
5. Click on **"Account Approvals"** button (in the admin tools menu)

**Full Path:** Profile → Admin Tools → Account Approvals

---

## **Step 2: Account Approvals Dashboard**

Once you're in the **Account Approvals** section, you'll see:

### Features Available:

1. **Status Filters** (top buttons):
   - **All** - Shows all approval requests
   - **Pending** - Shows users waiting for approval (default)
   - **Needs Clarification** - Shows users where admin asked questions
   - **Approved** - Shows approved users
   - **Rejected** - Shows rejected users

2. **Search Bar**:
   - Search by: name, email, phone number, location
   - Real-time filtering

3. **Grandfather Existing Users Button** (top right):
   - Blue button to set all old users to approved (one-time operation)

4. **Approval Requests Table**:
   - Shows list of users requesting approval
   - Displays: Name, Email, Phone, Location, Status, Submitted Date
   - Click on any row to see details

---

## **Step 3: Review User Details**

Click on any approval request to open the **Detail Modal** showing:

- **User Information:**
  - Full name, email, phone number
  - Location
  - Profile photo (if available)

- **Application Information:**
  - How did they hear about us?
  - Referred by (if applicable)
  - Additional notes
  - Submitted date

- **Status History:**
  - Current status
  - When it was submitted
  - When it was reviewed (if applicable)
  - Who reviewed it

- **Q&A Thread:**
  - Real-time message thread
  - Admin questions and user responses
  - Send new questions/messages

---

## **Step 4: Take Actions**

### **Action 1: Approve Account** ✅

1. Click on the approval request
2. Review all information
3. Click **"Approve"** button (green)
4. Account is instantly approved
5. User receives notification and can now access the app

**Result:**
- User `status` → `approved`
- User can access full app
- Notification sent to user

---

### **Action 2: Reject Account** ❌

1. Click on the approval request
2. Click **"Reject"** button (red)
3. **Required:** Enter rejection reason
4. Click **"Confirm Rejection"**
5. Account is rejected

**Result:**
- User `status` → `rejected`
- User sees rejection reason
- User can reapply after 30 days

---

### **Action 3: Ask Question** 💬

1. Click on the approval request
2. Click **"Ask Question"** button
3. Type your question/message
4. Click **"Send Message"**
5. Status changes to `needs_clarification`

**Result:**
- User `status` → `needs_clarification`
- User receives notification
- User can respond in their pending approval page
- Real-time Q&A thread

---

## **Complete Workflow Example**

### **Scenario: New User Registration**

1. **User registers:**
   - User goes to `/register`
   - Completes 3-step registration:
     - Step 1: Phone + Name
     - Step 2: SMS verification
     - Step 3: Email, location, how they heard, etc.
   - User is created with `status: 'pending'`
   - User is redirected to `/pending-approval` page

2. **Admin gets notified:**
   - Admin receives in-app notification
   - Admin receives SMS notification (if configured)

3. **Admin reviews:**
   - Admin goes to: Profile → Admin Tools → Account Approvals
   - Sees user in "Pending" filter
   - Clicks on user to see details

4. **Admin actions:**
   - **Option A:** Approve immediately → User gets access
   - **Option B:** Ask questions → Status → `needs_clarification`
     - User responds
     - Admin reviews response
     - Admin approves or rejects
   - **Option C:** Reject → User sees reason, can reapply in 30 days

5. **User experience:**
   - **Pending/Needs Clarification:** Sees pending approval page with Q&A
   - **Approved:** Full app access
   - **Rejected:** Sees rejection page with reason

---

## **Real-Time Updates**

- ✅ All changes update in real-time (no refresh needed)
- ✅ Q&A messages appear instantly
- ✅ Status changes update immediately
- ✅ Notification badges show unread messages

---

## **Quick Reference**

### **User Status Values:**
- `pending` - Waiting for approval
- `approved` - Full access granted
- `rejected` - Account rejected
- `needs_clarification` - Admin asked questions

### **Where to Find:**
- **Admin View:** Profile → Admin Tools → Account Approvals
- **User View:** `/pending-approval` (for pending users)
- **Rejected View:** `/account-rejected` (for rejected users)

### **Navigation:**
- **Home:** Main menu → Profile
- **Admin Console:** Profile → Admin Tools tab
- **Account Approvals:** Admin Tools → Account Approvals button

---

## **Tips**

1. **Use Filters:** Filter by status to focus on pending requests
2. **Use Search:** Quickly find users by name, email, or phone
3. **Ask Questions:** Use Q&A to clarify before approving/rejecting
4. **Check History:** View status history to see what happened
5. **Real-Time:** Everything updates instantly - no refresh needed

---

## **Testing the Workflow**

1. **Create Test User:**
   - Register as new user (or set one user to `status: 'pending'` in Firestore)
   - User should see pending approval page

2. **Test Admin View:**
   - Log in as admin
   - Go to Account Approvals
   - See the pending user

3. **Test Actions:**
   - Approve a user → User gets access
   - Reject a user → User sees rejection
   - Ask question → Q&A thread works

---

Everything is ready to use! 🎉

