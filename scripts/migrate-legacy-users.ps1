# Legacy User Migration Script (PowerShell)
# 
# This script migrates existing users who don't have a 'status' field
# to have status: 'approved'. This is necessary because the new security
# fixes default missing status to 'pending', which would block legacy users.
# 
# Usage:
#   .\scripts\migrate-legacy-users.ps1 [-DryRun] [-ProjectId "YOUR_PROJECT_ID"]
# 
# IMPORTANT: 
#   - Backup your Firestore database before running
#   - Test in a development environment first
#   - Run during low-traffic period

param(
    [switch]$DryRun,
    [string]$ProjectId = $env:FIREBASE_PROJECT_ID ?? "momfitnessmojo"
)

Write-Host "🔍 Legacy User Migration Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project ID: $ProjectId"
Write-Host "Mode: $(if ($DryRun) { 'DRY RUN (no changes will be made)' } else { 'LIVE (changes will be applied)' })"
Write-Host ""

# Check if Node.js is available
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "💡 Please install Node.js to run this script" -ForegroundColor Yellow
    exit 1
}

# Check if firebase-admin is installed
try {
    $firebaseAdmin = npm list firebase-admin 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "📦 Installing firebase-admin..." -ForegroundColor Yellow
        npm install firebase-admin --no-save
    }
} catch {
    Write-Host "❌ Error checking/installing firebase-admin" -ForegroundColor Red
    exit 1
}

# Build command
$scriptPath = Join-Path $PSScriptRoot "migrate-legacy-users.js"
$args = @()

if ($DryRun) {
    $args += "--dry-run"
}

if ($ProjectId) {
    $args += "--project-id=$ProjectId"
}

# Run the Node.js script
Write-Host "🚀 Running migration script..." -ForegroundColor Cyan
Write-Host ""

node $scriptPath $args

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Migration script completed successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Migration script failed!" -ForegroundColor Red
    exit 1
}

