# PowerShell script for deploying to production environment
# Usage: .\deploy-prod.ps1 [component]
# Components: all, hosting, firestore, functions

param(
    [string]$Component = "all"
)

Write-Host "🚀 Deploying to Production Environment..." -ForegroundColor Green

# Set environment variables
$env:NODE_ENV = "production"
$env:VITE_ENVIRONMENT = "production"

# Build the project for production
Write-Host "📦 Building project for production..." -ForegroundColor Yellow
npm run build:prod

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

# Deploy based on component
switch ($Component.ToLower()) {
    "hosting" {
        Write-Host "🌐 Deploying hosting only..." -ForegroundColor Cyan
        firebase deploy --only hosting --project=prod --config=firebase.prod.json
    }
    "firestore" {
        Write-Host "🗄️ Deploying Firestore rules and indexes..." -ForegroundColor Cyan
        firebase deploy --only firestore --project=prod --config=firebase.prod.json
    }
    "functions" {
        Write-Host "⚡ Deploying Cloud Functions..." -ForegroundColor Cyan
        firebase deploy --only functions --project=prod --config=firebase.prod.json
    }
    "all" {
        Write-Host "🚀 Deploying everything..." -ForegroundColor Cyan
        firebase deploy --project=prod --config=firebase.prod.json
    }
    default {
        Write-Host "❌ Invalid component. Use: all, hosting, firestore, functions" -ForegroundColor Red
        exit 1
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Production deployment completed successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}