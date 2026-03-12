#!/bin/bash

echo "🚀 Deploying OTP Functions..."
echo ""

# Check if functions/.env exists
if [ ! -f "functions/.env" ]; then
    echo "❌ Error: functions/.env not found!"
    echo "Please create functions/.env with Twilio credentials"
    exit 1
fi

# Check if Twilio credentials are set
if ! grep -q "TWILIO_VERIFY_SERVICE_SID=VA" functions/.env; then
    echo "⚠️  Warning: TWILIO_VERIFY_SERVICE_SID not configured!"
    echo "You need to create a Twilio Verify Service first"
    echo "See TWILIO_SETUP_GUIDE.md for instructions"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build functions
echo "📦 Building functions..."
cd functions
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi
cd ..

# Deploy functions
echo ""
echo "🚀 Deploying to Firebase..."
firebase deploy --only functions:sendGuestOTP,functions:verifyGuestOTP

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "Next steps:"
    echo "1. Refresh your browser (Ctrl+Shift+R)"
    echo "2. Submit guest RSVP"
    echo "3. OTP modal should appear"
    echo "4. Check your phone for the code"
else
    echo ""
    echo "❌ Deployment failed!"
    echo "Check the error messages above"
fi
