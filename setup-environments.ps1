# PowerShell script to set up development and production environments
# This script helps configure Firebase projects and environment variables

Write-Host "🚀 MOJO Website Environment Setup" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green

# Check if Firebase CLI is installed
Write-Host "`n📋 Checking prerequisites..." -ForegroundColor Yellow

try {
    $firebaseVersion = firebase --version
    Write-Host "✅ Firebase CLI found: $firebaseVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Firebase CLI not found. Please install it first:" -ForegroundColor Red
    Write-Host "   npm install -g firebase-tools" -ForegroundColor Cyan
    exit 1
}

# Check if user is logged in
Write-Host "`n🔐 Checking Firebase authentication..." -ForegroundColor Yellow
try {
    firebase projects:list | Out-Null
    Write-Host "✅ Firebase CLI authenticated" -ForegroundColor Green
} catch {
    Write-Host "❌ Please login to Firebase first:" -ForegroundColor Red
    Write-Host "   firebase login" -ForegroundColor Cyan
    exit 1
}

# List available projects
Write-Host "`n📋 Available Firebase projects:" -ForegroundColor Yellow
firebase projects:list

# Setup development project
Write-Host "`n🔧 Setting up development environment..." -ForegroundColor Yellow
$devProject = Read-Host "Enter your development project ID (e.g., mojo-website-dev)"
if ($devProject) {
    firebase use --add $devProject
    firebase use $devProject --alias dev
    Write-Host "✅ Development project configured: $devProject" -ForegroundColor Green
}

# Setup production project
Write-Host "`n🔧 Setting up production environment..." -ForegroundColor Yellow
$prodProject = Read-Host "Enter your production project ID (e.g., mojo-website-prod)"
if ($prodProject) {
    firebase use --add $prodProject
    firebase use $prodProject --alias prod
    Write-Host "✅ Production project configured: $prodProject" -ForegroundColor Green
}

# Create environment files
Write-Host "`n📝 Creating environment configuration files..." -ForegroundColor Yellow

# Development environment
if (Test-Path ".env.local") {
    Write-Host "⚠️  .env.local already exists. Backing up..." -ForegroundColor Yellow
    Copy-Item ".env.local" ".env.local.backup"
}

Copy-Item "env.development" ".env.local"
Write-Host "✅ Created .env.local for development" -ForegroundColor Green

# Production environment
if (Test-Path ".env.production") {
    Write-Host "⚠️  .env.production already exists. Backing up..." -ForegroundColor Yellow
    Copy-Item ".env.production" ".env.production.backup"
}

Copy-Item "env.production" ".env.production"
Write-Host "✅ Created .env.production for production" -ForegroundColor Green

# Display next steps
Write-Host "`n🎉 Environment setup completed!" -ForegroundColor Green
Write-Host "`n📋 Next steps:" -ForegroundColor Yellow
Write-Host "1. Update .env.local with your development Firebase configuration" -ForegroundColor White
Write-Host "2. Update .env.production with your production Firebase configuration" -ForegroundColor White
Write-Host "3. Test development deployment:" -ForegroundColor White
Write-Host "   npm run deploy:dev" -ForegroundColor Cyan
Write-Host "4. Test production deployment:" -ForegroundColor White
Write-Host "   npm run deploy:prod" -ForegroundColor Cyan

Write-Host "`n📚 For detailed instructions, see the docs/ directory" -ForegroundColor Yellow

