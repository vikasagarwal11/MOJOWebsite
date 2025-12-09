# Twilio Setup Verification and Update Script
# This script verifies and helps update Twilio credentials after Business Profile approval

Write-Host "`n=== Twilio Setup Verification ===" -ForegroundColor Cyan
Write-Host ""

# Approved Account SID from Business Profile approval (placeholder - do not commit real SID)
$APPROVED_ACCOUNT_SID = "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

Write-Host "Approved Account SID: $APPROVED_ACCOUNT_SID" -ForegroundColor Green
Write-Host ""

# Check if .env.production exists
if (Test-Path ".env.production") {
    Write-Host "[OK] .env.production file exists" -ForegroundColor Green
    
    # Check if Twilio credentials are in .env.production
    $envContent = Get-Content ".env.production" -Raw
    $hasAccountSid = $envContent -match "TWILIO_ACCOUNT_SID"
    $hasAuthToken = $envContent -match "TWILIO_AUTH_TOKEN"
    $hasPhoneNumber = $envContent -match "TWILIO_PHONE_NUMBER"
    
    if ($hasAccountSid) {
        Write-Host "[OK] TWILIO_ACCOUNT_SID found in .env.production" -ForegroundColor Green
        
        # Extract current Account SID
        $currentSid = ($envContent | Select-String -Pattern "TWILIO_ACCOUNT_SID=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value }).Trim()
        
        if ($currentSid -eq $APPROVED_ACCOUNT_SID) {
            Write-Host "[OK] Account SID matches approved one: $currentSid" -ForegroundColor Green
        } else {
            Write-Host "[WARNING] Account SID mismatch!" -ForegroundColor Yellow
            Write-Host "  Current: $currentSid" -ForegroundColor Yellow
            Write-Host "  Approved: $APPROVED_ACCOUNT_SID" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "Please update .env.production with the approved Account SID" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[WARNING] TWILIO_ACCOUNT_SID not found in .env.production" -ForegroundColor Yellow
    }
    
    if ($hasAuthToken) {
        Write-Host "[OK] TWILIO_AUTH_TOKEN found in .env.production" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] TWILIO_AUTH_TOKEN not found in .env.production" -ForegroundColor Yellow
    }
    
    if ($hasPhoneNumber) {
        Write-Host "[OK] TWILIO_PHONE_NUMBER found in .env.production" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] TWILIO_PHONE_NUMBER not found in .env.production" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Current .env.production Twilio configuration:" -ForegroundColor Cyan
    Get-Content ".env.production" | Select-String -Pattern "TWILIO" | ForEach-Object {
        if ($_ -match "TWILIO_AUTH_TOKEN") {
            Write-Host "  TWILIO_AUTH_TOKEN=***REDACTED***" -ForegroundColor Gray
        } else {
            Write-Host "  $_" -ForegroundColor Gray
        }
    }
    
} else {
    Write-Host "[ERROR] .env.production file not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please create .env.production with:" -ForegroundColor Yellow
    Write-Host "  TWILIO_ACCOUNT_SID=$APPROVED_ACCOUNT_SID" -ForegroundColor Yellow
    Write-Host "  TWILIO_AUTH_TOKEN=your_auth_token_here" -ForegroundColor Yellow
    Write-Host "  TWILIO_PHONE_NUMBER=+18444918631" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Verify Account SID matches: $APPROVED_ACCOUNT_SID" -ForegroundColor White
Write-Host "2. Ensure Auth Token is correct (get from Twilio Console)" -ForegroundColor White
Write-Host "3. Verify Phone Number: +18444918631" -ForegroundColor White
Write-Host "4. Deploy functions: .\\deploy-prod.ps1 functions" -ForegroundColor White
Write-Host "5. Test SMS by approving a user account" -ForegroundColor White
Write-Host ""

