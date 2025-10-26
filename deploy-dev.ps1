# =============================================================================
# MOJO Website - Development Deployment Script
# =============================================================================
#
# This script handles deployment to the development environment with intelligent
# extension management to avoid conflicts and speed up regular deployments.
#
# =============================================================================
# USAGE EXAMPLES
# =============================================================================
#
# 1. REGULAR DEVELOPMENT (No Extension Changes)
#    .\deploy-dev.ps1 no-extensions
#    - Deploys: hosting, firestore, functions
#    - Skips: extensions (avoids conflicts and saves time)
#    - Use for: Daily development work, bug fixes, feature updates
#
# 2. EXTENSION CONFIGURATION CHANGES
#    .\deploy-dev.ps1 extensions
#    - Deploys: extensions only
#    - Skips: hosting, firestore, functions
#    - Use for: When modifying storage-resize-images or stripe configurations
#
# 3. MAJOR RELEASES (Everything)
#    .\deploy-dev.ps1 all
#    - Deploys: hosting, firestore, functions, extensions
#    - Use for: Major releases, initial setup, or when everything changes
#
# 4. INDIVIDUAL COMPONENTS
#    .\deploy-dev.ps1 hosting    # Frontend only
#    .\deploy-dev.ps1 functions  # Cloud Functions only
#    .\deploy-dev.ps1 firestore  # Database rules only
#
# =============================================================================
# ENVIRONMENT REQUIREMENTS
# =============================================================================
#
# - .env.development file must exist with correct STORAGE_BUCKET format:
#   STORAGE_BUCKET=mojomediafiles (or momfitnessmojo.firebasestorage.app)
#
# - Firebase CLI must be authenticated and configured
# - Project must be set to dev: firebase use dev
#
# =============================================================================
# AVAILABLE PARAMETERS
# =============================================================================
#
# [component] - What to deploy (default: "all")
# -SkipChecks - Skip pre-deployment checks (linting, tests)
#
# Examples:
# .\deploy-dev.ps1 no-extensions -SkipChecks
# .\deploy-dev.ps1 hosting
# .\deploy-dev.ps1 extensions --force
#
# =============================================================================

param(
    [string]$Component = "all",
    [switch]$SkipChecks = $false
)

Write-Host "Deploying to Development Environment..." -ForegroundColor Green

# Set environment variables
$env:NODE_ENV = "development"
$env:VITE_ENVIRONMENT = "development"

# Read environment variables from .env.development
if (Test-Path ".env.development") {
    $envContent = Get-Content .env.development
    $storageBucket = ($envContent | Where-Object { $_ -match "^STORAGE_BUCKET=" } | ForEach-Object { $_.Split('=')[1] })
    $viteStorageBucket = ($envContent | Where-Object { $_ -match "^VITE_FIREBASE_STORAGE_BUCKET=" } | ForEach-Object { $_.Split('=')[1] })
    
    if ($storageBucket) {
        $env:STORAGE_BUCKET = $storageBucket
        Write-Host "[OK] Using STORAGE_BUCKET from .env.development: $storageBucket" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] STORAGE_BUCKET not found in .env.development, using default" -ForegroundColor Yellow
        $env:STORAGE_BUCKET = "momfitnessmojo.firebasestorage.app"
    }
    
    if ($viteStorageBucket) {
        Write-Host "[OK] Using VITE_FIREBASE_STORAGE_BUCKET from .env.development: $viteStorageBucket" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] VITE_FIREBASE_STORAGE_BUCKET not found in .env.development" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARNING] .env.development file not found, using defaults" -ForegroundColor Yellow
    $env:STORAGE_BUCKET = "momfitnessmojo.firebasestorage.app"
}

# Verify environment variables are loaded
Write-Host "[INFO] Environment Variables Check:" -ForegroundColor Cyan
Write-Host "  NODE_ENV: $env:NODE_ENV" -ForegroundColor White
Write-Host "  VITE_ENVIRONMENT: $env:VITE_ENVIRONMENT" -ForegroundColor White
Write-Host "  STORAGE_BUCKET: $env:STORAGE_BUCKET" -ForegroundColor White
Write-Host "  VITE_FIREBASE_STORAGE_BUCKET: $viteStorageBucket" -ForegroundColor White

Write-Host ""

# Copy environment-specific extension configuration
Write-Host "Copying development extension configuration..." -ForegroundColor Yellow
Copy-Item "extensions/storage-resize-images.dev.env" "extensions/storage-resize-images.env" -Force
Write-Host "[OK] Extension configuration copied for development" -ForegroundColor Green

Write-Host ""
if (-not $SkipChecks) {
    
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

# Build the project for development
Write-Host "Building project for development..." -ForegroundColor Yellow
npm run build:dev

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

# Set Cloud Functions environment variable for STORAGE_BUCKET
Write-Host "Setting Cloud Functions environment variable STORAGE_BUCKET to: $env:STORAGE_BUCKET" -ForegroundColor Yellow
firebase functions:config:set app.storage_bucket="$env:STORAGE_BUCKET" --project=momfitnessmojo

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to set Cloud Functions environment variable!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Cloud Functions environment variable set." -ForegroundColor Green

# Deploy based on component
switch ($Component.ToLower()) {
    "hosting" {
        Write-Host "Deploying hosting only..." -ForegroundColor Cyan
        firebase deploy --only hosting --project=momfitnessmojo --config=firebase.dev.json
    }
    "firestore" {
        Write-Host "Deploying Firestore rules and indexes..." -ForegroundColor Cyan
        firebase deploy --only firestore --project=momfitnessmojo --config=firebase.dev.json
    }
    "functions" {
        Write-Host "Deploying Cloud Functions..." -ForegroundColor Cyan
        firebase deploy --only functions --project=momfitnessmojo --config=firebase.dev.json
    }
    "extensions" {
        Write-Host "Deploying Extensions only..." -ForegroundColor Cyan
        firebase deploy --only extensions --project=momfitnessmojo --config=firebase.dev.json --force
    }
    "no-extensions" {
        Write-Host "Deploying everything except extensions..." -ForegroundColor Cyan
        firebase deploy --only "hosting,firestore,functions" --project=momfitnessmojo --config=firebase.dev.json
    }
    "all" {
        Write-Host "Deploying everything..." -ForegroundColor Cyan
        firebase deploy --project=momfitnessmojo --config=firebase.dev.json --force
    }
    default {
        Write-Host "ERROR: Invalid component. Use: all, hosting, firestore, functions, extensions, no-extensions" -ForegroundColor Red
        exit 1
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: Development deployment completed successfully!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Deployment failed!" -ForegroundColor Red
    exit 1
}