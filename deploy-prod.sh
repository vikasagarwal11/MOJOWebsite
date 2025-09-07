#!/bin/bash
# Bash script for deploying to production environment
# Usage: ./deploy-prod.sh [component]
# Components: all, hosting, firestore, functions

COMPONENT=${1:-"all"}

echo "🚀 Deploying to Production Environment..."

# Set environment variables
export NODE_ENV="production"
export VITE_ENVIRONMENT="production"

# Build the project for production
echo "📦 Building project for production..."
npm run build:prod

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Deploy based on component
case $COMPONENT in
    "hosting")
        echo "🌐 Deploying hosting only..."
        firebase deploy --only hosting --project=prod --config=firebase.prod.json
        ;;
    "firestore")
        echo "🗄️ Deploying Firestore rules and indexes..."
        firebase deploy --only firestore --project=prod --config=firebase.prod.json
        ;;
    "functions")
        echo "⚡ Deploying Cloud Functions..."
        firebase deploy --only functions --project=prod --config=firebase.prod.json
        ;;
    "all")
        echo "🚀 Deploying everything..."
        firebase deploy --project=prod --config=firebase.prod.json
        ;;
    *)
        echo "❌ Invalid component. Use: all, hosting, firestore, functions"
        exit 1
        ;;
esac

if [ $? -eq 0 ]; then
    echo "✅ Production deployment completed successfully!"
else
    echo "❌ Deployment failed!"
    exit 1
fi
