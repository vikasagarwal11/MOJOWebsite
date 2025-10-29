# =============================================================================
# MOJO Website - Staging Deployment Script
# =============================================================================
#
# This script handles deployment to the staging environment with intelligent
# extension management to avoid conflicts and speed up regular deployments.
#
# =============================================================================
# USAGE EXAMPLES
# =============================================================================
#
# 1. REGULAR DEVELOPMENT (No Extension Changes)
#    .\deploy-staging.ps1 no-extensions
#    - Deploys: hosting, firestore, functions
#    - Skips: extensions (avoids conflicts and saves time)
#    - Use for: Daily development work, bug fixes, feature updates
#
# 2. EXTENSION CONFIGURATION CHANGES
#    .\deploy-staging.ps1 extensions
#    - Deploys: extensions only
#    - Skips: hosting, firestore, functions
#    - Use for: When modifying storage-resize-images or stripe configurations
#
# 3. MAJOR RELEASES (Everything)
#    .\deploy-staging.ps1 all
#    - Deploys: hosting, firestore, functions, extensions
#    - Use for: Major releases, initial setup, or when everything changes
#
# 4. INDIVIDUAL COMPONENTS
#    .\deploy-staging.ps1 hosting    # Frontend only
#    .\deploy-staging.ps1 functions  # Cloud Functions only
#    .\deploy-staging.ps1 firestore  # Database rules only
#
# =============================================================================
# ENVIRONMENT REQUIREMENTS
# =============================================================================
#
# - .env.staging file must exist with correct STORAGE_BUCKET format:
#   STORAGE_BUCKET=momsfitnessmojostage.firebasestorage.app
#
# - Firebase CLI must be authenticated and configured
# - Project must be set to staging: firebase use staging
#
# =============================================================================
# AVAILABLE PARAMETERS
# =============================================================================
#
# [component] - What to deploy (default: "all")
# -SkipChecks - Skip pre-deployment checks (linting, tests)
#
# Examples:
# .\deploy-staging.ps1 no-extensions -SkipChecks
# .\deploy-staging.ps1 hosting
# .\deploy-staging.ps1 extensions --force
#
# =============================================================================

param(
    [string]$Component = "all",
    [switch]$SkipChecks = $false
)

Write-Host "Deploying to Staging Environment..." -ForegroundColor Green

# Set environment variables
$env:NODE_ENV = "staging"
$env:VITE_ENVIRONMENT = "staging"

# Read environment variables from .env.staging
if (Test-Path ".env.staging") {
    $envContent = Get-Content .env.staging
    $storageBucket = ($envContent | Where-Object { $_ -match "^STORAGE_BUCKET=" } | ForEach-Object { $_.Split('=')[1] })
    $viteStorageBucket = ($envContent | Where-Object { $_ -match "^VITE_FIREBASE_STORAGE_BUCKET=" } | ForEach-Object { $_.Split('=')[1] })
    $geminiApiKey = ($envContent | Where-Object { $_ -match "^GEMINI_API_KEY=" } | ForEach-Object { $_.Split('=')[1] })
    
    if ($storageBucket) {
        $env:STORAGE_BUCKET = $storageBucket
        Write-Host "[OK] Using STORAGE_BUCKET from .env.staging: $storageBucket" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] STORAGE_BUCKET not found in .env.staging, using default" -ForegroundColor Yellow
        $env:STORAGE_BUCKET = "momsfitnessmojostage.firebasestorage.app"
    }
    
    if ($viteStorageBucket) {
        Write-Host "[OK] Using VITE_FIREBASE_STORAGE_BUCKET from .env.staging: $viteStorageBucket" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] VITE_FIREBASE_STORAGE_BUCKET not found in .env.staging" -ForegroundColor Yellow
    }
    
    if ($geminiApiKey) {
        Write-Host "[OK] Found GEMINI_API_KEY in .env.staging (will be loaded automatically)" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] GEMINI_API_KEY not found in .env.staging" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARNING] .env.staging file not found, using defaults" -ForegroundColor Yellow
    $env:STORAGE_BUCKET = "momsfitnessmojostage.firebasestorage.app"
}

# Copy environment-specific extension configuration
Write-Host "Copying staging extension configuration..." -ForegroundColor Yellow
Copy-Item "extensions/storage-resize-images.staging.env" "extensions/storage-resize-images.env" -Force
Write-Host "[OK] Extension configuration copied for staging" -ForegroundColor Green

