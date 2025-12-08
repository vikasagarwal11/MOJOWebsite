# Manual Update Steps - Grandfather Existing Users

## What This Is For

**ONE-TIME operation** - Only for **OLD/EXISTING users** who were created before the account approval feature was added.

- ✅ **Old users** (existing): Need manual update to set `status: "approved"`
- ✅ **New users**: Automatically handled - they get `status: "pending"` when registering

---

## What Field Needs to Be Added

**Collection:** `users`

**Field to Add:**
- **Field Name:** `status`
- **Field Type:** `string`
- **Field Value:** `approved`

---

## Manual Steps (Easiest Method)

### Option 1: Firebase Console - Batch Script

1. Go to: https://console.firebase.google.com/project/momsfitnessmojo-65d00/firestore
2. Open Browser Console (F12)
3. Paste this code:

```javascript
(async () => {
  const db = firebase.firestore();
  const usersRef = db.collection('users');
  
  // Get all users
  const snapshot = await usersRef.get();
  
  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;
  const BATCH_SIZE = 500;
  
  snapshot.forEach((doc) => {
    const data = doc.data();
    
    // Only update if status is missing
    if (!data.status) {
      batch.update(doc.ref, {
        status: 'approved',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      updated++;
      batchCount++;
      
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
        console.log(`Committed batch. Updated: ${updated}`);
      }
    }
  });
  
  if (batchCount > 0) {
    await batch.commit();
  }
  
  console.log(`✅ Done! Updated ${updated} users.`);
  alert(`✅ Updated ${updated} users to approved status!`);
})();
```

4. Press Enter
5. Wait for completion

---

### Option 2: One-by-One in Firebase Console

1. Go to: https://console.firebase.google.com/project/momsfitnessmojo-65d00/firestore
2. Click `users` collection
3. For each user that doesn't have `status` field:
   - Click the document
   - Click "Add field"
   - Name: `status`
   - Type: `string`
   - Value: `approved`
   - Save

**Note:** This is tedious if you have many users - use Option 1 instead.

---

### Option 3: Query and Update via Firebase Console

1. Go to Firestore Console
2. Click on `users` collection
3. Use the query to find users without status (you might need to check manually)
4. Update them using Option 2

---

## How to Verify It Worked

1. Go to any user document in Firestore
2. Check that it has the `status` field
3. Value should be `"approved"`

---

## Summary

- **Collection:** `users`
- **Field:** `status` (string)
- **Value:** `approved`
- **Who:** All existing users without this field
- **When:** One-time, now

After this, new registrations will automatically require approval!

