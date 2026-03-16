@echo off
echo 🚀 Deploying OTP Functions...
echo.

REM Check if functions/.env exists
if not exist "functions\.env" (
    echo ❌ Error: functions/.env not found!
    echo Please create functions/.env with Twilio credentials
    exit /b 1
)

REM Build functions
echo 📦 Building functions...
cd functions
call npm run build
if errorlevel 1 (
    echo ❌ Build failed!
    exit /b 1
)
cd ..

REM Deploy functions
echo.
echo 🚀 Deploying to Firebase...
firebase deploy --only functions:sendGuestOTP,functions:verifyGuestOTP

if errorlevel 0 (
    echo.
    echo ✅ Deployment successful!
    echo.
    echo Next steps:
    echo 1. Refresh your browser (Ctrl+Shift+R^)
    echo 2. Submit guest RSVP
    echo 3. OTP modal should appear
    echo 4. Check your phone for the code
) else (
    echo.
    echo ❌ Deployment failed!
    echo Check the error messages above
)

pause
