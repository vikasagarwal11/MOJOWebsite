# =============================================================================
# Cloud Tasks Queue Setup Script
# =============================================================================
#
# This script sets up the Cloud Tasks queue required for Phase 3:
# Progressive Quality Generation (background video processing)
#
# The queue is used to process 1080p and 4K video generation in the background
# after 720p is ready, preventing timeouts and improving reliability.
#
# =============================================================================
# USAGE
# =============================================================================
#
# .\scripts\setup-cloud-tasks-queue.ps1
#
# Or manually:
# gcloud tasks queues create video-quality-generation \
#   --location=us-central1 \
#   --project=momsfitnessmojo-65d00 \
#   --max-attempts=3 \
#   --max-retry-duration=3600s \
#   --max-dispatches-per-second=10 \
#   --max-concurrent-dispatches=5
#
# =============================================================================

param(
    [string]$ProjectId = "momsfitnessmojo-65d00",
    [string]$Location = "us-central1",
    [string]$QueueName = "video-quality-generation"
)

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Cloud Tasks Queue Setup" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Project: $ProjectId" -ForegroundColor White
Write-Host "  Location: $Location" -ForegroundColor White
Write-Host "  Queue Name: $QueueName" -ForegroundColor White
Write-Host ""

# Check if gcloud is installed
Write-Host "Checking gcloud CLI..." -ForegroundColor Yellow
try {
    $gcloudVersion = gcloud version --format="value(Google Cloud SDK)" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] gcloud CLI found" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] gcloud CLI not found or not working" -ForegroundColor Red
        Write-Host "Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "[ERROR] gcloud CLI not found" -ForegroundColor Red
    Write-Host "Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

# Check if authenticated
Write-Host "Checking authentication..." -ForegroundColor Yellow
try {
    $account = gcloud config get-value account 2>&1
    if ($LASTEXITCODE -eq 0 -and $account -and $account -ne "") {
        Write-Host "[OK] Authenticated as: $account" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Not authenticated. Please run: gcloud auth login" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERROR] Authentication check failed" -ForegroundColor Red
    exit 1
}

# Check if queue exists
Write-Host ""
Write-Host "Checking if queue exists..." -ForegroundColor Yellow
$queueExists = $false
try {
    $queueInfo = gcloud tasks queues describe $QueueName --location=$Location --project=$ProjectId 2>&1
    if ($LASTEXITCODE -eq 0) {
        $queueExists = $true
        Write-Host "[OK] Queue '$QueueName' already exists" -ForegroundColor Green
        Write-Host ""
        Write-Host "Queue Details:" -ForegroundColor Cyan
        Write-Host $queueInfo -ForegroundColor White
        Write-Host ""
        Write-Host "Queue is ready to use!" -ForegroundColor Green
        exit 0
    }
} catch {
    # Queue doesn't exist, will create it
    Write-Host "[INFO] Queue does not exist, will create it" -ForegroundColor Yellow
}

# Create queue if it doesn't exist
if (-not $queueExists) {
    Write-Host ""
    Write-Host "Creating Cloud Tasks queue..." -ForegroundColor Yellow
    Write-Host "  Name: $QueueName" -ForegroundColor White
    Write-Host "  Location: $Location" -ForegroundColor White
    Write-Host "  Project: $ProjectId" -ForegroundColor White
    Write-Host ""
    Write-Host "Queue Configuration:" -ForegroundColor Cyan
    Write-Host "  Max attempts: 3" -ForegroundColor White
    Write-Host "  Max retry duration: 3600s (1 hour)" -ForegroundColor White
    Write-Host "  Max dispatches/sec: 10" -ForegroundColor White
    Write-Host "  Max concurrent: 5" -ForegroundColor White
    Write-Host ""
    
    try {
        gcloud tasks queues create $QueueName `
            --location=$Location `
            --project=$ProjectId `
            --max-attempts=3 `
            --max-retry-duration=3600s `
            --max-dispatches-per-second=10 `
            --max-concurrent-dispatches=5
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "[OK] Queue created successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Verifying queue..." -ForegroundColor Yellow
            $verifyQueue = gcloud tasks queues describe $QueueName --location=$Location --project=$ProjectId 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[OK] Queue verified" -ForegroundColor Green
                Write-Host ""
                Write-Host $verifyQueue -ForegroundColor White
            }
            Write-Host ""
            Write-Host "=========================================" -ForegroundColor Green
            Write-Host "SUCCESS: Cloud Tasks queue is ready!" -ForegroundColor Green
            Write-Host "=========================================" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "[ERROR] Failed to create queue" -ForegroundColor Red
            Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
            Write-Host ""
            Write-Host "Common issues:" -ForegroundColor Yellow
            Write-Host "  1. Insufficient permissions (need Cloud Tasks Admin)" -ForegroundColor White
            Write-Host "  2. Cloud Tasks API not enabled" -ForegroundColor White
            Write-Host "  3. Project billing not enabled" -ForegroundColor White
            Write-Host ""
            Write-Host "Manual creation command:" -ForegroundColor Yellow
            Write-Host "gcloud tasks queues create $QueueName --location=$Location --project=$ProjectId --max-attempts=3 --max-retry-duration=3600s" -ForegroundColor Gray
            exit 1
        }
    } catch {
        Write-Host ""
        Write-Host "[ERROR] Exception creating queue: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Manual creation command:" -ForegroundColor Yellow
        Write-Host "gcloud tasks queues create $QueueName --location=$Location --project=$ProjectId --max-attempts=3 --max-retry-duration=3600s" -ForegroundColor Gray
        exit 1
    }
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "Setup Complete" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green


