# MOJO Website Deployment Guide

This guide explains how to deploy and maintain separate development and production environments for the MOJO Website.

## 🏗️ Environment Setup

### 1. Firebase Projects

You need to create **two separate Firebase projects**:

#### Development Project
- **Project ID**: `mojo-website-dev` (or your preferred name)
- **Purpose**: Testing, development, and staging
- **URL**: `https://mojo-website-dev.web.app`

#### Production Project
- **Project ID**: `mojo-website-prod` (or your preferred name)
- **Purpose**: Live production environment
- **URL**: `https://mojo-website-prod.web.app` (or your custom domain)

### 2. Environment Configuration

#### Step 1: Create Environment Files
Copy the template files and fill in your actual Firebase configuration:

```bash
# For development
cp env.development .env.local

# For production (when building)
cp env.production .env.production
```

#### Step 2: Configure Firebase Projects
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create two projects: one for dev, one for prod
3. Enable the following services in both projects:
   - **Authentication** (with your preferred providers)
   - **Firestore Database**
   - **Storage**
   - **Hosting**
   - **Cloud Functions**
   - **Analytics** (optional)

#### Step 3: Set Up Firebase CLI
```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize projects (run in project root)
firebase use --add  # Select your dev project
firebase use --add  # Select your prod project

# Set aliases for easier management
firebase use dev --alias dev
firebase use prod --alias prod
```

## 🚀 Deployment Commands

### Quick Deployment

#### Development Environment
```bash
# Deploy everything to dev
npm run deploy:dev

# Deploy specific components
npm run deploy:dev:hosting    # Only hosting
npm run deploy:dev:firestore  # Only Firestore rules
npm run deploy:dev:functions  # Only Cloud Functions
```

#### Production Environment
```bash
# Deploy everything to prod
npm run deploy:prod

# Deploy specific components
npm run deploy:prod:hosting    # Only hosting
npm run deploy:prod:firestore  # Only Firestore rules
npm run deploy:prod:functions  # Only Cloud Functions
```

### Using Deployment Scripts

#### PowerShell (Windows)
```powershell
# Development
.\deploy-dev.ps1 all
.\deploy-dev.ps1 hosting
.\deploy-dev.ps1 firestore
.\deploy-dev.ps1 functions

# Production
.\deploy-prod.ps1 all
.\deploy-prod.ps1 hosting
.\deploy-prod.ps1 firestore
.\deploy-prod.ps1 functions
```

#### Bash (Linux/macOS)
```bash
# Make scripts executable
chmod +x deploy-dev.sh deploy-prod.sh

# Development
./deploy-dev.sh all
./deploy-dev.sh hosting
./deploy-dev.sh firestore
./deploy-dev.sh functions

# Production
./deploy-prod.sh all
./deploy-prod.sh hosting
./deploy-prod.sh firestore
./deploy-prod.sh functions
```

## 🗄️ Database Management

### Firestore Database Structure

Both environments will have identical database structures but separate data:

```
Development Database:
├── events/
├── users/
├── familyMembers/
├── media/
└── posts/

Production Database:
├── events/
├── users/
├── familyMembers/
├── media/
└── posts/
```

### Database Synchronization

#### Option 1: Manual Data Migration
```bash
# Export from production
firebase firestore:export gs://your-prod-bucket/backup

# Import to development
firebase firestore:import gs://your-prod-bucket/backup --project=dev
```

#### Option 2: Seed Data Scripts
Create seed data scripts for development:
```bash
# Run seed script for dev
npm run seed:dev
```

### Database Rules Deployment
```bash
# Deploy rules to both environments
npm run deploy:dev:firestore
npm run deploy:prod:firestore
```

## 🔄 CI/CD Pipeline

### GitHub Actions (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy MOJO Website

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  deploy-dev:
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build:dev
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_DEV }}'
          projectId: your-dev-project-id
          channelId: live

  deploy-prod:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build:prod
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_PROD }}'
          projectId: your-prod-project-id
          channelId: live
```

### Environment Variables in CI/CD

Set these secrets in your GitHub repository:

- `FIREBASE_SERVICE_ACCOUNT_DEV`: Service account JSON for dev project
- `FIREBASE_SERVICE_ACCOUNT_PROD`: Service account JSON for prod project

## 🔧 Development Workflow

### 1. Local Development
```bash
# Start development server
npm run dev

# Use Firebase emulators for local testing
npm run emulators
```

### 2. Testing Changes
```bash
# Build and test locally
npm run build:dev
npm run preview

# Deploy to dev environment
npm run deploy:dev
```

### 3. Production Release
```bash
# Deploy to production
npm run deploy:prod

# Or use the script
./deploy-prod.sh all
```

## 📊 Monitoring and Maintenance

### Firebase Console Monitoring
- **Development**: Monitor usage, errors, and performance in dev project
- **Production**: Monitor real user metrics in prod project

### Database Maintenance
```bash
# Backup production database
firebase firestore:export gs://your-backup-bucket/backup-$(date +%Y%m%d)

# Restore from backup
firebase firestore:import gs://your-backup-bucket/backup-20240101 --project=prod
```

### Security Rules Testing
```bash
# Test rules against emulator
firebase emulators:exec --only firestore "npm run test:rules"

# Deploy rules with testing
npm run deploy:dev:firestore
npm run test:integration
```

## 🚨 Troubleshooting

### Common Issues

1. **Build Failures**
   - Check environment variables
   - Verify Firebase configuration
   - Run `npm run lint` to check for errors

2. **Deployment Failures**
   - Verify Firebase CLI is logged in
   - Check project permissions
   - Ensure correct project aliases

3. **Database Issues**
   - Verify Firestore rules syntax
   - Check indexes configuration
   - Test with Firebase emulator

### Debug Commands
```bash
# Check Firebase project status
firebase projects:list
firebase use

# Test deployment without deploying
firebase deploy --dry-run --project=dev

# View deployment logs
firebase hosting:channel:list --project=dev
```

## 📝 Best Practices

1. **Always test in development first**
2. **Use feature branches for new features**
3. **Keep production and dev databases in sync for testing**
4. **Monitor both environments regularly**
5. **Backup production data regularly**
6. **Use environment-specific configuration**
7. **Test security rules thoroughly**

## 🔐 Security Considerations

1. **Separate service accounts** for dev and prod
2. **Different API keys** for each environment
3. **Restrict access** to production environment
4. **Regular security audits** of Firestore rules
5. **Monitor authentication** and user access

---

For questions or issues, refer to the [Firebase Documentation](https://firebase.google.com/docs) or create an issue in the repository.
