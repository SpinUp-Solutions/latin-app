#!/usr/bin/env bash
# Cloud Agent environment bootstrap for the Latin app.
# Idempotent: safe to re-run. Prepares dependencies and local dev state so the
# app can run against the Firebase Auth + Firestore emulators (no real secrets).
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Install dependencies from the lockfile.
npm ci

# 2. Local dev environment for the Firebase emulators.
#    `next dev` auto-loads .env.development. These are fake, non-secret values;
#    the client + admin SDKs are routed to the local emulators.
if [ ! -f .env.development ]; then
  cat > .env.development <<'EOF'
NEXT_PUBLIC_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Firebase client config (fake values; the app talks to local emulators)
NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-latin-app.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-latin-app
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=demo-latin-app.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:dev

# Route the Firebase client + admin SDKs to the local emulators
NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
GCLOUD_PROJECT=demo-latin-app
EOF
  echo "[install] wrote .env.development for local Firebase emulators"
fi

# 3. Pre-download the Firestore emulator jar so the first boot is fast/offline.
./node_modules/.bin/firebase setup:emulators:firestore || true

# 4. Playwright Chromium for the browser acceptance suite (npm run test:e2e).
npx playwright install chromium || true

echo "[install] done"
