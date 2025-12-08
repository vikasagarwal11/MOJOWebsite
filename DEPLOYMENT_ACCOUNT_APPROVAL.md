# Account Approval Workflow - Deployment Guide

## ✅ What I CAN Do Automatically

1. ✅ **Create deployment scripts** - Done below
2. ✅ **Create helper scripts** - Done below  
3. ✅ **Verify code** - Checked for errors
4. ✅ **Create test checklists** - Done below

## ❌ What I CANNOT Do (Requires Manual Action)

1. ❌ **Actually deploy** - Requires Firebase CLI authentication and project access
2. ❌ **Run Cloud Functions** - Requires Firebase admin authentication
3. ❌ **Test the UI** - Requires browser interaction and manual testing
4. ❌ **Create Firestore indexes** - Firebase Console does this automatically when needed

---

## 🚀 Deployment Steps

### Step 1: Deploy Firestore Rules

**Command:**
```powershell
# Development
firebase deploy --only firestore:rules --project=dev

# Staging (if using)
firebase deploy --only firestore:rules --project=staging --config=firebase.staging.json

# Production
firebase deploy --only firestore:rules --project=prod --config=firebase.prod.json
```

**Or use npm scripts:**
```powershell
npm run deploy:dev:firestore
npm run deploy:staging:firestore
npm run deploy:prod:firestore
```

### Step 2: Deploy Cloud Functions

**Command:**
```powershell
# Development
firebase deploy --only functions --project=dev

# Staging
firebase deploy --only functions --project=staging --config=firebase.staging.json

# Production
firebase deploy --only functions --project=prod --config=firebase.prod.json
```

**Or use npm scripts:**
```powershell
npm run deploy:dev:functions
npm run deploy:staging:functions
npm run deploy:prod:functions
```

**What gets deployed:**
- `onAccountApprovalCreated` - Notifies admins of new requests
- `onAccountApprovalUpdated` - Notifies users on approval/rejection
- `onApprovalMessageCreated` - Notifies on messages
- `grandfatherExistingUsers` - Callable function to approve existing users

### Step 3: Deploy Frontend (if needed)

```powershell
npm run deploy:dev:hosting
# or
npm run deploy:staging:hosting
# or  
npm run deploy:prod:hosting
```

---

## 👴 Grandfather Existing Users

### Option 1: Call from Browser Console (Easiest)

1. Open your app in browser (as an admin user)
2. Open Developer Console (F12)
3. Run this code:

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');

grandfatherUsers()
  .then(result => {
    console.log('✅ Success:', result.data);
    alert(`Successfully updated ${result.data.updatedCount} users`);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    alert('Error: ' + error.message);
  });
```

### Option 2: Use Helper Script

See `scripts/grandfather-users.ps1` below.

### Option 3: Call via Firebase Console

1. Go to Firebase Console → Functions
2. Find `grandfatherExistingUsers` function
3. Click "Test" tab
4. Click "Test" button
5. Check logs for results

---

## 📊 Create Firestore Indexes

### Automatic (Recommended)
Firebase Console will automatically suggest indexes when queries fail. Just follow the links.

### Manual (If Needed)
1. Go to Firebase Console → Firestore → Indexes
2. Create composite index for:
   - Collection: `accountApprovals`
   - Fields:
     - `status` (Ascending)
     - `submittedAt` (Descending)
   - Collection: `approvalMessages`
   - Fields:
     - `approvalId` (Ascending)
     - `createdAt` (Ascending)

---

## 🧪 Testing Checklist

### Registration Flow
- [ ] Navigate to `/register`
- [ ] Enter phone number and name
- [ ] Verify SMS code received
- [ ] Enter verification code
- [ ] Fill out additional info form:
  - [ ] Email field works
  - [ ] Location field works
  - [ ] "How did you hear" dropdown works
  - [ ] Referrer search works (if applicable)
- [ ] Submit form
- [ ] Redirected to `/pending-approval`
- [ ] User document created with `status: 'pending'`
- [ ] `accountApproval` document created

### Pending Approval Page
- [ ] Page loads correctly
- [ ] Shows approval status
- [ ] Q&A thread displays (empty initially)
- [ ] Reply form works

### Admin Interface
- [ ] Navigate to Profile → Admin Tools
- [ ] Click "Account Approvals" tab
- [ ] See pending requests in list
- [ ] Filters work (All, Pending, etc.)
- [ ] Search works
- [ ] Click "View Details"
- [ ] Detail modal shows full info
- [ ] Q&A thread displays
- [ ] Test "Approve" action:
  - [ ] Account approved
  - [ ] User status changed to 'approved'
  - [ ] Notification sent
- [ ] Test "Reject" action:
  - [ ] Account rejected
  - [ ] User status changed to 'rejected'
  - [ ] Rejection reason saved
  - [ ] Notification sent
- [ ] Test "Ask Question" action:
  - [ ] Message sent
  - [ ] Status changed to 'needs_clarification'
  - [ ] Notification sent to user

### Q&A Messaging
- [ ] Admin sends question
- [ ] User receives notification (SMS + in-app)
- [ ] User sees question in pending approval page
- [ ] User replies
- [ ] Admin receives notification
- [ ] Admin sees reply in detail modal
- [ ] Real-time updates work

### Status Redirects
- [ ] Pending user redirected to `/pending-approval`
- [ ] Rejected user redirected to `/account-rejected`
- [ ] Approved user has full access
- [ ] Public routes accessible to all

### Notifications
- [ ] Admin receives notification for new request
- [ ] User receives notification when approved
- [ ] User receives notification when rejected
- [ ] User receives notification when admin asks question
- [ ] Admin receives notification when user responds

### Rejected Page
- [ ] Shows rejection reason
- [ ] Shows reapply date (if applicable)
- [ ] Reapply button works (after 30 days)

---

## 🐛 Troubleshooting

### Firestore Permission Denied
- Check security rules are deployed
- Verify user has correct role
- Check rules syntax

### Cloud Functions Not Triggering
- Check functions are deployed
- Check function logs in Firebase Console
- Verify event triggers are set up correctly

### Notifications Not Working
- Check notification service
- Verify FCM tokens
- Check SMS service configuration
- Review function logs

### Index Errors
- Check Firebase Console for index suggestions
- Create suggested indexes
- Wait for indexes to build (can take a few minutes)

---

## ✅ Deployment Complete Checklist

- [ ] Firestore rules deployed
- [ ] Cloud Functions deployed
- [ ] Frontend deployed (if updated)
- [ ] Grandfather function executed
- [ ] Firestore indexes created (if needed)
- [ ] Registration flow tested
- [ ] Admin workflow tested
- [ ] Q&A messaging tested
- [ ] Notifications tested
- [ ] Status redirects tested

---

## 📝 Notes

- Always deploy to dev/staging first before production
- Test thoroughly before production deployment
- Monitor Firebase Console logs after deployment
- Check for index suggestions in console after first queries

