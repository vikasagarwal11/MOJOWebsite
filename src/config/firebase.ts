// src/config/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';
import { getPerformance } from 'firebase/performance';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://demo-project-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-project',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.replace('gs://', '') || 'demo-project.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789:web:abcdef',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-XXXXXXXXXX',
};

// 🚨 CRITICAL DEBUG: Always log the project ID being used
console.log(`🚨 [CRITICAL] Firebase Project ID: ${firebaseConfig.projectId}`);
console.log(`🚨 [CRITICAL] Firebase Auth Domain: ${firebaseConfig.authDomain}`);
console.log(`🚨 [CRITICAL] Firebase Storage Bucket: ${firebaseConfig.storageBucket}`);
console.log(`🚨 [CRITICAL] Environment Variables:`, {
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_ENVIRONMENT: import.meta.env.VITE_ENVIRONMENT,
  MODE: import.meta.env.MODE
});

// Flag to control local emulators (set VITE_USE_EMULATORS=true in .env.local)
export const USING_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';

// Helpful runtime check - only warn in development
if (import.meta.env.DEV) {
  // Log environment information
  console.log(`[Firebase] Environment: ${import.meta.env.VITE_ENVIRONMENT || 'development'}`);
  console.log(`[Firebase] Project ID: ${firebaseConfig.projectId}`);
  console.log(`[Firebase] Using emulators: ${USING_EMULATORS ? 'YES' : 'NO'}`);
  
  // Check for placeholder values
  for (const [k, v] of Object.entries(firebaseConfig)) {
    if (!v || v.includes('demo-') || v.includes('your_') || v === '123456789' || v === 'G-XXXXXXXXXX') {
      console.warn(`[Firebase] Using placeholder value for: ${k}`);
    }
  }
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// 🚨 CRITICAL DEBUG: Always log the project ID being used
console.log(`🚨 [CRITICAL] Firebase Project ID: ${firebaseConfig.projectId}`);
console.log(`🚨 [CRITICAL] Firebase Auth Domain: ${firebaseConfig.authDomain}`);
console.log(`🚨 [CRITICAL] Firebase Storage Bucket: ${firebaseConfig.storageBucket}`);
console.log(`🚨 [CRITICAL] Environment Variables:`, {
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_ENVIRONMENT: import.meta.env.VITE_ENVIRONMENT,
  MODE: import.meta.env.MODE
});

// ✅ Firestore with persistent local cache (multi-tab)
// Use different database based on environment
const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)';

export const db = initializeFirestore(app, {
  databaseId,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    // Set cache size to prevent SDK compatibility issues
    cacheSizeBytes: 50 * 1024 * 1024, // 50MB cache limit
  }),
});

export const auth = getAuth(app);
export const storage = getStorage(app);

// Note: reCAPTCHA v2 configuration is now handled in src/utils/recaptcha.ts
// and initialized early in main.tsx to prevent Enterprise probing

// Connect to emulators in dev (Auth emulator does not require reCAPTCHA)
if (USING_EMULATORS) {
  try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch {}
  try { connectFirestoreEmulator(db, '127.0.0.1', 8080); } catch {}
  try { connectStorageEmulator(storage, '127.0.0.1', 9199); } catch {}
}

export let analytics: Analytics | undefined;
// export let perf: any | undefined;

if (typeof window !== 'undefined') {
  // Only initialize analytics if we have real Firebase config (not placeholder values)
  const hasRealConfig = firebaseConfig.measurementId !== 'G-XXXXXXXXXX' && 
                       firebaseConfig.projectId !== 'demo-project' &&
                       !firebaseConfig.apiKey.includes('demo-');
  
  if (hasRealConfig) {
    isSupported().then(ok => {
      if (ok) {
        analytics = getAnalytics(app);
        
        // Optional: Enable Analytics Debug Mode in development
        // Uncomment the next line if you want to debug analytics events
        // if (import.meta.env.DEV) {
        //   console.log('[Firebase] Analytics Debug Mode enabled - check Firebase Console for real-time events');
        // }
      }
    }).catch(() => {});
  } else {
    console.warn('[Firebase] Skipping analytics initialization - using placeholder config');
  }

  // Disabled Firebase Performance to prevent invalid attribute errors
  // try {
  //   perf = getPerformance(app);
  // } catch {}
}

export default app;
