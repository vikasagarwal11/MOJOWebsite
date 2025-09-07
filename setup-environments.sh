#!/bin/bash
# Bash script to set up development and production environments
# This script helps configure Firebase projects and environment variables

echo "🚀 MOJO Website Environment Setup"
echo "================================="

# Check if Firebase CLI is installed
echo ""
echo "📋 Checking prerequisites..."

if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

FIREBASE_VERSION=$(firebase --version)
echo "✅ Firebase CLI found: $FIREBASE_VERSION"

# Check if user is logged in
echo ""
echo "🔐 Checking Firebase authentication..."

if ! firebase projects:list &> /dev/null; then
    echo "❌ Please login to Firebase first:"
    echo "   firebase login"
    exit 1
fi

echo "✅ Firebase CLI authenticated"

# List available projects
echo ""
echo "📋 Available Firebase projects:"
firebase projects:list

# Setup development project
echo ""
echo "🔧 Setting up development environment..."
read -p "Enter your development project ID (e.g., mojo-website-dev): " DEV_PROJECT
if [ ! -z "$DEV_PROJECT" ]; then
    firebase use --add $DEV_PROJECT
    firebase use $DEV_PROJECT --alias dev
    echo "✅ Development project configured: $DEV_PROJECT"
fi

# Setup production project
echo ""
echo "🔧 Setting up production environment..."
read -p "Enter your production project ID (e.g., mojo-website-prod): " PROD_PROJECT
if [ ! -z "$PROD_PROJECT" ]; then
    firebase use --add $PROD_PROJECT
    firebase use $PROD_PROJECT --alias prod
    echo "✅ Production project configured: $PROD_PROJECT"
fi

# Create environment files
echo ""
echo "📝 Creating environment configuration files..."

# Development environment
if [ -f ".env.local" ]; then
    echo "⚠️  .env.local already exists. Backing up..."
    cp .env.local .env.local.backup
fi

cp env.development .env.local
echo "✅ Created .env.local for development"

# Production environment
if [ -f ".env.production" ]; then
    echo "⚠️  .env.production already exists. Backing up..."
    cp .env.production .env.production.backup
fi

cp env.production .env.production
echo "✅ Created .env.production for production"

# Display next steps
echo ""
echo "🎉 Environment setup completed!"
echo ""
echo "📋 Next steps:"
echo "1. Update .env.local with your development Firebase configuration"
echo "2. Update .env.production with your production Firebase configuration"
echo "3. Test development deployment:"
echo "   npm run deploy:dev"
echo "4. Test production deployment:"
echo "   npm run deploy:prod"
echo ""
echo "📚 For detailed instructions, see DEPLOYMENT_GUIDE.md"

