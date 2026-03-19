$ErrorActionPreference = "Stop"

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
