# MOJO Website - Production Installation Guide

This guide provides step-by-step instructions for setting up and deploying the MOJO Website to production environment.

## 📋 Prerequisites

- Node.js 18+ installed
- Firebase CLI installed (`npm install -g firebase-tools`)
- Access to Firebase Console
- PowerShell (Windows) or Bash (Linux/macOS)

## 🏗️ Current Environment Configuration

### Firebase Projects
- **Development**: `momfitnessmojo` (dev)
- **Staging**: `momsfitnessmojostage` (staging)
- **Production**: `momsfitnessmojo-65d00` (prod)

### URLs
- **Staging**: https://momsfitnessmojostage.web.app
- **Production**: https://momsfitnessmojo-65d00.web.app

## 🔧 Phase 1: Complete Environment Setup

### Step 1: Get Production Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `momsfitnessmojo-65d00`
3. Go to **Project Settings** → **General** → **Your apps**
4. Copy the Firebase configuration values

### Step 2: Create Complete `.env.production` File

Create/update `.env.production` with the following complete configuration:

```bash
# Firebase Configuration (Get these from Firebase Console)
VITE_FIREBASE_API_KEY=your_production_api_key_from_firebase_console
VITE_FIREBASE_AUTH_DOMAIN=momsfitnessmojo-65d00.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://momsfitnessmojo-65d00-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=momsfitnessmojo-65d00
VITE_FIREBASE_STORAGE_BUCKET=momsfitnessmojo-65d00.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_production_sender_id
VITE_FIREBASE_APP_ID=your_production_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_production_measurement_id
VITE_FIREBASE_DATABASE_ID=(default)

# Environment Settings
VITE_ENVIRONMENT=production
NODE_ENV=production
VITE_USE_EMULATORS=false

# App Configuration
VITE_APP_NAME=Moms Fitness Mojo
VITE_DEBUG_MODE=false
VITE_CONTACT_EMAIL=momsfitnessmojo@gmail.com

# Storage Configuration
STORAGE_BUCKET=momsfitnessmojo-65d00.firebasestorage.app

# ReCAPTCHA Configuration
VITE_RECAPTCHA_SITE_KEY=6Lf0ItgrAAAAAGBUlxL1f-yy8YA5mTKXMfMf_yZO
VITE_RECAPTCHA_API_KEY=AIzaSyBxvgQB5jrP5qE7uaFC2ihcieRsPXa6uEE
VITE_RECAPTCHA_VERSION=v2

# Functions Configuration
VITE_FIREBASE_FUNCTIONS_REGION=us-central1
```

### Step 3: Verify Extension Configuration

Check `extensions/storage-resize-images.prod.env`:
```bash
IMG_BUCKET=momsfitnessmojo-65d00.firebasestorage.app
```

## 🚀 Phase 2: Pre-Deployment Setup

### Step 4: Firebase CLI Authentication

```powershell
# Login to Firebase
firebase login

# Verify projects
firebase projects:list

# Set production project as active
firebase use prod
```

### Step 5: Verify Project Configuration

```powershell
# Check current project
firebase use

# Should show: momsfitnessmojo-65d00 (prod)
```

## 📦 Phase 3: Deployment Options

### Option A: Full Production Deployment (Recommended for First Time)

```powershell
.\deploy-prod.ps1 all
```

**What this deploys:**
- Frontend (hosting)
- Firestore rules and indexes
- Cloud Functions
- Extensions (storage-resize-images)

### Option B: Deploy Without Extensions (Faster for Updates)

```powershell
.\deploy-prod.ps1 no-extensions
```

**What this deploys:**
- Frontend (hosting)
- Firestore rules and indexes
- Cloud Functions
- **Skips**: Extensions (avoids conflicts)

### Option C: Deploy Individual Components

```powershell
# Frontend only
.\deploy-prod.ps1 hosting

# Database rules only
.\deploy-prod.ps1 firestore

# Cloud Functions only
.\deploy-prod.ps1 functions

# Extensions only
.\deploy-prod.ps1 extensions
```

## 🔍 Phase 4: Post-Deployment Verification

### Step 6: Verify Deployment

1. **Check Website**: Visit https://momsfitnessmojo-65d00.web.app
2. **Test Features**: Verify all functionality works
3. **Check Firebase Console**: Look for any errors in:
   - Authentication
   - Firestore
   - Storage
   - Functions
   - Extensions

### Step 7: Verify Extensions

1. Go to Firebase Console → **Extensions**
2. Ensure `storage-resize-images` is **Active**
3. Check extension logs for any issues
4. Test image upload functionality

## 📁 Files Used in Deployment Process

### Deployment Scripts
- `deploy-prod.ps1` - Main production deployment script
- `deploy-staging.ps1` - Staging deployment script
- `deploy-dev.ps1` - Development deployment script

