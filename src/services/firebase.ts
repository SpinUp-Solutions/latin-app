import { initializeApp, getApps, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const usingFirebaseEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

const initializeClientFirestore = () => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (error) {
    // The Firebase app survives Next.js Fast Refresh, while this module and
    // its newly allocated cache settings can be evaluated again. Reuse the
    // existing instance in that case; propagate unrelated initialization
    // failures instead of silently changing Firestore behavior.
    if (!(error instanceof Error && 'code' in error && error.code === 'failed-precondition')) throw error;
    return getFirestore(app);
  }
};

// The persistent cache serves the `users/{uid}` profile read from IndexedDB
// instead of the network, taking the auth chain's Firestore round trip off the
// critical path on every fresh load. It requires IndexedDB, so it stays
// browser-only (the server render keeps the memory cache); the emulator keeps
// the previous in-memory behavior because its data is ephemeral.
const db = typeof window !== 'undefined' && !usingFirebaseEmulators ? initializeClientFirestore() : getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);
let appCheck: AppCheck | undefined;

if (typeof window !== 'undefined' && !usingFirebaseEmulators) {
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
  if (siteKey) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[Firebase] NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY is required for callable AI requests.');
  }
}

if (usingFirebaseEmulators && typeof window !== 'undefined') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  console.log('[Firebase] Connected to Functions emulator');
}

// Messaging and Analytics are deliberately not initialized here: nothing on
// the critical path uses them, and their SDKs add script/network work to every
// page load. When needed, import them dynamically after the app is idle.

export { app, appCheck, auth, db, storage, functions };
