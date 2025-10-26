# Staging Deployment Guide

## Quick Fix for Current CORS Issue

**CRITICAL**: Update your `.env.staging` file:

Change line 14 from:
```
STORAGE_BUCKET=momfitnessmojo-staging.appspot.com
```

To:
```
STORAGE_BUCKET=momfitnessmojo-staging.firebasestorage.app
```

This will fix the CORS errors you're seeing in the browser console.

## Deployment Options

### For Regular Development (No Extension Changes)
```powershell
.\deploy-staging.ps1 no-extensions
```
This deploys everything except extensions, avoiding extension conflicts.

### For Extension Configuration Changes Only
```powershell
.\deploy-staging.ps1 extensions
```
This deploys only extensions when you need to update their configuration.

### For Full Deployment (When Everything Changes)
```powershell
.\deploy-staging.ps1 all
```
This deploys everything including extensions.

### For Individual Components
```powershell
.\deploy-staging.ps1 hosting    # Frontend only
.\deploy-staging.ps1 functions  # Cloud Functions only
.\deploy-staging.ps1 firestore  # Database rules only
```

## Why This Approach Works

1. **Extensions are stable**: Once configured correctly, extensions rarely need redeployment
2. **Faster deployments**: Skipping extensions saves time during regular development
3. **Fewer conflicts**: Avoids extension deployment prompts and region issues
4. **Better control**: You choose when to deploy extensions vs. other components

## Current Extension Status

✅ **storage-resize-images**: Correctly configured for staging
- Bucket: `momfitnessmojo-staging.firebasestorage.app`
- Region: `us-central1` (functions), `us-central1` (eventarc channel)
- Status: Ready for use

## Next Steps

1. **Fix the .env.staging file** (update STORAGE_BUCKET)
2. **Test with no-extensions deployment** first
3. **Verify media uploads work** in staging
4. **Use extensions deployment only when needed**

## URLs

- **Staging**: https://momfitnessmojo-staging.web.app
- **Production**: https://momsfitnessmojo-15873.web.app (when deployed)
