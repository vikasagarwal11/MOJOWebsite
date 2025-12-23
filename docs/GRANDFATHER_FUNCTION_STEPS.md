# 🎯 Exact Steps to Run Grandfather Function

## Step-by-Step Instructions

### Step 1: Open Your Production Website
1. Open your browser
2. Go to: **https://momsfitnessmojo.com** (or your production URL)
3. **IMPORTANT:** Make sure you're logged in as an **admin user**

### Step 2: Open Developer Console
1. Press **F12** (or right-click → Inspect)
2. Click on the **Console** tab

### Step 3: Run the Code

**Copy and paste this ENTIRE code block into the console, then press Enter:**

```javascript
// Import Firebase functions
const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js');

// Get your Firebase app instance (it's already initialized)
// We need to access the app from window or import it
const app = window.firebase?.app?.() || (await import('/src/config/firebase.ts')).default;

// Get functions instance
const functions = getFunctions(app, 'us-east1');

// Create callable function reference
const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');

// Call the function
grandfatherUsers()
  .then(result => {
    console.log('✅ Success!', result.data);
    alert(`✅ Successfully updated ${result.data.updatedCount} users to approved status!`);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    alert('❌ Error: ' + (error.message || 'Failed to grandfather users'));
  });
```

**BUT WAIT** - The above might not work because of module imports. Let's use a simpler approach:

---

## ✅ SIMPLER METHOD (Recommended)

Since your app already has Firebase initialized, use this simpler code:

```javascript
// This uses the Firebase functions that are already loaded in your app
(async () => {
  try {
    // Import from your app's Firebase config
    const firebaseModule = await import('/src/config/firebase.ts');
    const { functions } = firebaseModule;
    
    // Or try to access via window
    if (!functions) {
      throw new Error('Functions not found. Try method below.');
    }
    
    const { httpsCallable } = await import('firebase/functions');
    const grandfatherUsers = httpsCallable(functions, 'grandfatherExistingUsers');
    
    console.log('🔄 Calling grandfatherExistingUsers...');
    const result = await grandfatherUsers();
    
    console.log('✅ Success!', result.data);
    alert(`✅ Updated ${result.data.updatedCount} users!`);
    return result.data;
  } catch (error) {
    console.error('❌ Error:', error);
    alert('❌ Error: ' + error.message);
    throw error;
  }
})();
```

**BUT** - This still might not work because modules aren't directly importable in console.

---

## 🎯 **BEST METHOD - Use Your App's Code**

Since your app already uses Firebase, the easiest way is to access it through the app itself. However, the **SIMPLEST** method is:

### Method 1: Add Temporary Button to Admin Page

I can create a temporary admin button that calls the function. Would you like me to do that?

### Method 2: Use Firebase Console Directly

1. Go to: https://console.firebase.google.com/project/momsfitnessmojo-65d00/functions
2. Find `grandfatherExistingUsers` in the list
3. Click on it
4. Go to "Testing" tab
5. Click "Test the function"
6. It will run and show results

### Method 3: Use curl/Postman

If the function exists, you can call it via HTTP endpoint (but this requires auth token).

---

## 🔍 First: Verify Function Exists

Let me check if the function was actually deployed...

