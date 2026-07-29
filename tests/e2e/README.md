# Browser acceptance tests

The assessment journeys run entirely against the local Firebase Auth and Firestore
emulators. They seed deterministic users, Learning Path units, versions, and
vocabulary data before Playwright starts. They do not need service-account
credentials and never write to a deployed Firebase project.

## Local prerequisites

- Node.js 22 and `npm ci`
- Java 21 for the Firebase emulators
- Playwright Chromium: `npx playwright install chromium`
- Ports 3000, 8080, and 9099 available

Run the assessment suite with:

```sh
npm run test:e2e:assessment
```

Playwright starts both emulators and the local Next.js development server. To
run all browser tests, use `npm run test:e2e`.

Each stateful assessment case reseeds its own deterministic fixture, including on
Playwright retries. `npm run test:e2e:assessment:repeat-score` runs the score-only
journey twice from a clean seed to validate that retry contract.

The acceptance seed uses the Firebase demo project ID `demo-latin-app`.
`NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, `FIRESTORE_EMULATOR_HOST`, and
`FIREBASE_AUTH_EMULATOR_HOST` are scoped to the Playwright process and its
server children. Production configuration remains untouched.

Firebase emulator runtime logs are written under the operating system temporary
directory (`latin-app-playwright-emulators`), never into tracked workspace logs.
