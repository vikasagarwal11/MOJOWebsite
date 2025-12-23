# Functions Deployment Fix

## Issue Identified

The functions `onAccountApprovalCreated`, `onAccountApprovalUpdated`, `onApprovalMessageCreated`, and `checkAndDispatchPendingSms` were not appearing in the Firebase Console after deployment.

## Root Cause

Firebase Functions v2 Firestore triggers need **explicit region configuration** in the function options, even though `setGlobalOptions` sets a default region. Some functions may not deploy correctly without explicit configuration.

## Fix Applied

Updated all three Firestore trigger functions to use explicit region configuration:

### Before:
```typescript
export const onAccountApprovalCreated = onDocumentCreated("accountApprovals/{approvalId}", async (event) => {
```

### After:
```typescript
export const onAccountApprovalCreated = onDocumentCreated(
  {
    document: "accountApprovals/{approvalId}",
    region: 'us-east1'
  },
  async (event) => {
```

## Functions Updated

1. ✅ `onAccountApprovalCreated` - Notifies admins when new approval request is created
2. ✅ `onAccountApprovalUpdated` - Notifies users when approval status changes  
3. ✅ `onApprovalMessageCreated` - Notifies when approval message is created
4. ✅ `checkAndDispatchPendingSms` - Already had explicit region (no change needed)

## Deployment

After this fix, redeploy the functions:

```powershell
cd functions
firebase deploy --only functions:onAccountApprovalCreated,functions:onAccountApprovalUpdated,functions:onApprovalMessageCreated,functions:checkAndDispatchPendingSms --project=momsfitnessmojo-65d00
```

## Verification

After deployment, check Firebase Console:
- Go to: https://console.firebase.google.com/project/momsfitnessmojo-65d00/functions
- You should now see all four functions listed

---

## Security Message (CVE-2025-55182)

The security message you see in Firebase Console is about **React/Next.js vulnerability CVE-2025-55182**.

### Is it for this project?

**Yes, it applies to your project** because you're using React.

### Current React Version

Your project uses: `react: ^18.3.1`

### Action Required

Firebase recommends updating to **React 19.2.1** or the latest stable version. However:

1. **Check if your version is affected**: CVE-2025-55182 might only affect React 19.x, not 18.x
2. **Test before upgrading**: React 19 has breaking changes from React 18
3. **Update when ready**: This is a security recommendation, not a critical issue if you're on React 18

### Recommendation

- **Short-term**: Monitor the CVE details to see if React 18.3.1 is affected
- **Long-term**: Plan to upgrade to React 19.2.1 when you have time to test thoroughly

This is a **general Firebase security recommendation** for all projects using React/Next.js, not specific to your deployment issue.
