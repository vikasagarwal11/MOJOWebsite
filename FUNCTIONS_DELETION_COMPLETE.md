# Functions Deletion - Next Steps

## What We Did

Used `gcloud functions delete` with `--gen2` flag to delete the stuck functions:
- ✅ `onAccountApprovalCreated`
- ✅ `onAccountApprovalUpdated`
- ✅ `onApprovalMessageCreated`

## Verify Deletion

Wait 2-3 minutes, then check:

```powershell
firebase functions:list --project=momsfitnessmojo-65d00 | Select-String "onAccount"
```

They should **not appear** in the list.

## If They're Gone - Deploy!

Once verified they're deleted, deploy the functions with correct trigger types:

```powershell
cd functions
firebase deploy --only functions:onAccountApprovalCreated,functions:onAccountApprovalUpdated,functions:onApprovalMessageCreated,functions:checkAndDispatchPendingSms --project=momsfitnessmojo-65d00
```

This will create them as:
- ✅ `onAccountApprovalCreated` → Firestore trigger (on document created)
- ✅ `onAccountApprovalUpdated` → Firestore trigger (on document written)
- ✅ `onApprovalMessageCreated` → Firestore trigger (on document created)
- ✅ `checkAndDispatchPendingSms` → Scheduled function (every 5 minutes)

## After Deployment

Verify they're created correctly:

```powershell
firebase functions:list --project=momsfitnessmojo-65d00 | Select-String "onAccount|checkAndDispatch"
```

They should show as:
- `google.cloud.firestore.document.v1.created` (for onAccountApprovalCreated)
- `google.cloud.firestore.document.v1.written` (for onAccountApprovalUpdated)
- `google.cloud.firestore.document.v1.created` (for onApprovalMessageCreated)
- `schedule` (for checkAndDispatchPendingSms)

**NOT** as `https` triggers!
