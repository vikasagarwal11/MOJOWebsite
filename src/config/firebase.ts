// src/config/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';
import { getPerformance } from 'firebase/performance';

const normalizeStorageBucket = (rawBucket: string | undefined, fallbackProjectId: string): string => {
  const trimmed = rawBucket?.trim();

  const ensureModernDomain = (value: string) => {
    const bucketOnly = value.replace(/\/.*$/, ''); // strip any accidental path segments
    return bucketOnly.replace(/\.appspot\.com$/i, '.firebasestorage.app');
  };

  if (!trimmed) {
    return `${fallbackProjectId}.firebasestorage.app`;
  }

  const withoutScheme = trimmed.replace(/^gs:\/\//i, '');

  if (!withoutScheme.includes('.')) {
    return `${withoutScheme}.firebasestorage.app`;
  }

  return ensureModernDomain(withoutScheme);
};

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-project';
const rawStorageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
const storageBucket = normalizeStorageBucket(rawStorageBucket, projectId);

if (import.meta.env.DEV && rawStorageBucket && storageBucket !== rawStorageBucket.replace(/^gs:\/\//i, '')) {
  console.warn('[Firebase] Normalized storage bucket value. Check your VITE_FIREBASE_STORAGE_BUCKET env var.', {
    provided: rawStorageBucket,
    normalized: storageBucket
  });
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-project.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://demo-project-default-rtdb.firebaseio.com',
  projectId,
  storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789:web:abcdef',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-XXXXXXXXXX',
};

// 🚨 CRITICAL DEBUG: Always log the project ID being used
const shouldLogFirebaseConfig =
  (import.meta as any).env?.DEV ||
  ((import.meta as any).env?.VITE_DEBUG_FIREBASE === 'true');

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

// Log critical config only once after initialization
if (shouldLogFirebaseConfig) {
  console.log(`🚨 [CRITICAL] Firebase Project ID: ${firebaseConfig.projectId}`);
  console.log(`🚨 [CRITICAL] Firebase Auth Domain: ${firebaseConfig.authDomain}`);
  console.log(`🚨 [CRITICAL] Firebase Storage Bucket: ${firebaseConfig.storageBucket}`);
  console.log(`🚨 [CRITICAL] Environment Variables:`, {
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_ENVIRONMENT: import.meta.env.VITE_ENVIRONMENT,
    MODE: import.meta.env.MODE
  });
}

// ✅ Firestore with persistent local cache (multi-tab)
// Use different database based on environment
const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)';

// Helper function to clear corrupted IndexedDB cache
const clearIndexedDBCache = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  
  try {
    const dbName = `firestore/${projectId}/${databaseId}`;
    const deleteRequest = indexedDB.deleteDatabase(dbName);
    
    return new Promise((resolve, reject) => {
      deleteRequest.onsuccess = () => {
        console.log('[Firebase] Cleared corrupted IndexedDB cache');
        resolve();
      };
      deleteRequest.onerror = () => {
        console.warn('[Firebase] Failed to clear IndexedDB cache:', deleteRequest.error);
        resolve(); // Don't reject, just continue
      };
      deleteRequest.onblocked = () => {
        console.warn('[Firebase] IndexedDB deletion blocked - close other tabs');
        resolve(); // Don't reject, just continue
      };
    });
  } catch (error) {
    console.warn('[Firebase] Error clearing IndexedDB cache:', error);
  }
};

// Initialize Firestore with persistent local cache
// Note: Errors may occur later during queries, not during initialization
export const db = initializeFirestore(app, {
  databaseId,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    // Set cache size to prevent SDK compatibility issues
    cacheSizeBytes: 50 * 1024 * 1024, // 50MB cache limit
  }),
});

// Export cache clearing utility for runtime errors
export const clearFirestoreCache = clearIndexedDBCache;

// Utility function to handle Firestore operations with IndexedDB error recovery
export async function withFirestoreErrorHandling<T>(
  operation: () => Promise<T>,
  retries = 2
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      const isIndexedDBError = 
        error?.code === 'unavailable' ||
        error?.message?.includes('IndexedDB') ||
        error?.message?.includes('IndexedDbTransactionError') ||
        error?.message?.includes('Allocate target');
      
      if (isIndexedDBError && attempt < retries) {
        console.warn(`[Firebase] IndexedDB error on attempt ${attempt + 1}, clearing cache and retrying...`, error);
        
        // Clear cache and wait a bit before retry
        await clearIndexedDBCache();
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
        
        continue;
      }
      
      // If not IndexedDB error or out of retries, throw
      throw error;
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error('Operation failed after retries');
}

export const auth = getAuth(app);
export const storage = getStorage(app);

const defaultFunctionsRegion =
  (import.meta as any).env?.VITE_FIREBASE_FUNCTIONS_REGION || 'us-east1';

export const functions = getFunctions(app, defaultFunctionsRegion);
export const functionsUsCentral1 =
  defaultFunctionsRegion === 'us-central1' ? functions : getFunctions(app, 'us-central1');

// Note: reCAPTCHA v2 configuration is now handled in src/utils/recaptcha.ts
// and initialized early in main.tsx to prevent Enterprise probing

// Connect to emulators in dev (Auth emulator does not require reCAPTCHA)
if (USING_EMULATORS) {
  try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch {}
  try { connectFirestoreEmulator(db, '127.0.0.1', 8080); } catch {}
  try { connectStorageEmulator(storage, '127.0.0.1', 9199); } catch {}
  try { connectFunctionsEmulator(functions, '127.0.0.1', 5001); } catch {}
  if (functionsUsCentral1 !== functions) {
    try { connectFunctionsEmulator(functionsUsCentral1, '127.0.0.1', 5001); } catch {}
  }
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
