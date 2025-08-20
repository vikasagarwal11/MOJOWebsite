#!/bin/bash

echo "🚀 Deploying RSVP Notification System to Firebase..."

echo "📋 Step 1: Building Cloud Functions..."
cd functions
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Failed to build Cloud Functions"
    exit 1
fi
cd ..

echo "📋 Step 2: Deploying Cloud Functions..."
firebase deploy --only functions
if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy Cloud Functions"
    exit 1
fi

echo "📋 Step 3: Deploying Firestore Security Rules..."
firebase deploy --only firestore:rules
if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy Firestore rules"
    exit 1
fi

echo "📋 Step 4: Deploying Storage Security Rules..."
firebase deploy --only storage
if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy Storage rules"
    exit 1
fi

echo "✅ RSVP Notification System deployed successfully!"
echo ""
echo "🎯 What was deployed:"
echo "   • Cloud Function: onRsvpNotification"
echo "   • Firestore Rules: notifications collection access"
echo "   • Storage Rules: existing rules maintained"
echo ""
echo "🧪 To test the system:"
echo "   1. Create an event as an admin"
echo "   2. RSVP as a different user with 'Going' status"
echo "   3. Check the admin's profile for notifications"
echo ""
echo "📱 The notification system is now live and will:"
echo "   • Automatically create notifications when users RSVP 'Going'"
echo "   • Display notifications in user profiles"
echo "   • Allow marking notifications as read"
echo "   • Provide links to view events"