# Verify environment variables are loaded
Write-Host "[INFO] Environment Variables Check:" -ForegroundColor Cyan
Write-Host "  NODE_ENV: $env:NODE_ENV" -ForegroundColor White
Write-Host "  VITE_ENVIRONMENT: $env:VITE_ENVIRONMENT" -ForegroundColor White
Write-Host "  STORAGE_BUCKET: $env:STORAGE_BUCKET" -ForegroundColor White
Write-Host "  VITE_FIREBASE_STORAGE_BUCKET: $viteStorageBucket" -ForegroundColor White

Write-Host ""
if (-not $SkipChecks) {
    Write-Host "Running pre-deployment checks..." -ForegroundColor Yellow
    
    # Run code review
    if (Test-Path "scripts/code-review-simple.ps1") {
        Write-Host "  Running code review..." -ForegroundColor Cyan
        & ".\scripts\code-review-simple.ps1"
    }
    
    # Run linting
    Write-Host "  Running ESLint..." -ForegroundColor Cyan
    npm run lint
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Linting failed! Fix issues before deploying." -ForegroundColor Red
        exit 1
    }
    
    # Run tests
    Write-Host "  Running tests..." -ForegroundColor Cyan
    npm run test:run
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Tests failed! Fix issues before deploying." -ForegroundColor Red
        exit 1
    }
    
    Write-Host "SUCCESS: All pre-deployment checks passed!" -ForegroundColor Green
}

# Build the project for staging
Write-Host "Building project for staging..." -ForegroundColor Yellow
npm run build:staging

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

# Copy .env.staging to functions/.env for Firebase Functions v2 to use
# Firebase Functions v2 automatically loads .env files from the functions directory
Write-Host "Copying .env.staging to functions/.env for Cloud Functions..." -ForegroundColor Yellow
if (Test-Path ".env.staging") {
    Copy-Item ".env.staging" "functions\.env" -Force
    Write-Host "[OK] .env file copied to functions directory. Functions v2 will load it automatically." -ForegroundColor Green
    Write-Host "[INFO] Note: functions.config() is deprecated. Using .env files instead." -ForegroundColor Cyan
} else {
    Write-Host "[WARNING] .env.staging not found. Functions may not have environment variables!" -ForegroundColor Yellow
}

# Legacy: Set Cloud Functions config for STORAGE_BUCKET (deprecated but still works until March 2026)
# Note: This is deprecated. Prefer .env file above.
Write-Host "Setting legacy functions.config for STORAGE_BUCKET (deprecated, will remove in future)..." -ForegroundColor Yellow
firebase functions:config:set app.storage_bucket="$env:STORAGE_BUCKET" --project=momsfitnessmojostage 2>&1 | Out-Null

Write-Host "[OK] Legacy config set (deprecated API - .env file is preferred)." -ForegroundColor Green

# Deploy based on component
switch ($Component.ToLower()) {
    "hosting" {
        Write-Host "Deploying hosting only..." -ForegroundColor Cyan
        firebase deploy --only hosting --project=momsfitnessmojostage --config=firebase.staging.json
    }
    "firestore" {
        Write-Host "Deploying Firestore rules and indexes..." -ForegroundColor Cyan
        firebase deploy --only firestore --project=momsfitnessmojostage --config=firebase.staging.json
    }
    "functions" {
        Write-Host "Deploying Cloud Functions..." -ForegroundColor Cyan
        firebase deploy --only functions --project=momsfitnessmojostage --config=firebase.staging.json
    }
    "extensions" {
        Write-Host "Deploying Extensions only..." -ForegroundColor Cyan
        firebase deploy --only extensions --project=momsfitnessmojostage --config=firebase.staging.json --force
    }
    "no-extensions" {
        Write-Host "Deploying everything except extensions..." -ForegroundColor Cyan
        firebase deploy --only "hosting,firestore,functions" --project=momsfitnessmojostage --config=firebase.staging.json
    }
    "all" {
        Write-Host "Deploying everything..." -ForegroundColor Cyan
        firebase deploy --project=momsfitnessmojostage --config=firebase.staging.json --force
    }
    default {
        Write-Host "ERROR: Invalid component. Use: all, hosting, firestore, functions, extensions, no-extensions" -ForegroundColor Red
        exit 1
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: Staging deployment completed successfully!" -ForegroundColor Green
    Write-Host "Staging URL: https://momsfitnessmojostage.web.app" -ForegroundColor Cyan
} else {
    Write-Host "ERROR: Deployment failed!" -ForegroundColor Red
    exit 1
}