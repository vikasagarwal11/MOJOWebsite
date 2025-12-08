# =============================================================================
# Account Approval Workflow - Simple Deployment Script
# =============================================================================
# Deploys Firestore rules and Cloud Functions for account approval workflow
#
# Usage:
#   .\scripts\deploy-account-approval-simple.ps1
#   .\scripts\deploy-account-approval-simple.ps1 prod
# =============================================================================

param(
    [string]$Project = "prod"
)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Account Approval Workflow Deployment" -ForegroundColor Cyan
Write-Host "Project: $Project" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Set project based on parameter
if ($Project -eq "dev") {
    $projectId = "momfitnessmojo"
    $configFile = "firebase.dev.json"
    firebase use dev
} elseif ($Project -eq "staging") {
    $projectId = "momfitnessmojo-staging"
    $configFile = "firebase.staging.json"
    firebase use staging
} else {
    $projectId = "momsfitnessmojo-65d00"
    $configFile = "firebase.prod.json"
    firebase use prod
}

Write-Host "✅ Using project: $projectId" -ForegroundColor Green
Write-Host ""

# Deploy Firestore Rules
Write-Host "Deploying Firestore rules and indexes..." -ForegroundColor Cyan
firebase deploy --only firestore --project=$projectId --config=$configFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Firestore rules deployed successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ Firestore rules deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Deploy Cloud Functions
Write-Host "Deploying Cloud Functions..." -ForegroundColor Cyan
Write-Host "  Functions to deploy:" -ForegroundColor Yellow
Write-Host "    - onAccountApprovalCreated" -ForegroundColor White
Write-Host "    - onAccountApprovalUpdated" -ForegroundColor White
Write-Host "    - onApprovalMessageCreated" -ForegroundColor White
Write-Host "    - grandfatherExistingUsers" -ForegroundColor White
Write-Host ""

firebase deploy --only functions --project=$projectId --config=$configFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Cloud Functions deployed successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ Cloud Functions deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Run grandfatherExistingUsers function (browser console)" -ForegroundColor White
Write-Host "2. Test the registration flow" -ForegroundColor White
Write-Host ""
Write-Host ""

