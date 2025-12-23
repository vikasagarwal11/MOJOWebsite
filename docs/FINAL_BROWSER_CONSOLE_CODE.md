# 🎯 FINAL Browser Console Code - Copy & Paste Ready

## ✅ EASIEST: Use Admin Button Instead!

I've added a button in your Admin Console:
- **Profile → Admin Tools → Account Approvals tab**
- Look for **"Grandfather Existing Users"** button
- Just click it!

---

## 📋 Browser Console Method (Alternative)

### Exact Steps:

1. **Open:** https://momsfitnessmojo.com
2. **Log in** as admin user
3. **Press F12** (open Developer Console)
4. **Click Console tab**
5. **Copy & paste this code:**

```javascript
(async () => {
  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { getApp } = await import('firebase/app');
    const app = getApp();
    const functions = getFunctions(app, 'us-east1');
    const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');
    console.log('Calling function...');
    const result = await grandfatherUsers({});
    alert(`✅ Updated ${result.data.updatedCount} users!`);
    console.log('Result:', result.data);
    return result.data;
  } catch (error) {
    console.error('Error:', error);
    alert('Error: ' + error.message);
    throw error;
  }
})();
```

6. **Press Enter**
7. **Wait for result**

---

## ❌ Troubleshooting

**Error: "Function not found"**
- Function isn't deployed
- Check Firebase Console to verify

**Error: "Permission denied"**
- Not logged in as admin
- Check your user role

---

## ✅ Best Option: Admin Button

Just use the button in Admin Console - much easier!

