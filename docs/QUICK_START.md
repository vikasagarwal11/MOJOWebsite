# 🚀 Quick Start - Run Grandfather Function

## ✅ EASIEST METHOD (Recommended)

### Option A: Use Admin Button

1. Go to: **https://momsfitnessmojo.com**
2. Log in as **admin**
3. Click: **Profile → Admin Tools → Account Approvals**
4. Click: **"Grandfather Existing Users"** button (top right)
5. Confirm → Done!

---

### Option B: Browser Console

1. Go to: **https://momsfitnessmojo.com**
2. Log in as **admin**
3. Press **F12** → **Console** tab
4. Paste this code and press Enter:

```javascript
(async () => {
  const { getFunctions, httpsCallable } = await import('firebase/functions');
  const { getApp } = await import('firebase/app');
  const functions = getFunctions(getApp(), 'us-east1');
  const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');
  const result = await grandfatherUsers({});
  alert(`✅ Updated ${result.data.updatedCount} users!`);
})().catch(e => alert('Error: ' + e.message));
```

---

## ✅ That's It!

Choose whichever method you prefer. The admin button is easier!

