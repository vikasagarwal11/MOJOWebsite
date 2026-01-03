# PowerShell script to create event files archive
$ErrorActionPreference = "Stop"

# Create archive directory structure
$archiveRoot = "event-files-archive"
$archivePages = "$archiveRoot\pages"
$archiveComponents = "$archiveRoot\components\events"
$archiveRSVPComponents = "$archiveRoot\components\events\RSVPModalNew\components"
$archiveRSVPHooks = "$archiveRoot\components\events\RSVPModalNew\hooks"
$archiveHooks = "$archiveRoot\hooks"
$archiveTypes = "$archiveRoot\types"

# Create directories
New-Item -ItemType Directory -Force -Path $archiveRoot | Out-Null
New-Item -ItemType Directory -Force -Path $archivePages | Out-Null
New-Item -ItemType Directory -Force -Path $archiveComponents | Out-Null
New-Item -ItemType Directory -Force -Path $archiveRSVPComponents | Out-Null
New-Item -ItemType Directory -Force -Path $archiveRSVPHooks | Out-Null
New-Item -ItemType Directory -Force -Path $archiveHooks | Out-Null
New-Item -ItemType Directory -Force -Path $archiveTypes | Out-Null

Write-Host "Created directory structure..." -ForegroundColor Green

# Copy files
$filesToCopy = @(
    # Pages
    @{Source = "src\pages\Events.tsx"; Dest = "$archivePages\Events.tsx"},
    @{Source = "src\pages\EventDetailsPage.tsx"; Dest = "$archivePages\EventDetailsPage.tsx"},
    @{Source = "src\pages\RSVPPage.tsx"; Dest = "$archivePages\RSVPPage.tsx"},
    
    # Event Components
    @{Source = "src\components\events\EventCardNew.tsx"; Dest = "$archiveComponents\EventCardNew.tsx"},
    @{Source = "src\components\events\EventList.tsx"; Dest = "$archiveComponents\EventList.tsx"},
    @{Source = "src\components\events\EventImage.tsx"; Dest = "$archiveComponents\EventImage.tsx"},
    @{Source = "src\components\events\EventTeaserModal.tsx"; Dest = "$archiveComponents\EventTeaserModal.tsx"},
    @{Source = "src\components\events\PastEventModal.tsx"; Dest = "$archiveComponents\PastEventModal.tsx"},
    @{Source = "src\components\events\CreateEventModal.tsx"; Dest = "$archiveComponents\CreateEventModal.tsx"},
    @{Source = "src\components\events\AttendeeList.tsx"; Dest = "$archiveComponents\AttendeeList.tsx"},
    @{Source = "src\components\events\PaymentSection.tsx"; Dest = "$archiveComponents\PaymentSection.tsx"},
    @{Source = "src\components\events\QRCodeTab.tsx"; Dest = "$archiveComponents\QRCodeTab.tsx"},
    @{Source = "src\components\events\RSVPModalNew.tsx"; Dest = "$archiveComponents\RSVPModalNew.tsx"},
    
    # RSVP Modal Components
    @{Source = "src\components\events\RSVPModalNew\components\EventDetails.tsx"; Dest = "$archiveRSVPComponents\EventDetails.tsx"},
    @{Source = "src\components\events\RSVPModalNew\components\Header.tsx"; Dest = "$archiveRSVPComponents\Header.tsx"},
    @{Source = "src\components\events\RSVPModalNew\components\AttendeeInputRow.tsx"; Dest = "$archiveRSVPComponents\AttendeeInputRow.tsx"},
    @{Source = "src\components\events\RSVPModalNew\components\WhosGoingTab.tsx"; Dest = "$archiveRSVPComponents\WhosGoingTab.tsx"},
    
    # RSVP Modal Hooks
    @{Source = "src\components\events\RSVPModalNew\hooks\useEventDates.ts"; Dest = "$archiveRSVPHooks\useEventDates.ts"},
    @{Source = "src\components\events\RSVPModalNew\hooks\useCapacityState.ts"; Dest = "$archiveRSVPHooks\useCapacityState.ts"},
    @{Source = "src\components\events\RSVPModalNew\hooks\useModalA11y.ts"; Dest = "$archiveRSVPHooks\useModalA11y.ts"},
    
    # RSVP Modal Utilities
    @{Source = "src\components\events\RSVPModalNew\rsvpUi.ts"; Dest = "$archiveComponents\RSVPModalNew\rsvpUi.ts"},
    @{Source = "src\components\events\RSVPModalNew\utils.ts"; Dest = "$archiveComponents\RSVPModalNew\utils.ts"},
    
    # Hooks
    @{Source = "src\hooks\useEvents.ts"; Dest = "$archiveHooks\useEvents.ts"},
    @{Source = "src\hooks\useAttendees.ts"; Dest = "$archiveHooks\useAttendees.ts"},
    @{Source = "src\hooks\useWaitlistPositions.ts"; Dest = "$archiveHooks\useWaitlistPositions.ts"},
    
    # Types
    @{Source = "src\types\attendee.ts"; Dest = "$archiveTypes\attendee.ts"}
)

# Copy files
$copiedCount = 0
foreach ($file in $filesToCopy) {
    if (Test-Path $file.Source) {
        Copy-Item -Path $file.Source -Destination $file.Dest -Force
        $copiedCount++
        Write-Host "Copied: $($file.Source)" -ForegroundColor Gray
    } else {
        Write-Host "WARNING: File not found: $($file.Source)" -ForegroundColor Yellow
    }
}

Write-Host "`nCopied $copiedCount files" -ForegroundColor Green

# Create zip file
$zipFile = "event-rsvp-files.zip"
if (Test-Path $zipFile) {
    Remove-Item $zipFile -Force
}

Write-Host "Creating zip file: $zipFile..." -ForegroundColor Green
Compress-Archive -Path "$archiveRoot\*" -DestinationPath $zipFile -Force

Write-Host "`nArchive created successfully: $zipFile" -ForegroundColor Green
Write-Host "Total files in archive: $copiedCount + README.md" -ForegroundColor Cyan

