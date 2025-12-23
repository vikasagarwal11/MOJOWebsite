# Find Gen2 Functions in Google Cloud Console

## Problem

You're looking at the **"Functions (1st gen)"** tab, but the functions you need to delete are **2nd generation (Gen2)** functions, which appear in a different location.

## Solution: Switch to Cloud Run Functions

### Step 1: Go to Cloud Run (Not Cloud Functions)

The functions you're looking for are deployed as **Cloud Run services** (Gen2 functions):

1. **Open Cloud Run Console:**
   - Go to: https://console.cloud.google.com/run?project=momsfitnessmojo-65d00
   - OR click on **"Cloud Run"** in the left sidebar (not "Cloud Functions")

2. **Filter by Region:**
   - Make sure the region filter shows **us-east1** (top of the page)

### Step 2: Look for Your Functions

You should see functions listed as **Cloud Run services**. Look for:
- `onAccountApprovalCreated`
- `onAccountApprovalUpdated`
- `onApprovalMessageCreated`
- `logChallengeCheckIn`
- `grandfatherExistingUsers`

### Step 3: Delete Each Function

For each function:
1. Click on the function name
2. Click the **"DELETE"** button at the top
3. Confirm deletion

---

## Alternative: Use the Functions (2nd gen) Tab

Some Google Cloud Console views have a **"Functions (2nd gen)"** tab:

1. Go to: https://console.cloud.google.com/functions/list?project=momsfitnessmojo-65d00
2. Look for tabs at the top: **"Functions (1st gen)"** and **"Functions (2nd gen)"**
3. Click on **"Functions (2nd gen)"** tab
4. Filter by region: **us-east1**

---

## Why This Happens

- **1st Gen Functions** → Old Firebase Functions (v1)
- **2nd Gen Functions** → New Firebase Functions (v2) - These run on Cloud Run

Your functions are **Gen2**, so they appear in Cloud Run, not the old Cloud Functions page.

---

## Quick Links

- **Cloud Run Console**: https://console.cloud.google.com/run?project=momsfitnessmojo-65d00
- **Functions (2nd gen)**: https://console.cloud.google.com/functions/list?project=momsfitnessmojo-65d00 (switch to 2nd gen tab)

---

## After Finding Them

Once you find the functions in Cloud Run:
1. Delete each one
2. Wait 2-3 minutes
3. Redeploy using:
   ```powershell
   cd functions
   firebase deploy --only functions --project=momsfitnessmojo-65d00
   ```
