# App Check reCAPTCHA Key Setup Guide

## What is the "reCAPTCHA secret key"?

The **reCAPTCHA secret key** is a private key from Google reCAPTCHA v3 that Firebase App Check uses to verify your app.

**Important**: This is different from:
- ❌ reCAPTCHA for Firebase Auth (phone sign-in) - you already have this
- ❌ VAPID key for push notifications - different purpose
- ✅ reCAPTCHA v3 for App Check - this is what you need

---

## How to Get the reCAPTCHA Secret Key

### Step 1: Go to Google reCAPTCHA Admin Console

Visit: https://www.google.com/recaptcha/admin

### Step 2: Create a New reCAPTCHA v3 Site

1. Click **"+ Create"** button
2. Fill in the form:
   - **Label**: "Moms Fitness Mojo App Check" (or any name)
   - **reCAPTCHA type**: Select **"reCAPTCHA v3"**
   - **Domains**: Add these domains:
     ```
     momsfitnessmojo.com
     www.momsfitnessmojo.com
     momsfitnessmojo-65d00.web.app
     momsfitnessmojo-65d00.firebaseapp.com
     ```
3. Accept the reCAPTCHA Terms of Service
4. Click **"Submit"**

### Step 3: Copy the Keys

After creating, you'll see:
- **Site Key** (public) - Starts with `6L...` (you'll need this for frontend)
- **Secret Key** (private) - Starts with `6L...` (this goes in Firebase App Check)

**Copy the Secret Key** - this is what you paste into the Firebase App Check form.

---

## Where to Use Each Key

### Secret Key → Firebase App Check
- Paste into the "reCAPTCHA secret key" field in Firebase Console
- This is what you're seeing in the registration form

### Site Key → Frontend Code (Later)
- After App Check is configured, you'll need to add this to your frontend
- Used to generate App Check tokens
- We'll add this when you're ready to enable App Check

---

## Current Recommendation

**You have two options:**

### Option 1: Skip App Check for Now ✅ (Easier)

**Why**: Your function is already secure without App Check:
- ✅ Authentication required
- ✅ Admin-only access
- ✅ Input validation
- ✅ Preference checks

**Action**: 
- Leave App Check unregistered
- Deploy functions now (already set to `enforceAppCheck: false`)
- Configure App Check later when convenient

### Option 2: Configure App Check Now

**If you want to set it up now:**

1. **Get reCAPTCHA keys** (steps above)
2. **Paste secret key** into Firebase App Check form
3. **Click "Save"** in Firebase Console
4. **Update code** to set `enforceAppCheck: true`
5. **Deploy functions**

---

## Quick Answer

**Yes, that's the field you need to fill**, but:

- **If deploying now**: You can skip it (App Check is optional)
- **If configuring App Check**: Get the secret key from Google reCAPTCHA Console and paste it there

**My recommendation**: Deploy now, configure App Check later. The function is already secure.

---

## After You Get the Secret Key

1. **Paste it** into the "reCAPTCHA secret key" field in Firebase Console
2. **Click "Save"** at the bottom of the form
3. **Update code** to enable App Check:
   ```typescript
   enforceAppCheck: true, // Change from false
   ```
4. **Deploy functions**

But again, this is **optional** - you can deploy now and do this later!
