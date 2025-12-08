# Manual Grandfather Users - Step by Step

## What This Does

**ONE-TIME operation** to set all existing users (old users created before account approval feature) to `status: 'approved'`.

**New users** automatically go through approval - no manual work needed for them.

---

## Manual Steps (Using Firebase Console)

### Option 1: Quick Batch Update via Firebase Console (Easiest)

1. Go to: https://console.firebase.google.com/project/momsfitnessmojo-65d00/firestore
2. Click on `users` collection
3. You'll see all users - look for ones that don't have a `status` field

**For each user without `status`:**
- Click on the user document
- Click "Add field"
- Field name: `status`
- Field type: `string`
- Value: `approved`
- Save

**OR use a script (better for many users):**

---

## Option 2: Use Firebase Console Script (Recommended)

1. Go to: https://console.firebase.google.com/project/momsfitnessmojo-65d00/firestore
2. Open Browser Console (F12)
3. Paste this script:

```javascript
// This will update all users without status field
(async () => {
  const { getFirestore, collection, getDocs, doc, updateDoc, query, where } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js');
  
  // Initialize (Firebase Console already has this)
  const db = firebase.firestore();
  
  // Get all users
  const usersSnapshot = await db.collection('users').get();
  
  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;
  
  usersSnapshot.forEach((userDoc) => {
    const userData = userDoc.data();
    
    // Only update if status is missing
    if (!userData.status || userData.status === null || userData.status === undefined) {
      batch.update(userDoc.ref, {
        status: 'approved',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      updated++;
      batchCount++;
      
      // Commit every 500 (Firestore limit)
      if (batchCount >= 500) {
        batch.commit();
        batch = db.batch();
        batchCount = 0;
        console.log(`Committed batch. Total updated so far: ${updated}`);
      }
    }
  });
  
  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
  }
  
  console.log(`✅ Done! Updated ${updated} users to approved status.`);
  alert(`✅ Updated ${updated} users!`);
})();
```

---

## Option 3: SQL-like Query in Firebase Console

Actually, Firebase Console doesn't support bulk updates easily. Use Option 2 script instead.

---

## What Field Needs to Be Updated

**Field:** `status`
**Type:** `string`
**Value:** `approved`

**Where:** In the `users` collection, for each user document that doesn't have this field.

---

## How to Verify

After updating:
1. Go to any user document in Firestore
2. Check that it has: `status: "approved"`
3. Users without this field should now have it

---

## Important Notes

- **Only do this once** - for existing users
- **New users** will automatically have `status: 'pending'` when they register
- After this, the approval workflow will work for new users only

