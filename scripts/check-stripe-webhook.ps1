param(
    [string]$Project = "prod",
    [string]$Function = "stripeWebhook"
)

$ErrorActionPreference = "Stop"

Write-Host "Checking Stripe webhook function URL..." -ForegroundColor Cyan
Write-Host "  Project:  $Project"
Write-Host "  Function: $Function"

try {
    $raw = firebase --project $Project functions:list --json
    $data = $raw | ConvertFrom-Json
} catch {
    Write-Host "Failed to list functions via Firebase CLI. Make sure you're logged in and have access." -ForegroundColor Red
    throw
}

$functions =
    if ($data.functions) { $data.functions }
    elseif ($data.result -and ($data.result -is [System.Array])) { $data.result }
    elseif ($data.result -and $data.result.functions) { $data.result.functions }
    elseif ($data.payload -and $data.payload.functions) { $data.payload.functions }
    elseif ($data -is [System.Array]) { $data }
    else { @() }

if (-not $functions -or $functions.Count -eq 0) {
    Write-Host "No functions found for project '$Project' via JSON output." -ForegroundColor Yellow
    Write-Host "Attempting fallback parsing from non-JSON output..." -ForegroundColor Yellow

    $text = firebase --project $Project functions:list 2>$null
    $url = ($text | Select-String -Pattern "https://[^\s]+" | Select-Object -First 1).Matches.Value
    if ($url) {
        Write-Host ""
        Write-Host "Stripe Webhook Endpoint URL:" -ForegroundColor Green
        Write-Host "  $url"
        Write-Host ""
        Write-Host "Paste this into Stripe → Developers → Webhooks → Add endpoint." -ForegroundColor Green
        exit 0
    }

    Write-Host "No functions found for project '$Project'." -ForegroundColor Yellow
    exit 1
}

$match = $functions | Where-Object {
    $_.name -match $Function -or
    $_.id -eq $Function -or
    $_.entryPoint -eq $Function -or
    $_.name -eq $Function
} | Select-Object -First 1

if (-not $match) {
    Write-Host "Function '$Function' not found in project '$Project'." -ForegroundColor Red
    exit 1
}

$url =
    if ($match.url) { $match.url }
    elseif ($match.uri) { $match.uri }
    elseif ($match.httpsTrigger -and $match.httpsTrigger.url) { $match.httpsTrigger.url }
    else { $null }

if (-not $url) {
    Write-Host "Found function, but no HTTPS URL was returned by the CLI." -ForegroundColor Yellow
    Write-Host "Open Firebase Console → Functions → $Function → Trigger URL." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Stripe Webhook Endpoint URL:" -ForegroundColor Green
Write-Host "  $url"
Write-Host ""
Write-Host "Paste this into Stripe → Developers → Webhooks → Add endpoint." -ForegroundColor Green
