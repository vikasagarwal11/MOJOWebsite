# Delete Invalid Functions Using CLI

## Problem

Functions with "Unknown trigger" type cannot be deleted from Firebase Console. The console message says: **"Functions with unknown trigger types cannot be deleted using Firebase console. They can be deleted using the CLI."**

## Solution: Use Firebase CLI

Run these commands **one at a time** in PowerShell:

### Step 1: Delete Invalid Functions

```powershell
cd functions

# Delete the account approval functions
firebase functions:delete onAccountApprovalCreated --region us-east1 --project=momsfitnessmojo-65d00 --force
firebase functions:delete onAccountApprovalUpdated --region us-east1 --project=momsfitnessmojo-65d00 --force
firebase functions:delete onApprovalMessageCreated --region us-east1 --project=momsfitnessmojo-65d00 --force
firebase functions:delete checkAndDispatchPendingSms --region us-east1 --project=momsfitnessmojo-65d00 --force

# Delete other invalid functions
firebase functions:delete logChallengeCheckIn --region us-east1 --project=momsfitnessmojo-65d00 --force
firebase functions:delete grandfatherExistingUsers --region us-east1 --project=momsfitnessmojo-65d00 --force
```

### Step 2: Wait for Deletion

Wait **2-3 minutes** for the deletions to complete. You can verify in Firebase Console that the functions are gone.

### Step 3: Redeploy Functions

After deletion completes, deploy the correct versions:

```powershell
cd functions
firebase deploy --only functions --project=momsfitnessmojo-65d00
```

---

## Alternative: Use gcloud CLI (If Available)

If you have Google Cloud SDK installed, you can use `gcloud`:

```powershell
# Set project
gcloud config set project momsfitnessmojo-65d00

# Delete functions (Gen2 functions)
gcloud functions delete onAccountApprovalCreated --region=us-east1 --gen2 --quiet
gcloud functions delete onAccountApprovalUpdated --region=us-east1 --gen2 --quiet
gcloud functions delete onApprovalMessageCreated --region=us-east1 --gen2 --quiet
gcloud functions delete checkAndDispatchPendingSms --region=us-east1 --gen2 --quiet
gcloud functions delete logChallengeCheckIn --region=us-east1 --gen2 --quiet
gcloud functions delete grandfatherExistingUsers --region=us-east1 --gen2 --quiet
```

---

## Why These Functions Are Invalid

These functions have **"Unknown trigger"** type because:
- They were previously deployed as **HTTPS/HTTP functions**
- But now they're defined as **Firestore triggers** or **Scheduled functions**
- Firebase can't change function types, so they're stuck in an invalid state

## After Deletion

Once deleted, the deployment will create them with the **correct trigger types**:
- ✅ `onAccountApprovalCreated` → Firestore trigger (on document created)
- ✅ `onAccountApprovalUpdated` → Firestore trigger (on document written)
- ✅ `onApprovalMessageCreated` → Firestore trigger (on document created)
- ✅ `checkAndDispatchPendingSms` → Scheduled function (every 5 minutes)
- ✅ `logChallengeCheckIn` → Will be recreated if it exists in your code
- ✅ `grandfatherExistingUsers` → Will be recreated if it exists in your code

---

## Verify Deletion

After running the delete commands, check Firebase Console:
- Go to: https://console.firebase.google.com/project/momsfitnessmojo-65d00/functions
- The functions should no longer appear in the list
- Wait 2-3 minutes if they still show (deletion takes time)

Then proceed with deployment!
