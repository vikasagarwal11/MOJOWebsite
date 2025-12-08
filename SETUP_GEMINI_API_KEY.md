# Setting Up GEMINI_API_KEY for Firebase Functions

## The Problem

Your `.env.production` file in the root directory is for **Vite frontend**, not for Firebase Functions. Firebase Functions need their environment variables set separately.

## Solution: Use Firebase Secrets (Recommended for Production)

Firebase Secrets is the secure way to store API keys for Cloud Functions.

### Step 1: Set the Secret

```powershell
# Set GEMINI_API_KEY as a secret
firebase functions:secrets:set GEMINI_API_KEY --project momsfitnessmojo-65d00
```

When prompted, paste your API key:
```
AIzaSyDsydbpD75AYyOePeNCJvXRKembSvUD4ho
```

### Step 2: Update Function to Use Secret

We need to update the function to access the secret. For Firebase Functions v2, secrets need to be explicitly declared.

### Step 3: Redeploy

```powershell
firebase deploy --only functions:chatAsk --project momsfitnessmojo-65d00
```

---

## Alternative: Use .env File in Functions Directory (For Development)

If you prefer using a `.env` file for local development:

1. Create `.env` file in `functions/` directory:
```bash
cd functions
echo GEMINI_API_KEY=AIzaSyDsydbpD75AYyOePeNCJvXRKembSvUD4ho > .env
```

2. Add `.env` to `.gitignore` (if not already):
```bash
echo .env >> functions/.gitignore
```

**Note:** `.env` files in the functions directory are only used for local development. For production deployment, you still need to use Firebase Secrets.

---

## Quick Fix: Set Secret Now

Run this command:

```powershell
firebase functions:secrets:set GEMINI_API_KEY --project momsfitnessmojo-65d00
```

Then paste: `AIzaSyDsydbpD75AYyOePeNCJvXRKembSvUD4ho`

Then redeploy:
```powershell
firebase deploy --only functions:chatAsk --project momsfitnessmojo-65d00
```

---

## Verify It's Set

After setting the secret, verify:

```powershell
firebase functions:secrets:access GEMINI_API_KEY --project momsfitnessmojo-65d00
```

---

## Important Notes

1. **Secrets vs Environment Variables:**
   - Secrets are encrypted and secure (recommended for API keys)
   - Environment variables are plain text (not recommended for sensitive data)

2. **Function Code:**
   - The function already reads from `process.env.GEMINI_API_KEY`
   - Once the secret is set, it will automatically be available as an environment variable

3. **Multiple Environments:**
   - You can set different secrets for different projects
   - Development: `--project momfitnessmojo`
   - Production: `--project momsfitnessmojo-65d00`

