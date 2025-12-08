# ✅ Ready to Execute - Choose Your Method

## 🎯 You Have TWO Options

---

## Option 1: Admin Button (EASIEST) ⭐ RECOMMENDED

### Steps:
1. **Deploy frontend** (if you have changes) OR **test locally**
2. Go to: **https://momsfitnessmojo.com**
3. **Log in as admin**
4. Navigate to: **Profile → Admin Tools → Account Approvals** tab
5. Click the **"Grandfather Existing Users"** button (top right)
6. Confirm → Done!

**Button is already added to your code!**

---

## Option 2: Browser Console

### Steps:
1. Go to: **https://momsfitnessmojo.com**
2. **Log in as admin**
3. Press **F12** → Click **Console** tab
4. Copy & paste this code:

```javascript
(async () => {
  try {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { getApp } = await import('firebase/app');
    const functions = getFunctions(getApp(), 'us-east1');
    const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');
    console.log('🔄 Running...');
    const result = await grandfatherUsers({});
    alert(`✅ Updated ${result.data.updatedCount} users!`);
    console.log('✅ Result:', result.data);
  } catch (error) {
    alert('Error: ' + error.message);
    console.error('Error:', error);
  }
})();
```

5. Press **Enter**

---

## ⚠️ Important

- **Must be logged in as admin**
- Function is in `us-east1` region
- Will set all users without `status` to `approved`

---

## ✅ Recommendation

**Use Option 1 (Admin Button)** - Much easier and already built in!

---

## 🚀 Ready!

Choose your method and go!

