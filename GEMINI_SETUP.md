# 🚀 Gemini AI Integration - Setup Guide

## Quick Setup (5 minutes)

### Step 1: Get Gemini API Key (FREE)
1. Go to: https://makersuite.google.com/app/apikey
2. Sign in with Google account
3. Click "Create API Key"
4. Copy the API key

### Step 2: Add to Firebase Functions Environment

For **Development**:
```bash
cd functions
firebase functions:config:set gemini.api_key="YOUR_API_KEY_HERE" --project=momfitnessmojo
```

For **Production**:
```bash
firebase functions:config:set gemini.api_key="YOUR_API_KEY_HERE" --project=momsfitnessmojo-65d00
```

**OR** use `.env` file in functions directory:
```
GEMINI_API_KEY=your_api_key_here
```

### Step 3: Install Dependencies
```bash
cd functions
npm install
```

### Step 4: Deploy Functions
```bash
npm run build
firebase deploy --only functions:generateTestimonialSuggestions
```

Or use your deployment script:
```powershell
.\deploy-prod.ps1
# Select option for functions deployment
```

---

## ✅ Verification

1. Go to testimonial submission page
2. Click "✨ Help me write" button
3. Should see AI suggestions appear in 2-3 seconds

---

## 💰 Cost

- **FREE Tier**: 15 requests/minute, ~1,500/day
- **Your Usage**: Likely 50-200/month = **$0 permanently**
- **If exceeded**: $0.000025 per testimonial (40,000 for $1)

---

## 🔒 Security

- API key stored in Firebase Functions environment (never exposed to client)
- Rate limiting handled by Firebase Functions
- Input sanitization in Cloud Function
- User can only request for themselves

---

## 🐛 Troubleshooting

**Error: "AI service not configured"**
- Check API key is set: `firebase functions:config:get`
- Redeploy functions after setting key

**Error: "Failed to generate suggestions"**
- Check Gemini API quota/dashboard
- Verify API key is valid
- Check Cloud Functions logs: `firebase functions:log`

**Slow responses**
- Normal: 2-5 seconds for AI generation
- First request may be slower (cold start)

---

## 🎨 UI Features

- **"Help me write" button**: Purple gradient, sparkles icon
- **Loading state**: Spinner with "Generating..." text
- **Suggestions display**: 2-3 cards with numbered options
- **Click to use**: Click any card to apply suggestion
- **Editable**: User can edit suggestion before submitting

---

## 📊 Analytics (Future Enhancement)

Track:
- Usage count per user
- Most used suggestions
- Success rate (suggestions used vs. rejected)
- Cost per month

