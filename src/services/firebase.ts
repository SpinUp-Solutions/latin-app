import { initializeApp, getApps, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

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

if (usingFirebaseEmulators && typeof window !== 'undefined') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  console.log('[Firebase] Connected to Functions emulator');
}

// Analytics is loaded after page load/idle by the root FirebaseAnalytics component.
// Keep its SDK out of this eager module so it does not delay authentication.
// Messaging remains uninitialized until a feature needs it.

export { app, auth, db, storage, functions };
