# 🎯 SIMPLEST Browser Console Code

## ⚠️ IMPORTANT: Function May Not Be Deployed

The `grandfatherExistingUsers` function is **NOT showing** in Firebase Console functions list. This means it might not be deployed yet.

---

## ✅ EASIEST SOLUTION: Use Admin Button

I've added a button in your Admin Console:
- Go to: **Profile → Admin Tools → Account Approvals**
- Click: **"Grandfather Existing Users"** button
- Done!

**This is much easier than browser console!**

---

## 📋 Browser Console Steps (If You Still Want to Try)

### Step 1: Open Website
1. Open browser
2. Go to: **https://momsfitnessmojo.com**
3. **Log in as admin**

### Step 2: Open Console
1. Press **F12**
2. Click **Console** tab

### Step 3: Paste This Code

**Copy and paste this entire code block:**

```javascript
(async () => {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const { getApp } = await import('firebase/app');
  const app = getApp();
  const functions = getFunctions(app, 'us-east1');
  const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');
  const result = await grandfatherUsers({});
  alert(`✅ Updated ${result.data.updatedCount} users!`);
  return result.data;
})().catch(e => alert('Error: ' + e.message));
```

---

## ❌ If You Get "Function Not Found"

The function isn't deployed yet. Options:
1. Use the admin button I created (once frontend is deployed)
2. Or let me redeploy the functions

---

## 💡 RECOMMENDATION

**Use the Admin Button** - It's in Account Approvals admin tab!

