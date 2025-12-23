# 📦 Dependencies & Deployment Guide

## 📋 Where Dependencies Are Listed

### 1. **Main Project (`package.json` - Root)**
All frontend/client-side dependencies:
- Location: `./package.json`
- Lists React, Firebase, UI libraries, etc.
- **No AI dependencies here** (runs server-side only)

### 2. **Cloud Functions (`functions/package.json`)**
All server-side/Cloud Functions dependencies:
- Location: `./functions/package.json`
- Lists Firebase Admin, Functions, **Gemini AI**, etc.

### 3. **Documentation (`DEPENDENCIES.md`)**
Human-readable summary:
- Location: `./DEPENDENCIES.md`
- Describes what each dependency is for
- **Needs updating** to include Gemini AI

---

## 🔧 Dependency Installation

### **IMPORTANT: Manual Step Required**

The deployment scripts (`deploy-prod.ps1`, `deploy-staging.ps1`) do **NOT** automatically run `npm install`.

You must install dependencies manually **before** deploying:

### **Before First Deployment or After Adding New Dependencies:**

```bash
# 1. Install frontend dependencies (root)
npm install

# 2. Install Cloud Functions dependencies
cd functions
npm install
cd ..
```

### **After Adding Gemini AI:**
Since we added `@google/generative-ai` to `functions/package.json`, you need to:

```bash
cd functions
npm install
cd ..
```

---

## 🚀 How Deployment Scripts Work

### `deploy-prod.ps1` or `deploy-staging.ps1`:

**What they DO:**
- ✅ Copy `.env` files to `functions/.env`
- ✅ Run linting (optional with `-SkipChecks`)
- ✅ Run tests (optional with `-SkipChecks`)
- ✅ Build the frontend (`npm run build:prod` or `npm run build:staging`)
- ✅ Deploy to Firebase

**What they DON'T do:**
- ❌ Run `npm install` (assumes already installed)
- ❌ Install dependencies automatically

### **Firebase Functions Deployment:**

When you run:
```bash
firebase deploy --only functions
```

Firebase **automatically**:
1. Reads `functions/package.json`
2. Runs `npm install` in the `functions/` directory **on Firebase's servers**
3. Installs all dependencies listed in `package.json`
4. Deploys the functions

**So for Cloud Functions:**
- ✅ `npm install` happens automatically on Firebase servers
- ✅ You don't need to manually install before deploying functions
- ⚠️ **BUT** you still need to run `npm install` locally to:
  - Build TypeScript (`npm run build` in functions/)
  - Run linting/tests before deployment
  - Test functions locally

---

## 📦 Updated Dependencies List

### New Dependency Added (Gemini AI):

**Location:** `functions/package.json`

```json
"@google/generative-ai": "^0.21.0"
```

This is the **only new dependency** added for the AI testimonial feature.

---

## ✅ Complete Installation Checklist

### **Initial Setup:**
```bash
# Root directory
npm install

# Functions directory
cd functions
npm install
cd ..
```

### **After Adding New Dependencies:**

If `package.json` or `functions/package.json` changes:

```bash
# If root package.json changed:
npm install

# If functions/package.json changed:
cd functions
npm install
cd ..
```

### **Before Deployment:**

```bash
# Ensure all dependencies are installed
npm install              # Root dependencies
cd functions && npm install && cd ..  # Functions dependencies

# Then deploy
.\deploy-prod.ps1 -SkipChecks
```

---

## 🎯 Summary

### **Where Dependencies Are Listed:**
1. ✅ `package.json` (root) - Frontend dependencies
2. ✅ `functions/package.json` - Cloud Functions dependencies
3. ✅ `DEPENDENCIES.md` - Documentation (needs update)

### **Automatic vs Manual:**

| Task | Automatic? | When? |
|------|------------|-------|
| **Frontend `npm install`** | ❌ Manual | Before building locally |
| **Functions `npm install` (local)** | ❌ Manual | Before building/testing locally |
| **Functions `npm install` (Firebase)** | ✅ Automatic | During `firebase deploy --only functions` |
| **Dependency installation** | ❌ Manual | When `package.json` changes |

### **For Gemini AI Specifically:**

Since we added `@google/generative-ai` to `functions/package.json`:

1. **One-time setup:** Run `cd functions && npm install && cd ..`
2. **Firebase automatically installs it** when deploying functions
3. **No need to install again** unless you change `package.json`

---

## 🚀 Quick Reference

```bash
# Install dependencies (one-time after adding Gemini):
cd functions
npm install
cd ..

# Deploy (Firebase handles npm install automatically):
.\deploy-prod.ps1 -SkipChecks
```