### Firebase Configuration Files
- `firebase.prod.json` - Production Firebase configuration
- `firebase.staging.json` - Staging Firebase configuration
- `firebase.dev.json` - Development Firebase configuration
- `.firebaserc` - Firebase project aliases

### Environment Files
- `.env.production` - Production environment variables
- `.env.staging` - Staging environment variables
- `.env.development` - Development environment variables

### Extension Configuration Files
- `extensions/storage-resize-images.prod.env` - Production extension config
- `extensions/storage-resize-images.staging.env` - Staging extension config
- `extensions/storage-resize-images.env` - Active extension config (copied during deployment)

### Database & Security Files
- `firestore.rules` - Firestore security rules
- `firestore.indexes.json` - Firestore database indexes
- `storage.rules` - Firebase Storage security rules

### Build Configuration
- `package.json` - Contains build scripts (`build:prod`, `build:staging`)
- `vite.config.ts` - Vite build configuration

## 🔄 Key Values Changed from Staging to Production

| Configuration | Staging | Production |
|---------------|---------|------------|
| Project ID | `momsfitnessmojostage` | `momsfitnessmojo-65d00` |
| Storage Bucket | `momsfitnessmojostage.firebasestorage.app` | `momsfitnessmojo-65d00.firebasestorage.app` |
| Auth Domain | `momsfitnessmojostage.firebaseapp.com` | `momsfitnessmojo-65d00.firebaseapp.com` |
| Database URL | `momsfitnessmojostage-default-rtdb.firebaseio.com` | `momsfitnessmojo-65d00-default-rtdb.firebaseio.com` |
| Environment | `staging` | `production` |
| Debug Mode | `true` | `false` |
| App Name | `MOJO Website (Staging)` | `Moms Fitness Mojo` |
| Functions Region | `us-central1` | `us-central1` |

## ⚠️ Critical Notes

### Important Warnings
1. **Firebase Configuration**: You MUST get actual values from Firebase Console for `momsfitnessmojo-65d00` project
2. **Functions Region**: Ensure consistency between `.env.production` and `firebase.prod.json` (both should be `us-central1`)
3. **ReCAPTCHA Keys**: Currently shared between staging and production (may be intentional)
4. **Storage Bucket Format**: Use `momsfitnessmojo-65d00.firebasestorage.app` (not `.appspot.com`)

### Environment File Requirements
- `.env.production` file must exist before deployment
- All Firebase configuration values must be valid
- Storage bucket must match the actual Firebase project

## 🚨 Troubleshooting

### Common Issues

1. **Missing `.env.production` file**
   - **Error**: "Environment file not found"
   - **Solution**: Create complete `.env.production` file as shown above

2. **Invalid Firebase Configuration**
   - **Error**: "Firebase configuration invalid"
   - **Solution**: Get actual values from Firebase Console

3. **Storage Bucket Mismatch**
   - **Error**: CORS errors, upload failures
   - **Solution**: Ensure `STORAGE_BUCKET` matches actual bucket name

4. **Functions Region Mismatch**
   - **Error**: Function deployment failures
   - **Solution**: Ensure `VITE_FIREBASE_FUNCTIONS_REGION=us-central1`

### Debug Commands

```powershell
# Check Firebase project status
firebase projects:list
firebase use

# Test deployment without deploying
firebase deploy --dry-run --project=momsfitnessmojo-65d00

# Check extension status
firebase ext:list --project=momsfitnessmojo-65d00
```

## 📊 Monitoring

### Post-Deployment Monitoring
1. **Firebase Console**: Monitor usage, errors, and performance
2. **Website**: Test all functionality
3. **Extensions**: Verify image processing works
4. **Functions**: Check Cloud Functions logs

### Database Considerations
- **Current Setup**: Uses existing `momsfitnessmojo-65d00` Firestore database
- **Data Migration**: If needed, export from staging and import to production
- **Backup**: Regular backups recommended

## 🎯 Quick Start Checklist

- [ ] Get Firebase configuration from Console
- [ ] Create complete `.env.production` file
- [ ] Verify extension configuration
- [ ] Authenticate Firebase CLI
- [ ] Set production project active
- [ ] Run deployment: `.\deploy-prod.ps1 all`
- [ ] Verify website functionality
- [ ] Check Firebase Console for errors
- [ ] Test image uploads
- [ ] Monitor performance

## 📞 Support

For issues or questions:
1. Check Firebase Console for error logs
2. Verify all configuration values
3. Test with `--dry-run` flag first
4. Check this guide for troubleshooting steps

---

**Last Updated**: January 2025  
**Version**: 1.0  
**Compatible with**: Current MOJO Website setup
