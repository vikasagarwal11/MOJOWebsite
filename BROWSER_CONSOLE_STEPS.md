# 🎯 Exact Steps to Run Grandfather Function in Browser Console

## ✅ Function Status

The function `grandfatherExistingUsers` **should exist** in Firebase Functions (us-east1 region). It may not show in the console list if it wasn't deployed yet, but it's in the code.

**Note:** Firestore-triggered functions (like `onAccountApprovalCreated`) don't show in the functions list - they're event triggers that activate automatically.

---

## 📋 Step-by-Step Instructions

### Method 1: Using Your App's Firebase Instance (RECOMMENDED)

Since your app already has Firebase initialized, this is the easiest method:

**Step 1:** Open your production website
- Go to: **https://momsfitnessmojo.com**
- **IMPORTANT:** Make sure you're logged in as an **admin user**

**Step 2:** Open Developer Console
- Press **F12** (or right-click → Inspect)
- Click the **Console** tab

**Step 3:** Run this code (copy and paste entire block):

```javascript
// Wait for React to load, then access Firebase from the app
(async () => {
  try {
    // Import Firebase functions module (it's already loaded in your app)
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    
    // Get the Firebase app instance (it should be available globally)
    // First, try to import from your app's config
    const firebaseConfig = await import('https://momsfitnessmojo.com/src/config/firebase.ts').catch(() => null);
    
    // Alternative: Access via window if available
    if (!firebaseConfig && window.firebase) {
      const functions = window.firebase.functions();
      const grandfatherUsers = functions.httpsCallable('grandfatherExistingUsers');
      
      console.log('🔄 Calling grandfatherExistingUsers...');
      const result = await grandfatherUsers();
      console.log('✅ Success!', result.data);
      alert(`✅ Updated ${result.data.updatedCount} users!`);
      return result.data;
    }
    
    // If that doesn't work, we'll need to manually initialize
    throw new Error('Firebase not accessible. Use Method 2 below.');
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('💡 Try Method 2 or Method 3 below');
    alert('Error: ' + error.message);
  }
})();
```

**If Method 1 doesn't work, use Method 2:**

---

### Method 2: Manual Firebase Initialization in Console

**Step 1-2:** Same as above (open site, open console)

**Step 3:** Run this code:

```javascript
// Initialize Firebase manually using your production config
(async () => {
  try {
    // Import Firebase modules from CDN
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
    const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js');
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js');
    
    // Your production Firebase config
    const firebaseConfig = {
      apiKey: "AIzaSyB-hFBi7q39EfAuBqTw5H8tYZ1Z_JNPRm8",
      authDomain: "momsfitnessmojo-65d00.firebaseapp.com",
      projectId: "momsfitnessmojo-65d00",
      storageBucket: "momsfitnessmojo-65d00.firebasestorage.app",
      messagingSenderId: "313384637691",
      appId: "1:313384637691:web:79b852490e709a58634c5e"
    };
    
    // Initialize app
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    
    // Check if user is logged in
    if (!auth.currentUser) {
      alert('❌ Please log in first!');
      return;
    }
    
    // Get functions instance (us-east1 region)
    const functions = getFunctions(app, 'us-east1');
    
    // Create callable function reference
    const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');
    
    console.log('🔄 Calling grandfatherExistingUsers...');
    console.log('User:', auth.currentUser.email || auth.currentUser.uid);
    
    // Call the function
    const result = await grandfatherUsers({});
    
    console.log('✅ Success!', result.data);
    alert(`✅ Successfully updated ${result.data.updatedCount} users to approved status!`);
    
    return result.data;
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error.details
    });
    alert('❌ Error: ' + (error.message || 'Failed to grandfather users'));
    throw error;
  }
})();
```

---

### Method 3: Create Temporary Admin Button (EASIEST)

I can add a temporary button to your admin page that calls the function. Would you like me to do that? It's the simplest approach.

---

### Method 4: Use Firebase Console

1. Go to: https://console.firebase.google.com/project/momsfitnessmojo-65d00/functions
2. Search for `grandfatherExistingUsers`
3. If it exists, click on it → "Testing" tab → "Test the function"

---

## ❌ If Function Doesn't Exist

If the function doesn't exist, we need to deploy it. I can:
1. Redeploy the functions
2. Or create a simpler alternative (Cloud Function or admin script)

Let me know which method you prefer!

