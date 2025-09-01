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
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Helpful runtime check
for (const [k, v] of Object.entries(firebaseConfig)) {
  if (!v) console.warn(`[Firebase] Missing env: ${k}`);
}

// Flag to control local emulators (set VITE_USE_EMULATORS=true in .env.local)
export const USING_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ Firestore with persistent local cache (multi-tab)
export const db = initializeFirestore(app, {
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
  isSupported().then(ok => {
    if (ok) analytics = getAnalytics(app);
  }).catch(() => {});

  // Disabled Firebase Performance to prevent invalid attribute errors
  // try {
  //   perf = getPerformance(app);
  // } catch {}
}

export default app;
