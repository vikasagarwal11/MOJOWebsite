# Delete Functions Using gcloud CLI Directly

## Problem

The Firebase CLI delete commands aren't working - functions still show as `https` triggers.

## Solution: Use gcloud CLI Directly

Since these are Gen2 functions (v2), we need to delete them as Cloud Run services using `gcloud`.

### Step 1: Install gcloud (If Not Installed)

If you don't have gcloud CLI:
1. Download: https://cloud.google.com/sdk/docs/install
2. Install it
3. Run: `gcloud auth login`
4. Run: `gcloud config set project momsfitnessmojo-65d00`

### Step 2: Delete Functions Using gcloud

Run these commands **one at a time**:

```powershell
# Set project
gcloud config set project momsfitnessmojo-65d00

# Delete as Cloud Run services (Gen2 functions are Cloud Run services)
gcloud run services delete onaccountapprovalcreated --region=us-east1 --quiet
gcloud run services delete onaccountapprovalupdated --region=us-east1 --quiet
gcloud run services delete onapprovalmessagecreated --region=us-east1 --quiet
```

**Note**: Function names are lowercase in Cloud Run: `onaccountapprovalcreated` not `onAccountApprovalCreated`

### Step 3: Wait and Verify

Wait 2-3 minutes, then check:

```powershell
firebase functions:list --project=momsfitnessmojo-65d00 | Select-String "onAccount"
```

They should be gone.

### Step 4: Redeploy

Once deleted:

```powershell
cd functions
firebase deploy --only functions:onAccountApprovalCreated,functions:onAccountApprovalUpdated,functions:onApprovalMessageCreated --project=momsfitnessmojo-65d00
```

---

## Alternative: Delete via Google Cloud Console

If gcloud doesn't work:

1. Go to: https://console.cloud.google.com/run?project=momsfitnessmojo-65d00
2. Make sure project is `momsfitnessmojo-65d00` (not prod)
3. Filter by region: `us-east1`
4. Look for services with lowercase names:
   - `onaccountapprovalcreated`
   - `onaccountapprovalupdated`
   - `onapprovalmessagecreated`
5. Click each one → Click "DELETE" button → Confirm

---

## Why This Happens

Gen2 functions are deployed as Cloud Run services. Sometimes Firebase CLI can't delete them properly, but `gcloud` or the Cloud Console can.
