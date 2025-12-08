# Delete Functions Manually - Step by Step

## Problem

The functions exist as **HTTPS functions** but need to be **Firestore triggers**. Firebase doesn't allow changing function types, so we need to delete them first.

## Solution: Delete via Firebase Console

### Step 1: Go to Firebase Console

1. Open: https://console.firebase.google.com/project/momsfitnessmojo-65d00/functions
2. You should see the functions listed

### Step 2: Delete Each Function

For each of these functions, click the **three dots (⋮)** menu and select **"Delete"**:

1. ✅ `onAccountApprovalCreated` (us-east1)
2. ✅ `onAccountApprovalUpdated` (us-east1)
3. ✅ `onApprovalMessageCreated` (us-east1)
4. ✅ `checkAndDispatchPendingSms` (us-east1)

### Step 3: Confirm Deletion

- Click **"Delete"** in the confirmation dialog
- Wait for deletion to complete (may take 1-2 minutes)

### Step 4: Redeploy

After all functions are deleted, run:

```powershell
cd functions
firebase deploy --only functions --project=momsfitnessmojo-65d00
```

---

## Alternative: Use gcloud CLI (If Available)

If you have `gcloud` CLI installed:

```powershell
# Delete functions using gcloud
gcloud functions delete onAccountApprovalCreated --region=us-east1 --project=momsfitnessmojo-65d00 --gen2 --quiet
gcloud functions delete onAccountApprovalUpdated --region=us-east1 --project=momsfitnessmojo-65d00 --gen2 --quiet
gcloud functions delete onApprovalMessageCreated --region=us-east1 --project=momsfitnessmojo-65d00 --gen2 --quiet
gcloud functions delete checkAndDispatchPendingSms --region=us-east1 --project=momsfitnessmojo-65d00 --gen2 --quiet
```

---

## Why This Happened

These functions were previously deployed as **HTTPS/callable functions**, but now they're defined as **Firestore triggers** (background functions). Firebase doesn't allow changing the function type, so they must be deleted and recreated.

---

## After Deletion

Once deleted, the deployment will create them as the correct type:
- ✅ `onAccountApprovalCreated` → Firestore trigger (on document created)
- ✅ `onAccountApprovalUpdated` → Firestore trigger (on document written)
- ✅ `onApprovalMessageCreated` → Firestore trigger (on document created)
- ✅ `checkAndDispatchPendingSms` → Scheduled function (every 5 minutes)
