#!/bin/bash
# Bash script for deploying to development environment
# Usage: ./deploy-dev.sh [component]
# Components: all, hosting, firestore, functions

COMPONENT=${1:-"all"}

echo "🚀 Deploying to Development Environment..."

# Set environment variables
export NODE_ENV="development"
export VITE_ENVIRONMENT="development"

# Build the project for development
echo "📦 Building project for development..."
npm run build:dev

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Deploy based on component
case $COMPONENT in
    "hosting")
        echo "🌐 Deploying hosting only..."
        firebase deploy --only hosting --project=dev --config=firebase.dev.json
        ;;
    "firestore")
        echo "🗄️ Deploying Firestore rules and indexes..."
        firebase deploy --only firestore --project=dev --config=firebase.dev.json
        ;;
    "functions")
        echo "⚡ Deploying Cloud Functions..."
        firebase deploy --only functions --project=dev --config=firebase.dev.json
        ;;
    "all")
        echo "🚀 Deploying everything..."
        firebase deploy --project=dev --config=firebase.dev.json
        ;;
    *)
        echo "❌ Invalid component. Use: all, hosting, firestore, functions"
        exit 1
        ;;
esac

if [ $? -eq 0 ]; then
    echo "✅ Development deployment completed successfully!"
else
    echo "❌ Deployment failed!"
    exit 1
fi
