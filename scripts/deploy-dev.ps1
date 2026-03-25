$ErrorActionPreference = "Stop"

$ExpectedProjectId = "momsfitnessmojo-dev"

function Get-EnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) { return $null }
  $line = Get-Content $Path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$Key\s*=\s*", "") -replace "^\s+|\s+$", ""
}

function Assert-Equals {
  param([string]$Label, [string]$Actual, [string]$Expected)
  if ($Actual -ne $Expected) {
    throw "$Label mismatch. Expected '$Expected', got '$Actual'."
  }
}

Write-Host "==> Preflight checks (dev)..."

# Ensure firebase project alias points to the right dev project
$firebaserc = Get-Content ".firebaserc" -Raw | ConvertFrom-Json
$devProject = $firebaserc.projects.dev
Assert-Equals "Firebase project alias 'dev'" $devProject $ExpectedProjectId

# Ensure .env is correct
$envDevPath = ".env"
$envProjectId = Get-EnvValue $envDevPath "VITE_FIREBASE_PROJECT_ID"
Assert-Equals "VITE_FIREBASE_PROJECT_ID in .env" $envProjectId $ExpectedProjectId

$envAuthDomain = Get-EnvValue $envDevPath "VITE_FIREBASE_AUTH_DOMAIN"
if ($envAuthDomain -notlike "$ExpectedProjectId*") {
  throw "VITE_FIREBASE_AUTH_DOMAIN in .env should start with '$ExpectedProjectId'. Got '$envAuthDomain'."
}

# Block accidental overrides from shell env vars
if ($env:VITE_FIREBASE_PROJECT_ID -and $env:VITE_FIREBASE_PROJECT_ID -ne $ExpectedProjectId) {
  throw "Shell env VITE_FIREBASE_PROJECT_ID is '$($env:VITE_FIREBASE_PROJECT_ID)'. Refusing to deploy dev."
}

# Force development flags for the build
$env:VITE_ENVIRONMENT = "development"

Write-Host "==> Preflight checks passed."

Write-Host "==> Building frontend (dev)..."
Write-Host ">> npm run build:dev"
npm run build:dev

Write-Host "==> Building functions..."
Write-Host ">> Push-Location functions"
Push-Location "functions"
Write-Host ">> npm run build"
npm run build
Write-Host ">> Pop-Location"
Pop-Location

Write-Host "==> Deploying hosting, functions, rules, indexes (dev)..."
Write-Host ">> firebase --project dev deploy --only ""hosting:momsfitnessmojo-dev,functions,firestore:rules,firestore:indexes"""
firebase --project dev deploy --only "hosting:momsfitnessmojo-dev,functions,firestore:rules,firestore:indexes"

Write-Host "==> Done."
