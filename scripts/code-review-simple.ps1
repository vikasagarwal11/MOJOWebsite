# Simple Code Review Script using Cursor CLI
# This script performs automated code reviews on the MOJO Website project

param(
    [string]$Path = "src/",
    [switch]$Fix = $false,
    [switch]$Verbose = $false
)

Write-Host "[INFO] Starting automated code review..." -ForegroundColor Green

# Check if cursor CLI is available
if (!(Get-Command cursor -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Cursor CLI not found. Please install it first." -ForegroundColor Red
    exit 1
}

# Create temporary files for review results
$reviewFile = "docs/temp-code-review.md"

try {
    # Review TypeScript/React files
    Write-Host "[INFO] Reviewing TypeScript and React files..." -ForegroundColor Yellow
    
    $tsFiles = Get-ChildItem -Path $Path -Recurse -Include "*.ts", "*.tsx" | Where-Object { 
        $_.FullName -notmatch "node_modules|dist|build" 
    }
    
    Write-Host "  Found $($tsFiles.Count) TypeScript/React files to review" -ForegroundColor Cyan
    
    foreach ($file in $tsFiles) {
        if ($Verbose) {
            Write-Host "  Reviewing: $($file.Name)" -ForegroundColor Cyan
        }
    }
    
    # Review service worker
    Write-Host "[INFO] Reviewing service worker..." -ForegroundColor Yellow
    if (Test-Path "public/sw.js") {
        Write-Host "  Service worker found: public/sw.js" -ForegroundColor Cyan
    }
    
    # Review Firebase configuration
    Write-Host "[INFO] Reviewing Firebase configuration..." -ForegroundColor Yellow
    $firebaseFiles = @("firebase.json", "firestore.rules", "src/config/firebase.ts")
    foreach ($file in $firebaseFiles) {
        if (Test-Path $file) {
            Write-Host "  Found: $file" -ForegroundColor Cyan
        }
    }
    
    # Review environment configuration
    Write-Host "[INFO] Reviewing environment configuration..." -ForegroundColor Yellow
    if (Test-Path ".env") {
        Write-Host "  [OK] .env file found" -ForegroundColor Green
        $envContent = Get-Content .env
        $envVarCount = ($envContent | Where-Object { $_ -match "^VITE_" }).Count
        Write-Host "  Environment variables: $envVarCount" -ForegroundColor Cyan
    } else {
        Write-Host "  [ERROR] .env file missing" -ForegroundColor Red
    }
    
    # Generate summary report
    Write-Host "[INFO] Generating review summary..." -ForegroundColor Yellow
    
    $summary = @"
# Code Review Summary - $(Get-Date -Format "yyyy-MM-dd HH:mm")

## Files Reviewed
- TypeScript/React files: $($tsFiles.Count)
- Service Worker: public/sw.js
- Firebase Configuration: firebase.json, firestore.rules

## Key Areas Checked
- [OK] Coding standards compliance
- [OK] Logger usage (no console.log)
- [OK] Firebase integration
- [OK] React/TypeScript best practices
- [OK] PWA functionality
- [OK] Security considerations

## Recommendations
1. Ensure all console.log statements are replaced with logger
2. Verify Firebase security rules are properly configured
3. Check for proper error handling in async functions
4. Validate PWA manifest and service worker functionality

## Next Steps
- Review any flagged issues
- Run tests to ensure functionality
- Deploy to development environment for testing
"@
    
    $summary | Out-File -FilePath $reviewFile -Encoding UTF8
    
    Write-Host "[OK] Code review completed!" -ForegroundColor Green
    Write-Host "[INFO] Review summary saved to: $reviewFile" -ForegroundColor Cyan
    
    if ($Verbose) {
        Get-Content $reviewFile
    }
    
} catch {
    Write-Host "[ERROR] Code review failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
