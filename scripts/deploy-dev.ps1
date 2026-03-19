$ErrorActionPreference = "Stop"

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
