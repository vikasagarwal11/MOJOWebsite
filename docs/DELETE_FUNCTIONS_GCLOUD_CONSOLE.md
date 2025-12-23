# Delete Invalid Functions - Multiple Methods

## Functions Still in Invalid State

These functions need to be deleted:
- ❌ `onAccountApprovalCreated` (Unknown trigger)
- ❌ `onAccountApprovalUpdated` (Unknown trigger)
- ❌ `onApprovalMessageCreated` (Unknown trigger)
- ❌ `logChallengeCheckIn` (Invalid state)
- ❌ `grandfatherExistingUsers` (Invalid state)

✅ `checkAndDispatchPendingSms` - Already deleted

---

## Method 1: Google Cloud Console (Recommended)

Since Firebase Console can't delete these, use **Google Cloud Console** directly:

### Step 1: Go to Cloud Functions

1. Open: https://console.cloud.google.com/functions/list?project=momsfitnessmojo-65d00&supportedpurview=project
2. Make sure you're in the **us-east1** region (check the region filter at the top)

### Step 2: Delete Each Function

For each function:
1. Find the function in the list
2. Click the **three dots (⋮)** menu
3. Select **"Delete"**
4. Confirm deletion

**Functions to delete:**
- `onAccountApprovalCreated`
- `onAccountApprovalUpdated`
- `onApprovalMessageCreated`
- `logChallengeCheckIn`
- `grandfatherExistingUsers`

### Step 3: Wait for Deletion

Wait **2-3 minutes** for all deletions to complete.

---

## Method 2: gcloud CLI (If Installed)

If you have Google Cloud SDK installed:

```powershell
# Install gcloud if needed: https://cloud.google.com/sdk/docs/install

# Set project
gcloud config set project momsfitnessmojo-65d00

# Delete Gen2 functions
gcloud functions delete onAccountApprovalCreated --region=us-east1 --gen2 --quiet
gcloud functions delete onAccountApprovalUpdated --region=us-east1 --gen2 --quiet
gcloud functions delete onApprovalMessageCreated --region=us-east1 --gen2 --quiet
gcloud functions delete logChallengeCheckIn --region=us-east1 --gen2 --quiet
gcloud functions delete grandfatherExistingUsers --region=us-east1 --gen2 --quiet
```

---

## Method 3: Firebase CLI (Try Again)

Sometimes the Firebase CLI needs the exact function name with region:

```powershell
cd functions

# Try with full function path
firebase functions:delete onAccountApprovalCreated --region us-east1 --project=momsfitnessmojo-65d00 --force
firebase functions:delete onAccountApprovalUpdated --region us-east1 --project=momsfitnessmojo-65d00 --force
firebase functions:delete onApprovalMessageCreated --region us-east1 --project=momsfitnessmojo-65d00 --force
firebase functions:delete logChallengeCheckIn --region us-east1 --project=momsfitnessmojo-65d00 --force
firebase functions:delete grandfatherExistingUsers --region us-east1 --project=momsfitnessmojo-65d00 --force
```

---

## After Deletion

Once all functions are deleted:

1. **Wait 2-3 minutes** for deletions to complete
2. **Verify in Firebase Console**: https://console.firebase.google.com/project/momsfitnessmojo-65d00/functions
3. **Redeploy**:
   ```powershell
   cd functions
   firebase deploy --only functions --project=momsfitnessmojo-65d00
   ```

---

## What Will Be Recreated

After deployment, these will be created with **correct trigger types**:
- ✅ `onAccountApprovalCreated` → Firestore trigger (on document created)
- ✅ `onAccountApprovalUpdated` → Firestore trigger (on document written)
- ✅ `onApprovalMessageCreated` → Firestore trigger (on document created)
- ✅ `logChallengeCheckIn` → HTTPS function (onCall)
- ✅ `grandfatherExistingUsers` → HTTPS function (onCall)

---

## Recommendation

**Use Method 1 (Google Cloud Console)** - It's the most reliable for deleting functions with "Unknown trigger" types.
