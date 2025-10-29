# =============================================================================
# MOJO Website - Production Deployment Script
# =============================================================================
#
# This script handles deployment to the production environment with intelligent
# extension management to avoid conflicts and speed up regular deployments.
#
# =============================================================================
# USAGE EXAMPLES
# =============================================================================
#
# 1. REGULAR PRODUCTION UPDATES (No Extension Changes)
#    .\deploy-prod.ps1 no-extensions
#    - Deploys: hosting, firestore, functions
#    - Skips: extensions (avoids conflicts and saves time)
#    - Use for: Bug fixes, feature updates, content changes
#
# 2. EXTENSION CONFIGURATION CHANGES
#    .\deploy-prod.ps1 extensions
#    - Deploys: extensions only
#    - Skips: hosting, firestore, functions
#    - Use for: When modifying storage-resize-images or stripe configurations
#
# 3. MAJOR RELEASES (Everything)
#    .\deploy-prod.ps1 all
#    - Deploys: hosting, firestore, functions, extensions
#    - Use for: Major releases, initial setup, or when everything changes
#
# 4. INDIVIDUAL COMPONENTS
#    .\deploy-prod.ps1 hosting    # Frontend only
#    .\deploy-prod.ps1 functions  # Cloud Functions only
#    .\deploy-prod.ps1 firestore  # Database rules only
#
# =============================================================================
# ENVIRONMENT REQUIREMENTS
# =============================================================================
#
# - .env.production file must exist with correct STORAGE_BUCKET format:
#   STORAGE_BUCKET=momsfitnessmojo-65d00.firebasestorage.app
#
# - Firebase CLI must be authenticated and configured
# - Project must be set to prod: firebase use prod
#
# =============================================================================
# AVAILABLE PARAMETERS
# =============================================================================
#
# [component] - What to deploy (default: "all")
# -SkipChecks - Skip pre-deployment checks (linting, tests)
#
# Examples:
# .\deploy-prod.ps1 no-extensions -SkipChecks
# .\deploy-prod.ps1 hosting
# .\deploy-prod.ps1 extensions --force
#
# =============================================================================

param(
    [string]$Component = "all",
    [switch]$SkipChecks = $false
)

Write-Host "Deploying to Production Environment..." -ForegroundColor Green

# Set environment variables
$env:NODE_ENV = "production"
$env:VITE_ENVIRONMENT = "production"

# Read environment variables from .env.production
if (Test-Path ".env.production") {
    $envContent = Get-Content .env.production
    $storageBucket = ($envContent | Where-Object { $_ -match "^STORAGE_BUCKET=" } | ForEach-Object { $_.Split('=')[1] })
    $viteStorageBucket = ($envContent | Where-Object { $_ -match "^VITE_FIREBASE_STORAGE_BUCKET=" } | ForEach-Object { $_.Split('=')[1] })
    $geminiApiKey = ($envContent | Where-Object { $_ -match "^GEMINI_API_KEY=" } | ForEach-Object { $_.Split('=')[1] })
    
    if ($storageBucket) {
        $env:STORAGE_BUCKET = $storageBucket
        Write-Host "[OK] Using STORAGE_BUCKET from .env.production: $storageBucket" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] STORAGE_BUCKET not found in .env.production, using default" -ForegroundColor Yellow
        $env:STORAGE_BUCKET = "momsfitnessmojo-65d00.firebasestorage.app"
    }
    
    if ($viteStorageBucket) {
        Write-Host "[OK] Using VITE_FIREBASE_STORAGE_BUCKET from .env.production: $viteStorageBucket" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] VITE_FIREBASE_STORAGE_BUCKET not found in .env.production" -ForegroundColor Yellow
    }
    
    if ($geminiApiKey) {
        Write-Host "[OK] Found GEMINI_API_KEY in .env.production (will be loaded automatically)" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] GEMINI_API_KEY not found in .env.production" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARNING] .env.production file not found, using defaults" -ForegroundColor Yellow
    $env:STORAGE_BUCKET = "momsfitnessmojo-65d00.firebasestorage.app"
}

