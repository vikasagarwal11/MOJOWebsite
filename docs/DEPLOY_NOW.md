# 🚀 DEPLOY NOW - Quick Reference

## ✅ Everything is Ready!

- ✅ Firebase CLI authenticated
- ✅ Production project active: `momsfitnessmojo-65d00`
- ✅ Indexes added to `firestore.indexes.json`
- ✅ All code complete

---

## 📝 Commands to Run

### 1. Deploy Firestore Rules + Functions (Run This Now)

```powershell
firebase deploy --only firestore,functions --project=momsfitnessmojo-65d00 --config=firebase.prod.json
```

**This will:**
- ✅ Deploy Firestore security rules
- ✅ Deploy Cloud Functions (including approval functions)
- ✅ Create Firestore indexes (automatically)

**Time:** ~5-10 minutes

---

### 2. Grandfather Existing Users (After Step 1)

Open browser console on production site and run:

```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';
const functions = getFunctions();
const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');

grandfatherUsers()
  .then(result => alert(`✅ Updated ${result.data.updatedCount} users!`))
  .catch(error => alert('❌ Error: ' + error.message));
```

**Time:** ~1 minute

---

### 3. Test Registration Flow

1. Go to `/register` on production
2. Register a test account
3. Check admin console for approval request
4. Approve/reject and test Q&A

**Time:** ~5-10 minutes

---

## 🎉 That's It!

Total time: ~15-20 minutes

All set up - just run the commands above!

