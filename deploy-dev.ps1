# PowerShell script for deploying to development environment
# Usage: .\deploy-dev.ps1 [component]
# Components: all, hosting, firestore, functions

param(
    [string]$Component = "all",
    [switch]$SkipChecks = $false
)

Write-Host "Deploying to Development Environment..." -ForegroundColor Green

# Set environment variables
$env:NODE_ENV = "development"
$env:VITE_ENVIRONMENT = "development"
$env:STORAGE_BUCKET = "mojomediafiles"

# Run pre-deployment checks
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

# Build the project for development
Write-Host "Building project for development..." -ForegroundColor Yellow
npm run build:dev

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

# Deploy based on component
switch ($Component.ToLower()) {
    "hosting" {
        Write-Host "Deploying hosting only..." -ForegroundColor Cyan
        firebase deploy --only hosting --project=dev --config=firebase.dev.json
    }
    "firestore" {
        Write-Host "Deploying Firestore rules and indexes..." -ForegroundColor Cyan
        firebase deploy --only firestore --project=dev --config=firebase.dev.json
    }
    "functions" {
        Write-Host "Deploying Cloud Functions..." -ForegroundColor Cyan
        firebase deploy --only functions --project=dev --config=firebase.dev.json
    }
    "all" {
        Write-Host "Deploying everything..." -ForegroundColor Cyan
        firebase deploy --project=dev --config=firebase.dev.json
    }
    default {
        Write-Host "ERROR: Invalid component. Use: all, hosting, firestore, functions" -ForegroundColor Red
        exit 1
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "SUCCESS: Development deployment completed successfully!" -ForegroundColor Green
} else {
    Write-Host "ERROR: Deployment failed!" -ForegroundColor Red
    exit 1
}
