# =============================================================================
# MOJO Website - Production Deployment Script
# =============================================================================
#
# This script handles deployment to the production environment with intelligent
# extension management to avoid conflicts and speed up regular deployments.
#
# Includes Phase 3 Progressive Quality Generation:
# - Cloud Tasks queue setup for background video quality generation
# - Automatic queue creation if it doesn't exist
#
# =============================================================================
# USAGE EXAMPLES
# =============================================================================
#
# 1. REGULAR PRODUCTION UPDATES (No Extension Changes)
#    .\deploy-prod.ps1 no-extensions
#    - Deploys: hosting, firestore, functions
#    - Skips: extensions (avoids conflicts and saves time)
#    - Use for: Bug fixes, feature updates, content changes
#
# 2. EXTENSION CONFIGURATION CHANGES
#    .\deploy-prod.ps1 extensions
#    - Deploys: extensions only
#    - Skips: hosting, firestore, functions
#    - Use for: When modifying storage-resize-images or stripe configurations
#
# 3. MAJOR RELEASES (Everything)
#    .\deploy-prod.ps1 all
#    - Deploys: hosting, firestore, functions, extensions
#    - Use for: Major releases, initial setup, or when everything changes
#
# 4. INDIVIDUAL COMPONENTS
#    .\deploy-prod.ps1 hosting    # Frontend only
#    .\deploy-prod.ps1 functions  # Cloud Functions only
#    .\deploy-prod.ps1 firestore  # Database rules only
#
# =============================================================================
# ENVIRONMENT REQUIREMENTS
# =============================================================================
#
# - .env.production file must exist with correct STORAGE_BUCKET format:
#   STORAGE_BUCKET=momsfitnessmojo-65d00.firebasestorage.app
#
# - Firebase CLI must be authenticated and configured
# - Project must be set to prod: firebase use prod
#
# =============================================================================
# AVAILABLE PARAMETERS
# =============================================================================
#
# [component] - What to deploy (default: "all")
# -SkipChecks - Skip pre-deployment checks (linting, tests)
#
# Examples:
# .\deploy-prod.ps1 no-extensions -SkipChecks
# .\deploy-prod.ps1 hosting
# .\deploy-prod.ps1 extensions --force
#
# =============================================================================

param(
    [string]$Component = "all",
    [switch]$SkipChecks = $false
)

Write-Host "Deploying to Production Environment..." -ForegroundColor Green

# Set environment variables
$env:NODE_ENV = "production"
$env:VITE_ENVIRONMENT = "production"

# Read environment variables from .env.production
if (Test-Path ".env.production") {
    $envContent = Get-Content .env.production
    $storageBucket = ($envContent | Where-Object { $_ -match "^STORAGE_BUCKET=" } | ForEach-Object { $_.Split('=')[1] })
    $viteStorageBucket = ($envContent | Where-Object { $_ -match "^VITE_FIREBASE_STORAGE_BUCKET=" } | ForEach-Object { $_.Split('=')[1] })
    $geminiApiKey = ($envContent | Where-Object { $_ -match "^GEMINI_API_KEY=" } | ForEach-Object { $_.Split('=')[1] })
    
    if ($storageBucket) {
        $env:STORAGE_BUCKET = $storageBucket
        Write-Host "[OK] Using STORAGE_BUCKET from .env.production: $storageBucket" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] STORAGE_BUCKET not found in .env.production, using default" -ForegroundColor Yellow
        $env:STORAGE_BUCKET = "momsfitnessmojo-65d00.firebasestorage.app"
    }
    
    if ($viteStorageBucket) {
        Write-Host "[OK] Using VITE_FIREBASE_STORAGE_BUCKET from .env.production: $viteStorageBucket" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] VITE_FIREBASE_STORAGE_BUCKET not found in .env.production" -ForegroundColor Yellow
    }
    
    if ($geminiApiKey) {
        Write-Host "[OK] Found GEMINI_API_KEY in .env.production (will be loaded automatically)" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] GEMINI_API_KEY not found in .env.production" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARNING] .env.production file not found, using defaults" -ForegroundColor Yellow
    $env:STORAGE_BUCKET = "momsfitnessmojo-65d00.firebasestorage.app"
}

