# PowerShell script for deploying to staging environment
# Usage: .\deploy-staging.ps1 [component]
# Components: all, hosting, firestore, functions

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
    
    if ($storageBucket) {
        $env:STORAGE_BUCKET = $storageBucket
        Write-Host "[OK] Using STORAGE_BUCKET from .env.staging: $storageBucket" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] STORAGE_BUCKET not found in .env.staging, using default" -ForegroundColor Yellow
        $env:STORAGE_BUCKET = "mojomediafiles-staging.firebasestorage.app"
    }
    
    if ($viteStorageBucket) {
        Write-Host "[OK] Using VITE_FIREBASE_STORAGE_BUCKET from .env.staging: $viteStorageBucket" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] VITE_FIREBASE_STORAGE_BUCKET not found in .env.staging" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARNING] .env.staging file not found, using defaults" -ForegroundColor Yellow
    $env:STORAGE_BUCKET = "mojomediafiles-staging.firebasestorage.app"
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

# Set Cloud Functions environment variable for STORAGE_BUCKET
Write-Host "Setting Cloud Functions environment variable STORAGE_BUCKET to: $env:STORAGE_BUCKET" -ForegroundColor Yellow
firebase functions:config:set app.storage_bucket="$env:STORAGE_BUCKET" --project=momfitnessmojo-staging

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to set Cloud Functions environment variable!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Cloud Functions environment variable set." -ForegroundColor Green

# Deploy based on component
switch ($Component.ToLower()) {
    "hosting" {
        Write-Host "Deploying hosting only..." -ForegroundColor Cyan
        firebase deploy --only hosting --project=momfitnessmojo-staging --config=firebase.staging.json
    }
    "firestore" {
        Write-Host "Deploying Firestore rules and indexes..." -ForegroundColor Cyan
        firebase deploy --only firestore --project=momfitnessmojo-staging --config=firebase.staging.json
    }
    "functions" {
        Write-Host "Deploying Cloud Functions..." -ForegroundColor Cyan
        firebase deploy --only functions --project=momfitnessmojo-staging --config=firebase.staging.json
    }
    "all" {
        Write-Host "Deploying everything..." -ForegroundColor Cyan
        firebase deploy --project=momfitnessmojo-staging --config=firebase.staging.json
    }
    default {
        Write-Host "ERROR: Invalid component. Use: all, hosting, firestore, functions" -ForegroundColor Red
        exit 1
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: Staging deployment completed successfully!" -ForegroundColor Green
    Write-Host "Staging URL: https://momfitnessmojo-staging.web.app" -ForegroundColor Cyan
} else {
    Write-Host "ERROR: Deployment failed!" -ForegroundColor Red
    exit 1
}