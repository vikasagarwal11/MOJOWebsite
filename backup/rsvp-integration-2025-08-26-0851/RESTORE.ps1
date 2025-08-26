# RSVP Integration Backup Restore Script
# Run this script to restore files from backup

Write-Host "🔄 RSVP Integration Backup Restore Script" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# Get the backup directory
$backupDir = Split-Path $MyInvocation.MyCommand.Path
$projectRoot = Split-Path (Split-Path $backupDir)

Write-Host "Backup Directory: $backupDir" -ForegroundColor Yellow
Write-Host "Project Root: $projectRoot" -ForegroundColor Yellow

# Function to restore a single file
function Restore-File {
    param(
        [string]$BackupFile,
        [string]$TargetPath
    )
    
    $backupPath = Join-Path $backupDir $BackupFile
    $fullTargetPath = Join-Path $projectRoot $TargetPath
    
    if (Test-Path $backupPath) {
        try {
            # Create target directory if it doesn't exist
            $targetDir = Split-Path $fullTargetPath -Parent
            if (!(Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            
            Copy-Item $backupPath $fullTargetPath -Force
            Write-Host "✅ Restored: $TargetPath" -ForegroundColor Green
        }
        catch {
            Write-Host "❌ Failed to restore: $TargetPath" -ForegroundColor Red
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    else {
        Write-Host "❌ Backup file not found: $BackupFile" -ForegroundColor Red
    }
}

# Function to restore all files
function Restore-AllFiles {
    Write-Host "`n🔄 Restoring all files from backup..." -ForegroundColor Cyan
    
    Restore-File "EventCard.tsx.backup" "src/components/events/EventCard.tsx"
    Restore-File "RSVPDrawer.tsx.backup" "src/components/events/RSVPDrawer.tsx"
    Restore-File "EventFormModal.tsx.backup" "src/components/events/EventFormModal.tsx"
    Restore-File "useEvents.ts.backup" "src/hooks/useEvents.ts"
    Restore-File "rsvp.ts.backup" "src/types/rsvp.ts"
    Restore-File "firestore.rules.backup" "firestore.rules"
    Restore-File "Events.tsx.backup" "src/pages/Events.tsx"
    
    Write-Host "`n✅ All files restored successfully!" -ForegroundColor Green
}

# Function to restore specific file
function Restore-SpecificFile {
    param(
        [Parameter(Mandatory=$true)]
        [string]$FileName
    )
    
    Write-Host "🔄 Restoring specific file: $FileName" -ForegroundColor Cyan
    
    switch ($FileName.ToLower()) {
        "eventcard" { Restore-File "EventCard.tsx.backup" "src/components/events/EventCard.tsx" }
        "rsvpdrawer" { Restore-File "RSVPDrawer.tsx.backup" "src/components/events/RSVPDrawer.tsx" }
        "eventformmodal" { Restore-File "EventFormModal.tsx.backup" "src/components/events/EventFormModal.tsx" }
        "useevents" { Restore-File "useEvents.ts.backup" "src/hooks/useEvents.ts" }
        "rsvp" { Restore-File "rsvp.ts.backup" "src/types/rsvp.ts" }
        "firestorerules" { Restore-File "firestore.rules.backup" "firestore.rules" }
        "events" { Restore-File "Events.tsx.backup" "src/pages/Events.tsx" }
        default { Write-Host "❌ Unknown file: $FileName" -ForegroundColor Red }
    }
}

# Main menu
Write-Host "`nChoose an option:" -ForegroundColor White
Write-Host "1. Restore all files" -ForegroundColor Cyan
Write-Host "2. Restore specific file" -ForegroundColor Cyan
Write-Host "3. List backup files" -ForegroundColor Cyan
Write-Host "4. Exit" -ForegroundColor Cyan

$choice = Read-Host "`nEnter your choice (1-4)"

switch ($choice) {
    "1" { Restore-AllFiles }
    "2" { 
        $fileName = Read-Host "Enter file name (eventcard, rsvpdrawer, eventformmodal, useevents, rsvp, firestorerules, events)"
        Restore-SpecificFile $fileName
    }
    "3" { 
        Write-Host "`n📁 Available backup files:" -ForegroundColor Yellow
        Get-ChildItem $backupDir "*.backup" | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor White }
    }
    "4" { Write-Host "👋 Goodbye!" -ForegroundColor Green; exit }
    default { Write-Host "❌ Invalid choice. Please run the script again." -ForegroundColor Red }
}

Write-Host "`n📋 Restore complete! Check the restored files and test functionality." -ForegroundColor Green
Write-Host "💡 Remember: You can also use git commands to rollback changes." -ForegroundColor Yellow
