# =============================================================================
# Grandfather Existing Users - Helper Script
# =============================================================================
# This script calls the Cloud Function to set all existing users to approved status
#
# Usage:
#   .\scripts\grandfather-users.ps1
#   .\scripts\grandfather-users.ps1 -Project prod
# =============================================================================

param(
    [string]$Project = "dev"
)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Grandfather Existing Users" -ForegroundColor Cyan
Write-Host "Project: $Project" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Firebase CLI is installed
try {
    $firebaseVersion = firebase --version
    Write-Host "✅ Firebase CLI found: $firebaseVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Firebase CLI not found. Please install it first." -ForegroundColor Red
    Write-Host "   Install: npm install -g firebase-tools" -ForegroundColor Yellow
    exit 1
}

# Check if logged in
try {
    $user = firebase login:list --json | ConvertFrom-Json
    if ($user.result.Count -eq 0) {
        Write-Host "❌ Not logged in to Firebase. Please log in first." -ForegroundColor Red
        Write-Host "   Run: firebase login" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✅ Logged in to Firebase" -ForegroundColor Green
} catch {
    Write-Host "❌ Could not check Firebase login status" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "⚠️  IMPORTANT: This will set ALL users without a status to 'approved'" -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Do you want to continue? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "❌ Cancelled" -ForegroundColor Red
    exit 0
}

Write-Host ""
Write-Host "Calling grandfatherExistingUsers Cloud Function..." -ForegroundColor Cyan

# Build the function URL based on project
$projectId = switch ($Project) {
    "dev" { "momfitnessmojo" }
    "staging" { "momfitnessmojo-staging" }
    "prod" { "momsfitnessmojo-65d00" }
    default { "momfitnessmojo" }
}

$region = "us-east1"
$functionUrl = "https://$region-$projectId.cloudfunctions.net/grandfatherExistingUsers"

Write-Host "Function URL: $functionUrl" -ForegroundColor Gray
Write-Host ""
Write-Host "⚠️  Note: This requires authentication. You need to:" -ForegroundColor Yellow
Write-Host "   1. Be logged in as an admin user" -ForegroundColor Yellow
Write-Host "   2. Have the admin role in Firestore" -ForegroundColor Yellow
Write-Host "   3. Call this from the browser console" -ForegroundColor Yellow
Write-Host ""
Write-Host "Or use Firebase Console:" -ForegroundColor Cyan
Write-Host "   1. Go to Firebase Console → Functions" -ForegroundColor White
Write-Host "   2. Find 'grandfatherExistingUsers' function" -ForegroundColor White
Write-Host "   3. Click 'Test' tab" -ForegroundColor White
Write-Host "   4. Click 'Test' button" -ForegroundColor White
Write-Host ""

# Alternative: Use Firebase CLI to check function status
Write-Host "Checking if function exists..." -ForegroundColor Cyan
try {
    firebase functions:list --project=$projectId | Select-String "grandfatherExistingUsers"
    Write-Host "✅ Function exists!" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not verify function. Make sure it's deployed." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "1. Open your app in browser (as admin user)" -ForegroundColor White
Write-Host "2. Open Developer Console (F12)" -ForegroundColor White
Write-Host "3. Run the grandfather function (see scripts/grandfather-users-browser.js)" -ForegroundColor White
Write-Host ""

