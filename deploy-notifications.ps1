# PowerShell script to deploy RSVP Notification System to Firebase

Write-Host "🚀 Deploying RSVP Notification System to Firebase..." -ForegroundColor Green

Write-Host "📋 Step 1: Building Cloud Functions..." -ForegroundColor Yellow
Set-Location functions
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build Cloud Functions" -ForegroundColor Red
    exit 1
}
Set-Location ..

Write-Host "📋 Step 2: Deploying Cloud Functions..." -ForegroundColor Yellow
firebase deploy --only functions
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to deploy Cloud Functions" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Step 3: Deploying Firestore Security Rules..." -ForegroundColor Yellow
firebase deploy --only firestore:rules
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to deploy Firestore rules" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Step 4: Deploying Storage Security Rules..." -ForegroundColor Yellow
firebase deploy --only storage
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to deploy Storage rules" -ForegroundColor Red
    exit 1
}

Write-Host "✅ RSVP Notification System deployed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 What was deployed:" -ForegroundColor Cyan
Write-Host "   • Cloud Function: onRsvpNotification" -ForegroundColor White
Write-Host "   • Firestore Rules: notifications collection access" -ForegroundColor White
Write-Host "   • Storage Rules: existing rules maintained" -ForegroundColor White
Write-Host ""
Write-Host "🧪 To test the system:" -ForegroundColor Cyan
Write-Host "   1. Create an event as an admin" -ForegroundColor White
Write-Host "   2. RSVP as a different user with 'Going' status" -ForegroundColor White
Write-Host "   3. Check the admin's profile for notifications" -ForegroundColor White
Write-Host ""
Write-Host "📱 The notification system is now live and will:" -ForegroundColor Cyan
Write-Host "   • Automatically create notifications when users RSVP 'Going'" -ForegroundColor White
Write-Host "   • Display notifications in user profiles" -ForegroundColor White
Write-Host "   • Allow marking notifications as read" -ForegroundColor White
Write-Host "   • Provide links to view events" -ForegroundColor White
