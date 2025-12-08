# Legacy User Migration Guide

## 🎯 Purpose

After applying the security fixes, users without a `status` field will be treated as `'pending'` and blocked from access. This migration script sets `status: 'approved'` for all existing users who don't have a status field, preserving access for your trusted legacy members.

---

## ⚠️ Prerequisites

1. **Backup Firestore Database**
   - Go to Firebase Console → Firestore → Export
   - Or use: `gcloud firestore export gs://YOUR_BUCKET/backup`

2. **Firebase Admin SDK Setup**
   - Install Node.js (v14+)
   - Set up Firebase Admin credentials:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
     ```
   - Or use Application Default Credentials

3. **Install Dependencies**
   ```bash
   npm install firebase-admin
   ```

---

## 🚀 Running the Migration

### Option 1: Node.js Script (Cross-platform)

#### Dry Run (Recommended First)
```bash
node scripts/migrate-legacy-users.js --dry-run
```

#### Live Migration
```bash
node scripts/migrate-legacy-users.js
```

#### With Custom Project ID
```bash
node scripts/migrate-legacy-users.js --project-id=your-project-id
```

### Option 2: PowerShell Script (Windows)

#### Dry Run
```powershell
.\scripts\migrate-legacy-users.ps1 -DryRun
```

#### Live Migration
```powershell
.\scripts\migrate-legacy-users.ps1
```

#### With Custom Project ID
```powershell
.\scripts\migrate-legacy-users.ps1 -ProjectId "your-project-id"
```

---

## 📊 What the Script Does

1. **Fetches all users** from Firestore
2. **Identifies users** without a `status` field
3. **Shows summary** of users to be migrated
4. **Asks for confirmation** (in live mode)
5. **Updates users** in batches (500 at a time)
6. **Sets status** to `'approved'`
7. **Adds migration markers** for tracking:
   - `_migratedAt`: Timestamp of migration
   - `_migrationNote`: Note about the migration

---

## ✅ Verification Steps

After running the migration:

1. **Check Firebase Console**
   - Go to Firestore → `users` collection
   - Verify all users now have `status: 'approved'`
   - Check for `_migratedAt` field on migrated users

2. **Test Legacy User Login**
   - Have a legacy user try to log in
   - Verify they can access all features
   - Verify no redirect to `/pending-approval`

3. **Check Migration Markers**
   - Query users with `_migratedAt` field
   - Count should match the migration summary

---

## 🔍 Query Examples

### Find Migrated Users
```javascript
// In Firebase Console or Cloud Function
const migratedUsers = await db.collection('users')
  .where('_migratedAt', '!=', null)
  .get();
```

### Find Users Still Without Status (Should be 0)
```javascript
const usersWithoutStatus = await db.collection('users')
  .get()
  .then(snapshot => 
    snapshot.docs.filter(doc => !doc.data().status)
  );
```

---

## 🚨 Troubleshooting

### Error: "Permission denied"
- Ensure service account has Firestore Admin permissions
- Check `GOOGLE_APPLICATION_CREDENTIALS` is set correctly

### Error: "Project not found"
- Verify project ID is correct
- Check Firebase Admin initialization

### Batch Size Errors
- Script uses batches of 500 (Firestore limit)
- If errors occur, check individual user documents for issues

### Partial Migration
- Script continues even if some users fail
- Check error summary at the end
- Re-run for failed users if needed

---

## 📝 Post-Migration Cleanup (Optional)

After verifying the migration, you can optionally remove migration markers:

```javascript
// Remove migration markers (optional)
const batch = db.batch();
const migratedUsers = await db.collection('users')
  .where('_migratedAt', '!=', null)
  .get();

migratedUsers.docs.forEach(doc => {
  batch.update(doc.ref, {
    _migratedAt: admin.firestore.FieldValue.delete(),
    _migrationNote: admin.firestore.FieldValue.delete(),
  });
});

await batch.commit();
```

---

## ⏰ When to Run

- **Before Production Deployment**: Run migration in staging first
- **Low Traffic Period**: Run during off-peak hours
- **After Backup**: Always backup before migration
- **Before New Registrations**: Complete migration before new users register

---

## ✅ Success Criteria

- [ ] All legacy users have `status: 'approved'`
- [ ] Legacy users can log in successfully
- [ ] Legacy users have full access to features
- [ ] No users are incorrectly blocked
- [ ] Migration markers are present (for tracking)

---

## 📞 Support

If you encounter issues:
1. Check the error messages in the script output
2. Verify Firebase Admin credentials
3. Check Firestore rules allow admin updates
4. Review the validation checklist in `SECURITY_FIXES_VALIDATION.md`

