# Latin App

An interactive Latin learning application built for students and content administrators. Students follow a learning path of lessons and assessments, practise vocabulary and grammar, and track their progress. Administrators author and publish lessons, manage vocabulary words and pools, configure practice categories and tests, and review feedback and attempts.

The app uses Next.js App Router, React and TypeScript. Firebase provides authentication, Firestore, Storage and Cloud Functions; Redux Toolkit Query manages client-side API data. Some features use OpenAI, and Sentry is used for error monitoring.

## Getting started

### Prerequisites

- Node.js 22 (see `.nvmrc`) and npm.
- Access to a **development** Firebase project with Authentication, Firestore and Storage configured, plus its web app configuration and a service account for server-side access. Ask the project maintainers for development access and configuration; do not use production credentials for local development.
- Java 21 if running the Firebase emulators or browser tests.

Clone the repository and install its locked dependencies:

```sh
git clone https://github.com/SpinUp-Solutions/latin-app.git
cd latin-app
nvm use # if using nvm
npm ci
```

### Environment configuration

Create `.env.local` in the repository root with the development project's values. Next.js loads this file for local development; it is ignored by Git. Obtain the web configuration from Firebase project settings and the server credentials from an authorized project maintainer.

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id

FIREBASE_CLIENT_EMAIL=your-service-account-email
FIREBASE_PRIVATE_KEY="your-service-account-private-key"
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The private key can contain escaped `\n` characters. Keep server credentials private: never prefix them with `NEXT_PUBLIC_` or commit them. The measurement ID is used for Firebase Analytics. `OPENAI_API_KEY` is needed for server-side AI features, while Sentry configuration is optional for local development. Features also require the corresponding services, sign-in providers, permissions and content to be configured in the Firebase project; a newly created project will not contain the app's course content or administrator accounts.

Start the app:

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with an account in the development project; administration requires a Firestore `users/{uid}` document with `role: "admin"`. In development, the client connects Firebase Functions to the local emulator on port 5001. When working on features that call functions, install and build them with `npm ci --prefix functions` and `npm run build --prefix functions`, then run `npm run functions:serve` with the required Functions configuration.

### Builds and environments

`npm run build` builds using Next.js environment loading. `npm run start` starts a built app using `.env.development`. The `dev:staging`, `build:staging` and `start:staging` scripts explicitly load `.env.staging`; the corresponding `:prod` scripts load `.env.production`. `build:dev` explicitly loads `.env.development`, and `build:all` requires all three environment files. These files are ignored by Git. Check the selected project and credentials before running environment-specific commands.

## Tests and checks

```sh
npx tsc --noEmit
npm run lint
npm test -- --runInBand
npm run test:firestore-rules
npm run test:storage-rules
npm run test:e2e
```

Jest runs unit and integration tests; pass a test path after `--runInBand` to run a targeted test. The rules tests use Firebase emulators. Browser tests use Playwright, start a local Next.js server and Firebase Auth, Firestore and Storage emulators, and seed a demo project. They require Java 21, Chromium (`npx playwright install chromium`), and free ports 3000, 8080, 9099 and 9199. See [tests/e2e/README.md](tests/e2e/README.md) for details and targeted browser runs.

## Project layout

- `src/app` — App Router pages and API routes, including student and admin flows.
- `src/components` — lesson players, exercise components, admin editors and shared UI.
- `src/lib` — server-side domain services, validation, authorization and content workflows.
- `src/store/api` — authenticated RTK Query endpoints and client caching.
- `src/services` — Firebase client and Admin SDK initialization.
- `shared` — contracts and constants shared across application boundaries.
- `functions` — Firebase Cloud Functions.
- `tests` — Jest, emulator and Playwright tests; `firestore.rules` and `storage.rules` define Firebase access rules.

Lessons and learning-path content are stored in Firestore and managed through the admin interface. Lesson pages combine authored content and interactive exercises; progress and assessment results are recorded for each student. See [AGENTS.md](AGENTS.md) for the repository's architecture, data-integrity and testing conventions.

## Content and deployment safety

The `functions:*` deployment scripts target configured Firebase projects and can change deployed services. Confirm the target before using them. Production-to-development content synchronization is a separate workflow: production is read-only, and apply, rollback and destructive maintenance require explicit authorization. Inspect the dry-run plan and the synchronization instructions before making changes; do not run these operations as part of ordinary setup.
