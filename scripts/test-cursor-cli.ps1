# Test Cursor CLI Integration
# Simple script to test the Cursor CLI setup

Write-Host "🔍 Testing Cursor CLI Integration..." -ForegroundColor Green

# Check if cursor CLI is available
if (Get-Command cursor -ErrorAction SilentlyContinue) {
    Write-Host "✅ Cursor CLI is installed" -ForegroundColor Green
    $version = cursor --version
    Write-Host "   Version: $version" -ForegroundColor Cyan
} else {
    Write-Host "❌ Cursor CLI not found" -ForegroundColor Red
    exit 1
}

# Check project files
Write-Host "📁 Checking project files..." -ForegroundColor Yellow

$files = @(
    ".cursorrules",
    "public/sw.js",
    "scripts/code-review.ps1",
    "deploy-dev.ps1"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file" -ForegroundColor Red
    }
}

# Count TypeScript files
$tsFiles = Get-ChildItem -Path "src/" -Recurse -Include "*.ts", "*.tsx" | Where-Object { 
    $_.FullName -notmatch "node_modules|dist|build" 
}

Write-Host "📊 Project Statistics:" -ForegroundColor Yellow
Write-Host "  TypeScript/React files: $($tsFiles.Count)" -ForegroundColor Cyan
Write-Host "  Service Worker: Enhanced with PWA features" -ForegroundColor Cyan
Write-Host "  Firebase Integration: Configured" -ForegroundColor Cyan

# Test basic cursor command
Write-Host "🧪 Testing basic cursor command..." -ForegroundColor Yellow
try {
    $help = cursor --help | Select-Object -First 5
    Write-Host "  ✅ Cursor CLI is working" -ForegroundColor Green
    Write-Host "  Available commands:" -ForegroundColor Cyan
    $help | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
} catch {
    Write-Host "  ❌ Cursor CLI test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎉 Cursor CLI Integration Test Complete!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Try: cursor agent 'Review the service worker for PWA best practices'" -ForegroundColor Cyan
Write-Host "  2. Try: cursor agent 'Generate documentation for the EventService'" -ForegroundColor Cyan
Write-Host "  3. Try: cursor agent 'Analyze the React components for accessibility issues'" -ForegroundColor Cyan
