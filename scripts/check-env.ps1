# Environment Configuration Checker
# This script helps Cursor understand the current environment setup

Write-Host "🔍 Checking Environment Configuration..." -ForegroundColor Green

# Check if .env file exists
if (Test-Path ".env") {
    Write-Host "✅ .env file found" -ForegroundColor Green
    
    # Read and display current environment variables
    Write-Host "`n📋 Current Environment Variables:" -ForegroundColor Yellow
    Get-Content .env | ForEach-Object {
        if ($_ -match "^VITE_") {
            $key = $_.Split('=')[0]
            $value = $_.Split('=')[1]
            if ($value.Length -gt 20) {
                $displayValue = $value.Substring(0, 20) + "..."
            } else {
                $displayValue = $value
            }
            Write-Host "  $key = $displayValue" -ForegroundColor Cyan
        }
    }
    
    # Check for critical variables
    Write-Host "`n🔑 Critical Variables Check:" -ForegroundColor Yellow
    $envContent = Get-Content .env -Raw
    
    $requiredVars = @(
        "VITE_FIREBASE_PROJECT_ID",
        "VITE_FIREBASE_API_KEY", 
        "VITE_FIREBASE_AUTH_DOMAIN",
        "VITE_FIREBASE_STORAGE_BUCKET",
        "VITE_ENVIRONMENT"
    )
    
    foreach ($var in $requiredVars) {
        if ($envContent -match $var) {
            Write-Host "  ✅ $var" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $var (MISSING)" -ForegroundColor Red
        }
    }
    
    # Display current project info
    Write-Host "`n🏗️ Project Configuration:" -ForegroundColor Yellow
    if ($envContent -match "VITE_FIREBASE_PROJECT_ID=(.+)") {
        Write-Host "  Project ID: $($matches[1])" -ForegroundColor Cyan
    }
    if ($envContent -match "VITE_ENVIRONMENT=(.+)") {
        Write-Host "  Environment: $($matches[1])" -ForegroundColor Cyan
    }
    if ($envContent -match "VITE_FIREBASE_STORAGE_BUCKET=(.+)") {
        Write-Host "  Storage Bucket: $($matches[1])" -ForegroundColor Cyan
    }
    
} else {
    Write-Host "❌ .env file not found!" -ForegroundColor Red
    Write-Host "Please create .env file from env-template.txt" -ForegroundColor Yellow
    exit 1
}

# Check for other environment files
Write-Host "`n📁 Other Environment Files:" -ForegroundColor Yellow
$envFiles = Get-ChildItem -Name "*.env*" -Force | Where-Object { $_ -ne ".env" }
foreach ($file in $envFiles) {
    Write-Host "  📄 $file" -ForegroundColor Gray
}

Write-Host "`n✅ Environment check complete!" -ForegroundColor Green
Write-Host "Cursor will now be aware of your environment configuration." -ForegroundColor Cyan
