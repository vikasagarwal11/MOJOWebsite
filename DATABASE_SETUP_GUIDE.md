# Database Setup Guide

## 🗄️ Current Database Architecture

### **Development Environment**
- **Project**: `momfitnessmojo-dev`
- **Database**: `(default)`
- **Purpose**: Testing, development, and staging
- **URL**: https://console.firebase.google.com/project/momfitnessmojo-dev

### **Production Environment**
- **Project**: `momfitnessmojo`
- **Database**: `(default)`
- **Purpose**: Live production data
- **URL**: https://console.firebase.google.com/project/momfitnessmojo

## 🚀 How to Use Different Databases

### **For Development:**
```bash
# Use development project
npm run dev
# or
npm run build:dev
npm run deploy:dev
```

### **For Production:**
```bash
# Use production project
npm run build:prod
npm run deploy:prod
```

## 🔧 Environment Configuration

### **Development (.env.local)**
```env
VITE_FIREBASE_PROJECT_ID=momfitnessmojo-dev
VITE_FIREBASE_DATABASE_ID=(default)
VITE_ENVIRONMENT=development
```

### **Production (.env.production)**
```env
VITE_FIREBASE_PROJECT_ID=momfitnessmojo
VITE_FIREBASE_DATABASE_ID=(default)
VITE_ENVIRONMENT=production
```

## 📊 Database Separation Benefits

✅ **Complete Data Isolation**: Dev and prod data never mix
✅ **Safe Testing**: Test new features without affecting production
✅ **Independent Scaling**: Each environment can scale separately
✅ **Security**: Different access controls for each environment
✅ **Backup Strategy**: Independent backup and recovery

## 🔄 Migration Strategy

If you want to create additional databases within the same project:

### **Option A: Multiple Databases in Same Project**
```bash
# Create dev database in production project
firebase firestore:databases:create dev --project=momfitnessmojo --location=us-central1

# Create prod database in production project  
firebase firestore:databases:create prod --project=momfitnessmojo --location=us-central1
```

### **Option B: Keep Current Setup (Recommended)**
- Use separate Firebase projects (current setup)
- Each project has its own `(default)` database
- Cleaner separation and easier management

## 🛠️ Deployment Commands

### **Development Deployment**
```bash
npm run deploy:dev
# Deploys to momfitnessmojo-dev project
```

### **Production Deployment**
```bash
npm run deploy:prod
# Deploys to momfitnessmojo project
```

## 🔍 Verification

To verify you're using the correct database:

1. Check the browser console for Firebase project ID
2. Look for: `[Firebase] Project ID: momfitnessmojo-dev` (dev) or `momfitnessmojo` (prod)
3. Check the Firebase Console to see which project you're connected to

## 📝 Notes

- **Current Setup**: You already have the best practice setup with separate projects
- **Data Safety**: Development and production data are completely isolated
- **Cost**: Each project has its own billing and quotas
- **Security**: Each project has independent security rules and access controls