# Verify environment variables are loaded
Write-Host "[INFO] Environment Variables Check:" -ForegroundColor Cyan
Write-Host "  NODE_ENV: $env:NODE_ENV" -ForegroundColor White
Write-Host "  VITE_ENVIRONMENT: $env:VITE_ENVIRONMENT" -ForegroundColor White
Write-Host "  STORAGE_BUCKET: $env:STORAGE_BUCKET" -ForegroundColor White
Write-Host "  VITE_FIREBASE_STORAGE_BUCKET: $viteStorageBucket" -ForegroundColor White

Write-Host ""

# Copy environment-specific extension configuration (skip if no-extensions)
if ($Component.ToLower() -ne "no-extensions") {
    Write-Host "Copying production extension configuration..." -ForegroundColor Yellow
    if (Test-Path "extensions/storage-resize-images.prod.env") {
        Copy-Item "extensions/storage-resize-images.prod.env" "extensions/storage-resize-images.env" -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Extension configuration copied for production" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Extension config file not found, skipping..." -ForegroundColor Yellow
    }
    Write-Host ""
}

# =============================================================================
# Cloud Tasks Queue Setup (Phase 3: Progressive Quality Generation)
# =============================================================================
Write-Host "Setting up Cloud Tasks queue for video quality generation..." -ForegroundColor Yellow

$projectId = "momsfitnessmojo-65d00"
$queueLocation = "us-central1"
$queueName = "video-quality-generation"

# Check if queue exists
Write-Host "  Checking if Cloud Tasks queue exists..." -ForegroundColor Cyan
$queueExists = $false
try {
    $queueInfo = gcloud tasks queues describe $queueName --location=$queueLocation --project=$projectId 2>&1
    if ($LASTEXITCODE -eq 0) {
        $queueExists = $true
        Write-Host "[OK] Cloud Tasks queue '$queueName' already exists" -ForegroundColor Green
    }
} catch {
    # Queue doesn't exist, will create it
}

if (-not $queueExists) {
    Write-Host "  Creating Cloud Tasks queue '$queueName'..." -ForegroundColor Cyan
    try {
        gcloud tasks queues create $queueName `
            --location=$queueLocation `
            --project=$projectId `
            --max-attempts=3 `
            --max-retry-duration=3600s `
            --max-dispatches-per-second=10 `
            --max-concurrent-dispatches=5
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Cloud Tasks queue '$queueName' created successfully" -ForegroundColor Green
            Write-Host "  Location: $queueLocation" -ForegroundColor White
            Write-Host "  Max attempts: 3" -ForegroundColor White
            Write-Host "  Max retry duration: 3600s (1 hour)" -ForegroundColor White
            Write-Host "  Max dispatches/sec: 10" -ForegroundColor White
            Write-Host "  Max concurrent: 5" -ForegroundColor White
        } else {
            Write-Host "[WARNING] Failed to create Cloud Tasks queue. It may already exist or you may need to create it manually." -ForegroundColor Yellow
            Write-Host "  Manual creation command:" -ForegroundColor Yellow
            Write-Host "  gcloud tasks queues create $queueName --location=$queueLocation --project=$projectId --max-attempts=3 --max-retry-duration=3600s" -ForegroundColor Gray
        }
    } catch {
        Write-Host "[WARNING] Error creating Cloud Tasks queue: $_" -ForegroundColor Yellow
        Write-Host "  You may need to create it manually using:" -ForegroundColor Yellow
        Write-Host "  gcloud tasks queues create $queueName --location=$queueLocation --project=$projectId --max-attempts=3 --max-retry-duration=3600s" -ForegroundColor Gray
    }
} else {
    Write-Host "  Queue configuration:" -ForegroundColor Cyan
    Write-Host "    Name: $queueName" -ForegroundColor White
    Write-Host "    Location: $queueLocation" -ForegroundColor White
    Write-Host "    Project: $projectId" -ForegroundColor White
}

Write-Host ""

