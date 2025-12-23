# =============================================================================
# Account Approval Workflow - Deployment Script
# =============================================================================
# Deploys Firestore rules and Cloud Functions for account approval workflow
#
# Usage:
#   .\scripts\deploy-account-approval.ps1
#   .\scripts\deploy-account-approval.ps1 -Project prod
#   .\scripts\deploy-account-approval.ps1 -Project staging -SkipRules
#   .\scripts\deploy-account-approval.ps1 -Project prod -SkipFunctions
# =============================================================================

param(
    [ValidateSet("dev", "staging", "prod")]
    [string]$Project = "dev",
    
    [switch]$SkipRules,
    [switch]$SkipFunctions,
    [switch]$DryRun
)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Account Approval Workflow Deployment" -ForegroundColor Cyan
Write-Host "Project: $Project" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No changes will be made" -ForegroundColor Yellow
    Write-Host ""
}

# Check if Firebase CLI is installed
try {
    $firebaseVersion = firebase --version
    Write-Host "✅ Firebase CLI found: $firebaseVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Firebase CLI not found. Please install it first." -ForegroundColor Red
    Write-Host "   Install: npm install -g firebase-tools" -ForegroundColor Yellow
    exit 1
}

# Set project
$projectId = ""
if ($Project -eq "dev") {
    firebase use dev | Out-Null
    $projectId = "momfitnessmojo"
} elseif ($Project -eq "staging") {
    firebase use staging | Out-Null
    $projectId = "momfitnessmojo-staging"
} elseif ($Project -eq "prod") {
    firebase use prod | Out-Null
    $projectId = "momsfitnessmojo-65d00"
}

Write-Host "✅ Using project: $projectId" -ForegroundColor Green
Write-Host ""

$deployed = $false

# Deploy Firestore Rules
if (-not $SkipRules) {
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "1. Deploying Firestore Rules..." -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
    
    if ($DryRun) {
        Write-Host "🔍 Would run: firebase deploy --only firestore:rules" -ForegroundColor Yellow
    } else {
        $configFile = ""
        if ($Project -eq "staging") {
            $configFile = "--config=firebase.staging.json"
        } elseif ($Project -eq "prod") {
            $configFile = "--config=firebase.prod.json"
        }
        
        if ($configFile -ne "") {
            firebase deploy --only firestore:rules --project=$projectId $configFile
        } else {
            firebase deploy --only firestore:rules
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ Firestore rules deployed successfully!" -ForegroundColor Green
            $deployed = $true
        } else {
            Write-Host ""
            Write-Host "❌ Firestore rules deployment failed!" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host ""
}

# Deploy Cloud Functions
if (-not $SkipFunctions) {
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host "2. Deploying Cloud Functions..." -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Functions to deploy:" -ForegroundColor Yellow
    Write-Host "  - onAccountApprovalCreated" -ForegroundColor White
    Write-Host "  - onAccountApprovalUpdated" -ForegroundColor White
    Write-Host "  - onApprovalMessageCreated" -ForegroundColor White
    Write-Host "  - grandfatherExistingUsers" -ForegroundColor White
    Write-Host ""
    
    if ($DryRun) {
        Write-Host "🔍 Would run: firebase deploy --only functions" -ForegroundColor Yellow
    } else {
        $configFile = ""
        if ($Project -eq "staging") {
            $configFile = "--config=firebase.staging.json"
        } elseif ($Project -eq "prod") {
            $configFile = "--config=firebase.prod.json"
        }
        
        if ($configFile -ne "") {
            firebase deploy --only functions --project=$projectId $configFile
        } else {
            firebase deploy --only functions
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ Cloud Functions deployed successfully!" -ForegroundColor Green
            $deployed = $true
        } else {
            Write-Host ""
            Write-Host "❌ Cloud Functions deployment failed!" -ForegroundColor Red
            exit 1
        }
    }
    Write-Host ""
}

# Summary
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Deployment Summary" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 Dry run completed. No changes made." -ForegroundColor Yellow
} elseif ($deployed) {
    Write-Host "✅ Deployment completed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Run grandfatherExistingUsers function" -ForegroundColor White
    Write-Host "   (See scripts/grandfather-users-browser.js)" -ForegroundColor Gray
    Write-Host "2. Test the registration flow" -ForegroundColor White
    Write-Host "3. Check Firebase Console for index suggestions" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "⚠️  No components deployed (all skipped)" -ForegroundColor Yellow
}

Write-Host ""
