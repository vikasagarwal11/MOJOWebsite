# Simple Cursor CLI Test

Write-Host "Testing Cursor CLI..." -ForegroundColor Green

# Check if cursor CLI is available
if (Get-Command cursor -ErrorAction SilentlyContinue) {
    Write-Host "✅ Cursor CLI is installed" -ForegroundColor Green
    $version = cursor --version
    Write-Host "Version: $version" -ForegroundColor Cyan
} else {
    Write-Host "❌ Cursor CLI not found" -ForegroundColor Red
    exit 1
}

# Check project files
Write-Host "Checking project files..." -ForegroundColor Yellow

if (Test-Path ".cursorrules") {
    Write-Host "✅ .cursorrules found" -ForegroundColor Green
} else {
    Write-Host "❌ .cursorrules missing" -ForegroundColor Red
}

if (Test-Path "public/sw.js") {
    Write-Host "✅ Enhanced service worker found" -ForegroundColor Green
} else {
    Write-Host "❌ Service worker missing" -ForegroundColor Red
}

# Count TypeScript files
$tsFiles = Get-ChildItem -Path "src/" -Recurse -Include "*.ts", "*.tsx" | Where-Object { 
    $_.FullName -notmatch "node_modules|dist|build" 
}

Write-Host "TypeScript/React files found: $($tsFiles.Count)" -ForegroundColor Cyan

Write-Host "`nCursor CLI Integration Complete!" -ForegroundColor Green
Write-Host "You can now use cursor agent commands!" -ForegroundColor Yellow
