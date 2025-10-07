beforeAll(() => {
  // Verify Firebase is initialized with env vars
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    console.warn('Firebase config not found in environment');
  }
});
