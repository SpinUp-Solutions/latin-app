# Release 1.1.7 QA evidence — 17 November 2026

Tested PR #355 at `b97d1d5f98b5480227624a69aea936c287d9c9dc`; comparison base `738bdb6bd115d520097a35dcd947360320fda344`. This branch contains QA evidence and a replay harness. It is not a release implementation branch.

## Outcome

No newly introduced functional blocker reproduced. The final verification batches executed 59 browser scenarios: 58 passed and one deliberately failed an expected-failure regression for the inherited pending-root-pool issue. Two additional focused runs captured the final adjective and AI screenshots. Jest passed 1,998 tests across 208 suites, with one skipped test. TypeScript, Functions compilation and the Node 22 production build passed. Lint returned zero errors and three existing navigation warnings.

Functional QA supports this release, with the findings and limits below. The `autocompleteWord` function still needs its normal deployment; no deployment or production mutation was performed.

## Dataset and environment

- Auth, Firestore, Storage and Functions used only the local `demo-latin-app` emulator project.
- Five accounts: one administrator and four students, created by the fixture. The seeded credentials are synthetic and are defined in `harness/fixtures/seed.ts`.
- Initial vocabulary: 506 documents, including a 500-word synthetic stress pool with 450 eligible and 50 deliberately unusable selected forms, plus five real Latin verbs. Three initial pools include a small real-word pool and an empty pool.
- Six lesson fixtures cover immediate reveal, delayed reveal, maximum-failure reset, generated morphology, authoring, and a complete 36-blank adjective declension chart.
- A separate boundary case adds a pool of 1,050 eligible synthetic words. All-word generation returned 1,050 questions; numeric mode returned 1,000.
- Chromium 138 and Firefox 139; viewport widths 320, 390, 768 and 1280. Mobile coverage uses browser viewports, not physical devices.
- Broad development checks ran on Node 24.14.1. The Firefox runner, production build and production browser smoke ran under Node 22.23.5. The actual Functions emulator and a local controlled provider exercised the callable code.
- Before screenshots use the production-base source running locally. Final after screenshots use the built edge application where applicable; the AI interaction screenshots use the development client connected to the Functions emulator. The crop screenshots show real DOM elements without image retouching.

## Findings

### QA-01 — Existing pending-deletion root pool is readable by generated preview

Mark `vocabulary_pools/qa-small` with `_deletionPending: true` and POST a valid all-word exercise referencing it to `/api/admin/exercises/generated-preview` as the seeded admin. Both the comparison base and edge return HTTP 200 and collect five words. The expected result is a controlled rejection before generating questions. See `known-pending-root-issue.json`. The replay test is marked `test.fail()` so this known defect remains visible. The relevant read path supplies the root document to the linked-pool resolver without applying the deletion-pending check used for referenced source documents. This is inherited behavior, not a new regression in #355.

### Dependency audit — Existing findings remain outside Next.js and sharp

`npm audit --omit=dev --json` reports 70 package findings on edge: five critical, 15 high, 49 moderate and one low. The base reports 72. No new package names were added to the vulnerability set; `next` and `sharp` were removed. Counts describe audit package findings, not confirmed exploitable application vulnerabilities. Raw reports are included.

The direct dependencies reported include Sentry, Swiper and Zod. The [Sentry middleware/tunnel advisory](https://github.com/advisories/GHSA-mchm-gjx6-7h55) explicitly excludes Turbopack builds; this QA used the default Turbopack production build. The [Swiper](https://github.com/advisories/GHSA-hmx5-qpq5-p643) and [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) advisory reachability was not established by this functional QA and needs separate triage. No dependency changes were made.

## Coverage

- Table fill: mixed grades; visible symbols and scores; row/column accessible names and missing-row-heading fallback; delayed answer reveal; retained correct answers across multiple retries; correction completion and persisted score; full reset; mobile containment; all 36 adjective cells; horizontal scrolling and keyboard movement.
- Test mode: no practice feedback or answer reveal, saved answers after refresh, submission and an actual persisted 2/3 result.
- Both generated editors: selecting pool mode defaults to all words; toggling the checkbox; switching source modes; values 201, 1000 and 1001; invalid/empty input handling; persisted numeric/all settings and reopen; stable history while editing.
- Generation: distinct eligible words, exclusion of unusable forms, count/all behavior, all-word mode above the numeric ceiling, authenticated student playback, forged exercise identity rejection, anonymous/student denial for admin preview, empty/missing pools.
- Large tests: HTTP 422 `ATTEMPT_TOO_LARGE`, visible student feedback, zero partially created attempts.
- Authentication: invalid credentials; admin refresh; sign out; student sign-in/refresh; rejection of admin UI access after switching accounts.
- Next.js upgrade: lesson create/edit and both test/version editors remained responsive, with stable history after edits.
- AI autocomplete: real callable emulator; captured Terra/medium/32000 request; loading state; successful merge that preserves existing translation; displayed simulated token cost; provider rejection, malformed JSON and output-budget exhaustion; successful retry. The provider payload is controlled data, not a real model response.
- Existing acceptance suite: all 16 journeys, including assessment gating, resume, mock ownership/retakes, student feedback upload/admin review, public pages and admin scrolling.

## Limits

Real model output quality, paid-provider latency, deployed Functions revision, production IAM/index behavior, Safari/WebKit, physical mobile devices and real screen-reader announcements were not verified. No live deployment was exercised with writable data. Firestore/Storage rules were unchanged and their separate rule suites were not rerun. Emulator timing measurements are local observations, not production performance estimates.

## Evidence files

- `checks.json`: result summary and pinned revisions.
- `chromium-results.json`, `firefox-results.json`, `production-results.json`: final verification batches.
- `generation-metrics.json`, `all-word-beyond-cap.json`: observed generation counts and local request times.
- `test-mode-result.json`, `oversized-test-response.json`: persisted scoring and safe failure evidence.
- `autocomplete-model-requests.json`: captured request settings, with no prompt, credential or real provider response.
- PNG files: actual browser screenshots; `*-count-*` images are direct screenshots of the question-count controls.

## Replay

Use a fresh worktree at this evidence branch, Node 22, Java 21, and free ports 3000, 3001, 5001, 5055, 8080, 9099 and 9199. Install app and Functions dependencies, build Functions, and install Playwright Chromium/Firefox. Create a second checkout at the exact comparison-base SHA, install its dependencies, and set `QA117_BEFORE_DIR` to that path.

In this fresh checkout, create `functions/.secret.local` containing only `OPENAI_API_KEY=qa-fake-key`. Start `node qa-evidence/harness/provider.cjs`, `node qa-evidence/harness/run-server.cjs before`, and `node qa-evidence/harness/run-server.cjs edge` in separate terminals. Then run:

```sh
OPENAI_BASE_URL=http://127.0.0.1:5055/v1 JAVA_TOOL_OPTIONS=-Xmx512m \
  node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec \
  --only auth,firestore,storage,functions --project demo-latin-app \
  'npx playwright test -c qa-evidence/harness/playwright.config.ts'
```

Use `playwright.firefox.config.ts` for Firefox. The fixture resets only the hard-coded local demo emulator endpoints. Run one test worker at a time. For the production browser batch, stop the edge development server, run the server helper with `build` and then `start`; omit the AI case because the production client does not connect Functions to its emulator. Stop the helper servers when finished.
