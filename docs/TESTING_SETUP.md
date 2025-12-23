# 🔐 MOJO Website Registration Testing Setup

## 🚀 Quick Start for Testing

### 1. Firebase Console Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your MOJO project
3. Navigate to **Authentication → Sign-in method**
4. Enable **Phone** authentication
5. Go to **Authentication → Settings → Authorized domains**
6. Add these domains:
   - `localhost` (for development)
   - Your production domain (if any)

### 2. Test Phone Numbers Setup

1. In Firebase Console → **Authentication → Settings**
2. Scroll down to **Phone numbers for testing**
3. Add your test numbers in format: `+1XXXXXXXXXX`
4. Firebase will send verification codes to these numbers during testing

### 3. Environment Variables

Ensure your `.env.local` file has these variables:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
VITE_USE_EMULATORS=false
```

### 4. Testing Flow

1. **Start the dev server**: `npm run dev`
2. **Navigate to**: `http://localhost:5173/register`
3. **Test with your authorized phone numbers**
4. **Check Firebase Console** for verification codes

## 🔧 Common Issues & Solutions

### Issue: "reCAPTCHA failed"
**Solution**: Add `localhost` to Firebase authorized domains

### Issue: "Phone sign-in is disabled"
**Solution**: Enable Phone authentication in Firebase Console

### Issue: "Invalid phone number"
**Solution**: Use the exact format: `+1XXXXXXXXXX` or `XXXXXXXXXX`

### Issue: "SMS quota exceeded"
**Solution**: Use test phone numbers or wait for quota reset

## 📱 Test Phone Number Format

- **US Numbers**: `+15551234567` or `5551234567`
- **International**: `+44XXXXXXXXXX`
- **Test Numbers**: Use the ones you added in Firebase Console

## 🧪 Testing Checklist

- [ ] Phone number validation works
- [ ] SMS verification code is sent
- [ ] User account is created in Firestore
- [ ] User is redirected to home page
- [ ] Profile shows correct information
- [ ] Login works with existing account

## 🚨 Emergency Testing

If you need to test without SMS:
1. Set `VITE_USE_EMULATORS=true` in `.env.local`
2. Start Firebase emulators
3. Use any phone number (emulator mode)

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Verify Firebase Console settings
3. Check network tab for failed requests
4. Ensure all environment variables are set
