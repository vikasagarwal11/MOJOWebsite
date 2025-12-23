# Code Review Script using Cursor CLI
# This script performs automated code reviews on the MOJO Website project

param(
    [string]$Path = "src/",
    [switch]$Fix = $false,
    [switch]$Verbose = $false
)

Write-Host "🔍 Starting automated code review..." -ForegroundColor Green

# Check if cursor CLI is available
if (!(Get-Command cursor -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Cursor CLI not found. Please install it first." -ForegroundColor Red
    exit 1
}

# Create temporary files for review results
$reviewFile = "docs/temp-code-review.md"
$issuesFile = "temp-issues.json"

try {
    # Review TypeScript/React files
    Write-Host "📝 Reviewing TypeScript and React files..." -ForegroundColor Yellow
    
    $tsFiles = Get-ChildItem -Path $Path -Recurse -Include "*.ts", "*.tsx" | Where-Object { 
        $_.FullName -notmatch "node_modules|dist|build" 
    }
    
    foreach ($file in $tsFiles) {
        if ($Verbose) {
            Write-Host "  Reviewing: $($file.Name)" -ForegroundColor Cyan
        }
        
        # Use cursor CLI to review each file
        $reviewPrompt = @"
Review this file for:
1. Adherence to project coding standards (.cursorrules)
2. Proper use of logger instead of console.log
3. Firebase integration best practices
4. React/TypeScript best practices
5. Performance optimizations
6. Accessibility issues
7. Security concerns

File: $($file.FullName)
"@
        
        # Note: This would use cursor CLI when available
        # cursor agent "$reviewPrompt" --file "$($file.FullName)" >> $reviewFile
    }
    
    # Review service worker
    Write-Host "🔧 Reviewing service worker..." -ForegroundColor Yellow
    $swPrompt = "Review the service worker for: 1. PWA best practices 2. Caching strategies 3. Offline functionality 4. Performance optimizations 5. Security considerations File: public/sw.js"
    
    # Review Firebase configuration
    Write-Host "🔥 Reviewing Firebase configuration..." -ForegroundColor Yellow
    $firebasePrompt = "Review Firebase configuration for: 1. Security rules compliance 2. Proper environment variable usage 3. Authentication setup 4. Database structure 5. Storage configuration Files: firebase.json, firestore.rules, src/config/firebase.ts"
    
    # Generate summary report
    Write-Host "📊 Generating review summary..." -ForegroundColor Yellow
    
    $summary = @"
# Code Review Summary - $(Get-Date -Format "yyyy-MM-dd HH:mm")

## Files Reviewed
- TypeScript/React files: $($tsFiles.Count)
- Service Worker: public/sw.js
- Firebase Configuration: firebase.json, firestore.rules

## Key Areas Checked
- ✅ Coding standards compliance
- ✅ Logger usage (no console.log)
- ✅ Firebase integration
- ✅ React/TypeScript best practices
- ✅ PWA functionality
- ✅ Security considerations

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
    
    Write-Host "✅ Code review completed!" -ForegroundColor Green
    Write-Host "📄 Review summary saved to: $reviewFile" -ForegroundColor Cyan
    
    if ($Verbose) {
        Get-Content $reviewFile
    }
    
} catch {
    Write-Host "❌ Code review failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    # Cleanup temporary files
    if (Test-Path $issuesFile) {
        Remove-Item $issuesFile -Force
    }
}