# Verify environment variables are loaded
Write-Host "[INFO] Environment Variables Check:" -ForegroundColor Cyan
Write-Host "  NODE_ENV: $env:NODE_ENV" -ForegroundColor White
Write-Host "  VITE_ENVIRONMENT: $env:VITE_ENVIRONMENT" -ForegroundColor White
Write-Host "  STORAGE_BUCKET: $env:STORAGE_BUCKET" -ForegroundColor White
Write-Host "  VITE_FIREBASE_STORAGE_BUCKET: $viteStorageBucket" -ForegroundColor White

Write-Host ""

# Copy environment-specific extension configuration
Write-Host "Copying production extension configuration..." -ForegroundColor Yellow
Copy-Item "extensions/storage-resize-images.prod.env" "extensions/storage-resize-images.env" -Force
Write-Host "[OK] Extension configuration copied for production" -ForegroundColor Green

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

# Build the project for production
Write-Host "Building project for production..." -ForegroundColor Yellow
npm run build:prod

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

# Copy .env.production to functions/.env for Firebase Functions v2 to use
# Firebase Functions v2 automatically loads .env files from the functions directory
Write-Host "Copying .env.production to functions/.env for Cloud Functions..." -ForegroundColor Yellow
if (Test-Path ".env.production") {
    Copy-Item ".env.production" "functions\.env" -Force
    Write-Host "[OK] .env file copied to functions directory. Functions v2 will load it automatically." -ForegroundColor Green
    Write-Host "[INFO] Note: functions.config() is deprecated. Using .env files instead." -ForegroundColor Cyan
} else {
    Write-Host "[WARNING] .env.production not found. Functions may not have environment variables!" -ForegroundColor Yellow
}

# Legacy: Set Cloud Functions config for STORAGE_BUCKET (deprecated but still works until March 2026)
# Note: This is deprecated. Prefer .env file above.
Write-Host "Setting legacy functions.config for STORAGE_BUCKET (deprecated, will remove in future)..." -ForegroundColor Yellow
firebase functions:config:set app.storage_bucket="$env:STORAGE_BUCKET" --project=momsfitnessmojo-65d00 2>&1 | Out-Null

Write-Host "[OK] Legacy config set (deprecated API - .env file is preferred)." -ForegroundColor Green

# Deploy based on component
switch ($Component.ToLower()) {
    "hosting" {
        Write-Host "Deploying hosting only..." -ForegroundColor Cyan
        firebase deploy --only hosting --project=momsfitnessmojo-65d00 --config=firebase.prod.json
    }
    "firestore" {
        Write-Host "Deploying Firestore rules and indexes..." -ForegroundColor Cyan
        firebase deploy --only firestore --project=momsfitnessmojo-65d00 --config=firebase.prod.json
    }
    "storage" {
        Write-Host "Deploying Storage rules..." -ForegroundColor Cyan
        firebase deploy --only storage --project=momsfitnessmojo-65d00 --config=firebase.prod.json
    }
    "functions" {
        Write-Host "Deploying Cloud Functions..." -ForegroundColor Cyan
        firebase deploy --only functions --project=momsfitnessmojo-65d00 --config=firebase.prod.json
    }
    "extensions" {
        Write-Host "Deploying Extensions only..." -ForegroundColor Cyan
        firebase deploy --only extensions --project=momsfitnessmojo-65d00 --config=firebase.prod.json --force
    }
    "no-extensions" {
        Write-Host "Deploying everything except extensions..." -ForegroundColor Cyan
        firebase deploy --only "hosting,firestore,functions,storage" --project=momsfitnessmojo-65d00 --config=firebase.prod.json
    }
    "all" {
        Write-Host "Deploying everything..." -ForegroundColor Cyan
        firebase deploy --project=momsfitnessmojo-65d00 --config=firebase.prod.json --force
    }
    default {
        Write-Host "ERROR: Invalid component. Use: all, hosting, firestore, functions, extensions, no-extensions" -ForegroundColor Red
        exit 1
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: Production deployment completed successfully!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Deployment failed!" -ForegroundColor Red
    exit 1
}