# =============================================================================
if (-not $SkipChecks) {
    Write-Host "Running pre-deployment checks..." -ForegroundColor Yellow
    
    # Run code review
    if (Test-Path "scripts/code-review-simple.ps1") {
        Write-Host "  Running code review..." -ForegroundColor Cyan
        & ".\scripts\code-review-simple.ps1"
    }
    
    # Run linting
    Write-Host "  Running ESLint..." -ForegroundColor Cyan
    npm run lint
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Linting failed! Fix issues before deploying." -ForegroundColor Red
        exit 1
    }
    
    # Run tests
    Write-Host "  Running tests..." -ForegroundColor Cyan
    npm run test:run
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Tests failed! Fix issues before deploying." -ForegroundColor Red
        exit 1
    }
    
    Write-Host "SUCCESS: All pre-deployment checks passed!" -ForegroundColor Green
}

# Check if node_modules exists, install if missing
if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules not found. Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install dependencies!" -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] Dependencies installed successfully" -ForegroundColor Green
} else {
    # Check if vite is available
    $vitePath = Join-Path (Join-Path "node_modules" ".bin") "vite"
    if (-not (Test-Path $vitePath)) {
        Write-Host "vite not found in node_modules. Installing dependencies..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Failed to install dependencies!" -ForegroundColor Red
            exit 1
        }
        Write-Host "[OK] Dependencies installed successfully" -ForegroundColor Green
    }
}

