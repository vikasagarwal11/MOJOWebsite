$ErrorActionPreference = "Stop"

$ExpectedProjectId = "momsfitnessmojo-65d00"

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

Write-Host "==> Preflight checks (prod)..."

# Ensure firebase project alias points to the right prod project
$firebaserc = Get-Content ".firebaserc" -Raw | ConvertFrom-Json
$prodProject = $firebaserc.projects.prod
Assert-Equals "Firebase project alias 'prod'" $prodProject $ExpectedProjectId

# Ensure .env.production is correct
$envProdPath = ".env.production"
$envProjectId = Get-EnvValue $envProdPath "VITE_FIREBASE_PROJECT_ID"
Assert-Equals "VITE_FIREBASE_PROJECT_ID in .env.production" $envProjectId $ExpectedProjectId

$envAuthDomain = Get-EnvValue $envProdPath "VITE_FIREBASE_AUTH_DOMAIN"
if ($envAuthDomain -notlike "$ExpectedProjectId*") {
  throw "VITE_FIREBASE_AUTH_DOMAIN in .env.production should start with '$ExpectedProjectId'. Got '$envAuthDomain'."
}

# Block accidental overrides from shell env vars
if ($env:VITE_FIREBASE_PROJECT_ID -and $env:VITE_FIREBASE_PROJECT_ID -ne $ExpectedProjectId) {
  throw "Shell env VITE_FIREBASE_PROJECT_ID is '$($env:VITE_FIREBASE_PROJECT_ID)'. Refusing to deploy prod."
}

# Force production flags for the build
$env:VITE_ENVIRONMENT = "production"

Write-Host "==> Preflight checks passed."

Write-Host "==> Building frontend (prod)..."
Write-Host ">> npm run build"
npm run build

Write-Host "==> Building functions..."
Write-Host ">> Push-Location functions"
Push-Location "functions"
Write-Host ">> npm run build"
npm run build
Write-Host ">> Pop-Location"
Pop-Location

Write-Host "==> Deploying hosting, functions, rules, indexes (prod)..."
Write-Host ">> firebase --project prod deploy --only ""hosting:momsfitnessmojo-65d00,functions,firestore:rules,firestore:indexes"""
firebase --project prod deploy --only "hosting:momsfitnessmojo-65d00,functions,firestore:rules,firestore:indexes"

Write-Host "==> Done."
