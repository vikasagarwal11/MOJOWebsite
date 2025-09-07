# PowerShell script for deploying to development environment
# Usage: .\deploy-dev.ps1 [component]
# Components: all, hosting, firestore, functions

param(
    [string]$Component = "all"
)

Write-Host "🚀 Deploying to Development Environment..." -ForegroundColor Green

# Set environment variables
$env:NODE_ENV = "development"
$env:VITE_ENVIRONMENT = "development"

# Build the project for development
Write-Host "📦 Building project for development..." -ForegroundColor Yellow
npm run build:dev

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

# Deploy based on component
switch ($Component.ToLower()) {
    "hosting" {
        Write-Host "🌐 Deploying hosting only..." -ForegroundColor Cyan
        firebase deploy --only hosting --project=dev --config=firebase.dev.json
    }
    "firestore" {
        Write-Host "🗄️ Deploying Firestore rules and indexes..." -ForegroundColor Cyan
        firebase deploy --only firestore --project=dev --config=firebase.dev.json
    }
    "functions" {
        Write-Host "⚡ Deploying Cloud Functions..." -ForegroundColor Cyan
        firebase deploy --only functions --project=dev --config=firebase.dev.json
    }
    "all" {
        Write-Host "🚀 Deploying everything..." -ForegroundColor Cyan
        firebase deploy --project=dev --config=firebase.dev.json
    }
    default {
        Write-Host "❌ Invalid component. Use: all, hosting, firestore, functions" -ForegroundColor Red
        exit 1
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Development deployment completed successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}