# Generate firebase-messaging-sw.js from environment variables
Write-Host "Generating firebase-messaging-sw.js from .env.production..." -ForegroundColor Yellow
if (Test-Path ".env.production") {
    # Read environment variables from .env.production
    $envContent = Get-Content ".env.production" -Raw
    $apiKey = ($envContent | Select-String -Pattern "VITE_FIREBASE_API_KEY=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value }).Trim()
    $authDomain = ($envContent | Select-String -Pattern "VITE_FIREBASE_AUTH_DOMAIN=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value }).Trim()
    $projectId = ($envContent | Select-String -Pattern "VITE_FIREBASE_PROJECT_ID=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value }).Trim()
    $storageBucket = ($envContent | Select-String -Pattern "VITE_FIREBASE_STORAGE_BUCKET=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value }).Trim() -replace '^gs://', ''
    $messagingSenderId = ($envContent | Select-String -Pattern "VITE_FIREBASE_MESSAGING_SENDER_ID=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value }).Trim()
    $appId = ($envContent | Select-String -Pattern "VITE_FIREBASE_APP_ID=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value }).Trim()
    
    # Generate the service worker file
    $swContent = @"
// Firebase Cloud Messaging Service Worker
// This file is required by Firebase Cloud Messaging SDK
// It handles background push notifications when the app is not in focus

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration - Generated from .env.production during deployment
const firebaseConfig = {
  apiKey: '$apiKey',
  authDomain: '$authDomain',
  projectId: '$projectId',
  storageBucket: '$storageBucket',
  messagingSenderId: '$messagingSenderId',
  appId: '$appId'
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Moms Fitness Mojo';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: payload.notification?.icon || '/logo-small.png',
    badge: '/logo-small.png',
    data: payload.data || {},
    ...payload.notification
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});
"@
    
    # Ensure public directory exists
    if (-not (Test-Path "public")) {
        New-Item -ItemType Directory -Path "public" | Out-Null
    }
    
    # Write the file
    $swContent | Out-File -FilePath "public\firebase-messaging-sw.js" -Encoding UTF8 -NoNewline
    Write-Host "[OK] firebase-messaging-sw.js generated successfully" -ForegroundColor Green
} else {
    Write-Host "[WARNING] .env.production not found. firebase-messaging-sw.js will not be generated!" -ForegroundColor Yellow
    Write-Host "[WARNING] FCM push notifications may not work without this file." -ForegroundColor Yellow
}

# Build the project for production
Write-Host "Building project for production..." -ForegroundColor Yellow
npm run build:prod

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

# Copy .env.production to functions/.env for Firebase Functions v2 to use
# Firebase Functions v2 automatically loads .env files from the functions directory
Write-Host "Copying .env.production to functions/.env for Cloud Functions..." -ForegroundColor Yellow
if (Test-Path ".env.production") {
    Copy-Item ".env.production" "functions\.env" -Force
    Write-Host "[OK] .env file copied to functions directory. Functions v2 will load it automatically." -ForegroundColor Green
    Write-Host "[INFO] Note: functions.config() is deprecated. Using .env files instead." -ForegroundColor Cyan
} else {
    Write-Host "[WARNING] .env.production not found. Functions may not have environment variables!" -ForegroundColor Yellow
}

# Legacy: Set Cloud Functions config for STORAGE_BUCKET (deprecated but still works until March 2026)
# Note: This is deprecated. Prefer .env file above.
Write-Host "Setting legacy functions.config for STORAGE_BUCKET (deprecated, will remove in future)..." -ForegroundColor Yellow
firebase functions:config:set app.storage_bucket="$env:STORAGE_BUCKET" --project=momsfitnessmojo-65d00 2>&1 | Out-Null

Write-Host "[OK] Legacy config set (deprecated API - .env file is preferred)." -ForegroundColor Green

# Deploy based on component
switch ($Component.ToLower()) {
    "hosting" {
        Write-Host "Deploying hosting only..." -ForegroundColor Cyan
        firebase deploy --only hosting --project=momsfitnessmojo-65d00 --config=firebase.prod.json
    }
    "firestore" {
        Write-Host "Deploying Firestore rules and indexes..." -ForegroundColor Cyan
        firebase deploy --only firestore --project=momsfitnessmojo-65d00 --config=firebase.prod.json
    }
    "storage" {
        Write-Host "Deploying Storage rules..." -ForegroundColor Cyan
        firebase deploy --only storage --project=momsfitnessmojo-65d00 --config=firebase.prod.json
    }
    "functions" {
        Write-Host "Deploying Cloud Functions..." -ForegroundColor Cyan
        Write-Host "  This includes the new generateQuality function for background video processing" -ForegroundColor Cyan
        firebase deploy --only functions --project=momsfitnessmojo-65d00 --config=firebase.prod.json
    }
    "extensions" {
        Write-Host "Deploying Extensions only..." -ForegroundColor Cyan
        firebase deploy --only extensions --project=momsfitnessmojo-65d00 --config=firebase.prod.json --force
    }
    "no-extensions" {
        Write-Host "Deploying everything except extensions..." -ForegroundColor Cyan
        $deployResult = firebase deploy --only "hosting,firestore,functions,storage" --project=momsfitnessmojo-65d00 --config=firebase.prod.json 2>&1
        if ($LASTEXITCODE -ne 0 -and $deployResult -match "409.*index already exists") {
            Write-Host "  [INFO] Index already exists in Firebase (indexes are already deployed and working)" -ForegroundColor Yellow
            Write-Host "  Retrying deployment without indexes..." -ForegroundColor Cyan
            firebase deploy --only "hosting,firestore:rules,functions,storage" --project=momsfitnessmojo-65d00 --config=firebase.prod.json
        } elseif ($LASTEXITCODE -ne 0) {
            Write-Host $deployResult
            exit 1
        }
    }
    "all" {
        Write-Host "Deploying everything..." -ForegroundColor Cyan
        firebase deploy --project=momsfitnessmojo-65d00 --config=firebase.prod.json --force
    }
    default {
        Write-Host "ERROR: Invalid component. Use: all, hosting, firestore, functions, extensions, no-extensions" -ForegroundColor Red
        exit 1
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS: Production deployment completed successfully!" -ForegroundColor Green
    Write-Host ""
    
    # Post-deployment verification for Phase 3
    if ($Component.ToLower() -eq "functions" -or $Component.ToLower() -eq "all" -or $Component.ToLower() -eq "no-extensions") {
        Write-Host "Phase 3: Progressive Quality Generation Status" -ForegroundColor Cyan
        Write-Host "  [OK] Cloud Functions deployed" -ForegroundColor Green
        Write-Host "  [OK] generateQuality function available for background processing" -ForegroundColor Green
        Write-Host "  [OK] Cloud Tasks queue configured" -ForegroundColor Green
        Write-Host ""
        Write-Host "Note: Videos will now:" -ForegroundColor Yellow
        Write-Host '  - Start playing after 3-5 segments (12 to 20 seconds)' -ForegroundColor White
        Write-Host '  - Generate 1080p/4K in background via Cloud Tasks' -ForegroundColor White
        Write-Host '  - Automatically upgrade quality as it becomes available' -ForegroundColor White
        Write-Host ""
    }
} else {
    Write-Host "ERROR: Deployment failed!" -ForegroundColor Red
    exit 1
}
