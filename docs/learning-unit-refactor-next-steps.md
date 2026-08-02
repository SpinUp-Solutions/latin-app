# Learning Unit Refactor: Release, Cutover, and Retirement Runbook

Status: **Ready for release planning — no deployment or production data mutation has been performed**

Last updated: **2026-07-29**

This is the operational handoff for the implementation described in
[`learning-unit-refactor.md`](./learning-unit-refactor.md). The design document
remains the source of truth for invariants and implementation history; this file
turns that design into the next concrete release and production steps.

## 1. What is complete locally

The repository now contains the completed learning-unit refactor:

- one revisioned `learningPaths/default` aggregate for the ordered normal flow;
- normal lessons and eligible normal tests in one progression sequence;
- frozen, resumable test attempts with server-side scoring and sticky
  completion;
- standalone and parent-linked mock tests with exclusive delivery ownership;
- summary-only dashboard reads and focused lesson-detail reads;
- server-only Firestore rules and the required attempt/mock indexes;
- removal of the old proof-of-concept test model and compatibility UI;
- shared progression evaluation at dashboard and write-authorization
  boundaries;
- focused authoring, mock, and attempt services in place of the all-purpose
  `TestService`;
- buffered answer persistence extracted from the student test page; and
- feature-based assessment acceptance naming in npm scripts, CI, Playwright,
  and test documentation.

Implementation history at a glance:

| Workstream             | Delivered result                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phases 1–2             | Shared learning-unit/test-version domain, runtime modes, editor, preview, and grading foundations.                                                     |
| Pre-Phase 3 correction | Exclusive version ownership replaced the earlier pointer/back-pointer model.                                                                           |
| Phase 3                | Firestore-backed learning-unit, test-container, and version APIs plus the production editor workflow.                                                  |
| Phase 4                | Frozen delivery, attempt concurrency, answer saving, submission, scoring, recovery, summaries, and sticky completion.                                  |
| Phase 5                | Summary/detail read boundaries, singleton Learning Path, migration manifest, transactional cutover, verification, rollback, and retirement controls.   |
| Phase 6                | Mixed lesson/test progression, normal-test placement and delivery, student test flow, and buffered answer commits.                                     |
| Phase 7                | Standalone and assigned mocks, atomic ownership transfer, admin lifecycle, student cards, retakes, trends, and acceptance journeys.                    |
| Phase 8                | Removal of the POC test model, obsolete routes/components/types, runtime-mode adapters, and test-container placement fields.                           |
| Clarity cleanup 1–6    | Dead-code removal, shared projections/error mapping/progression, focused services, focused lesson reads, buffered-answer hook, and durable E2E naming. |

Current local verification:

- TypeScript passes.
- ESLint passes with zero warnings.
- All 73 Jest suites / 470 tests pass.
- All four emulator-backed Playwright assessment journeys pass.
- The emulator-backed authenticated migration lifecycle passes through dry run,
  apply, projection verification, rollback, reapply, and retirement.
- `git diff --check` passes.
- The Next.js production build passes.

The detailed phase and cleanup reports are recorded in
[`learning-unit-refactor.md`](./learning-unit-refactor.md), especially Phase 5,
Phases 6–8, and **Post-phase clarity cleanup**.

## 2. Decisions required before release

Assign an owner and record the answer to each item before touching a deployed
environment.

| Decision                 | Required answer                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application release path | Netlify publishes the Next.js application and its route handlers. Confirm the linked Netlify site, production branch, and whether production deploys auto-publish. |
| Firebase target          | Rehearse against `latin-app-staging`; operate production only against `latin-app-prod`. Pass the full project ID with `--project` on every deploy command.         |
| Progression locking      | Production must omit `NEXT_PUBLIC_DISABLE_PROGRESSION_LOCK` or set it to `false`. CI now omits the override, and Playwright explicitly forces `false`.             |
| Netlify contexts         | A staging branch deploy or Deploy Preview must use staging Firebase values; the production context must use production Firebase values.                            |
| Cutover operator         | One authenticated Firebase user whose `users/{uid}.role` is `admin`.                                                                                               |
| Manifest reviewers       | At least one curriculum owner and one technical operator who compare the same immutable manifest.                                                                  |
| Stabilization window     | A written start time, earliest retirement time, traffic/usage window, monitoring owner, and rollback approver. The code deliberately does not impose a duration.   |
| Production backup        | The location and timestamp of a Firestore export or equivalent recoverable backup taken before cutover.                                                            |
| Manifest archive         | A durable release artifact location outside temporary shell files, including the exact JSON and its file hash.                                                     |

Do not treat elapsed time alone as stabilization. Retirement requires the
evidence in section 6.

## 3. Release staging

### 3.1 Prepare the change

1. Review the complete diff, including Firestore rules and indexes.
2. Merge through the normal pull-request process.
3. Require CI to pass, including `npm run test:e2e:assessment` and
   `npm run test:e2e:migration`.
4. Confirm the Netlify build uses Node 22 (pinned in `.nvmrc`) and the current
   automatic Next.js adapter. The expected Next.js build command is
   `next build`; do not select a static export.
5. Confirm the general CI jobs still omit
   `NEXT_PUBLIC_DISABLE_PROGRESSION_LOCK: "true"` so their builds use production
   locking behavior.
6. Confirm the Netlify production environment does not disable progression
   locking.
7. Confirm no normal test is already present in the legacy live-order source or
   in a pre-existing `learningPaths/default` document.

The Netlify environment-variable values belong in the Netlify UI, CLI, or API,
not in `netlify.toml` or source control. For the migration route to work:

- the public Firebase variables must be available to Builds so Next.js can
  embed the browser configuration;
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and
  `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` must also be available to Functions;
- `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` must be available to
  Functions;
- `NEXT_PUBLIC_APP_URL` must match the deployed Netlify URL for that context;
- staging and preview contexts must never inherit production Firebase Admin
  credentials; and
- `NEXT_PUBLIC_DISABLE_PROGRESSION_LOCK` must be absent or `false` everywhere
  except an explicitly isolated local test environment.

Netlify automatically provisions a serverless function for the App Router API
routes, including `/api/admin/learning-path/migration`. Record the immutable
Netlify deploy ID and URL used for each rehearsal or cutover.

The repository's `functions:*` scripts deploy Cloud Functions only. They do not
deploy the Next.js application, Firestore rules, or Firestore indexes.

### 3.2 Rehearse in staging

Deploy the accompanying Firestore rules and indexes to the staging project
first, using the repository-pinned Firebase CLI and an explicit project ID:

```sh
npx firebase deploy \
  --project latin-app-staging \
  --only firestore:rules,firestore:indexes
```

Wait for every required index to report ready. Then publish an immutable
Netlify staging branch deploy or Deploy Preview whose Build and Function
variables point only to `latin-app-staging`, and rehearse the complete
lifecycle against that deploy URL:

1. legacy-source smoke check;
2. dry run and manifest review;
3. apply;
4. verify;
5. rollback;
6. confirm the legacy source is active again;
7. generate and review a fresh manifest if the source changed;
8. reapply;
9. verify again;
10. retire; and
11. confirm ordinary Learning Path editing is enabled.

The staging rehearsal should use staging data that is structurally
representative of production. Do not reuse the staging manifest in production:
the source IDs, order, hash, timestamps, and migration ID belong to one
environment.

## 4. Calling the migration API safely (historical)

The instructions in this section are retained as the operational record for
the completed cutover. The migration endpoint, dashboard controls, and
temporary cutover state are removed by the code-retirement release below; do
not use these commands against a current deployment.

The operator endpoint is:

```text
GET  /api/admin/learning-path/migration
POST /api/admin/learning-path/migration
```

The GET response makes the workflow resumable after navigation, refresh, or an
operator handoff. Each prepared manifest and its lifecycle events are stored in
the server-only `learningPathMigrations/{migrationId}` collection. The admin
dashboard also offers a JSON download as a second, portable copy.

It requires a Firebase ID token for a user whose Firestore user document has
`role: "admin"`. Obtain the token through the approved admin authentication
flow. Never paste the token into this document, source control, an issue, chat,
or a saved request fixture.

Run the commands from an approved secure operations directory outside the
repository. The generated manifests, requests, and responses are
environment-specific operational artifacts, not application source files.

The examples below assume:

```sh
LATIN_APP_BASE_URL='https://your-production-app.example'
LATIN_MIGRATION_ID='learning-path-prod-YYYYMMDD-HHMM'
read -r -s LATIN_ADMIN_ID_TOKEN
```

Keep the token in a non-exported shell variable and unset it when the operation
is complete:

```sh
unset LATIN_ADMIN_ID_TOKEN
```

### 4.1 Dry run

Request:

```json
{
  "action": "dry-run",
  "migrationId": "learning-path-prod-YYYYMMDD-HHMM"
}
```

Example:

```sh
curl --fail-with-body --silent --show-error \
  -X POST "${LATIN_APP_BASE_URL}/api/admin/learning-path/migration" \
  -H "Authorization: Bearer ${LATIN_ADMIN_ID_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"action\":\"dry-run\",\"migrationId\":\"${LATIN_MIGRATION_ID}\"}" \
  > migration-dry-run-response.json

jq '.manifest' migration-dry-run-response.json > migration-manifest.json
```

The dry run writes no curriculum data. It durably stores the immutable manifest
and a `prepared` audit event in `learningPathMigrations/{migrationId}` so apply
and verify no longer depend on browser memory. Archive
`migration-manifest.json` unchanged after review. Do not manually reorder,
repair, or reformat its data; if it is wrong, fix the source and generate a new
manifest ID.

### 4.2 Review the manifest

The curriculum and technical reviewers must check:

- `migrationId` identifies this environment and operation;
- every `unitId` is an existing live normal lesson;
- `unitIds` exactly matches the current admin and student normal order;
- `source` contains the same IDs with unique, nonnegative integer
  `liveOrder` values;
- no practice lesson or test is included;
- `sourceHash` is present and is 64 lowercase hexadecimal characters; and
- the archived file is byte-for-byte the file that will be applied.

Record reviewer names, review time, manifest location, and a local artifact hash:

```sh
shasum -a 256 migration-manifest.json
```

The artifact hash above identifies the archived file. It is separate from the
manifest's `sourceHash`, which identifies the canonical legacy Firestore source.

### 4.3 Apply

Apply the server-stored immutable manifest by ID:

```sh
LATIN_MIGRATION_ID="$(jq -r '.migrationId' migration-manifest.json)"

curl --fail-with-body --silent --show-error \
  -X POST "${LATIN_APP_BASE_URL}/api/admin/learning-path/migration" \
  -H "Authorization: Bearer ${LATIN_ADMIN_ID_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"action\":\"apply\",\"migrationId\":\"${LATIN_MIGRATION_ID}\"}" \
  | tee migration-apply-response.json
```

A first successful apply returns `applied: true`. An exact idempotent retry may
return `applied: false`; that is safe only when the returned path still matches
the reviewed migration ID, source hash, and ordered IDs.

If apply reports that the source changed, stop. Generate and review a new dry
run. Never edit the old manifest to make it pass.

### 4.4 Verify

```sh
curl --fail-with-body --silent --show-error \
  -X POST "${LATIN_APP_BASE_URL}/api/admin/learning-path/migration" \
  -H "Authorization: Bearer ${LATIN_ADMIN_ID_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"action\":\"verify\",\"migrationId\":\"${LATIN_MIGRATION_ID}\"}" \
  | tee migration-verify-response.json
```

Verification succeeds only when:

- the stored path is active and matches the reviewed manifest;
- the legacy source still matches the manifest;
- the path remains lesson-only;
- the admin projection has the exact same count, membership, and order; and
- the student normal-sequence projection has the exact same count, membership,
  and order.

If verification fails, use rollback. Do not continue into stabilization.

Verification appends a `verified` audit event only after the stored path, legacy
source, admin projection, and student projection all pass. Retirement rejects
any migration whose latest stored state is not `verified`.

### 4.5 Inspect the admin projection

At any point, inspect the authenticated admin view with:

```sh
curl --fail-with-body --silent --show-error \
  "${LATIN_APP_BASE_URL}/api/admin/learning-path" \
  -H "Authorization: Bearer ${LATIN_ADMIN_ID_TOKEN}" \
  | tee learning-path-admin-view.json
```

Before apply it should use the legacy source. During successful stabilization it
should use the Learning Path source with editing disabled. After retirement it
should still use the Learning Path source, with editing enabled and no
`cutover`.

### 4.6 Resume or recover the workflow

The dashboard loads `GET /api/admin/learning-path/migration` on entry. A stored
record resumes automatically and exposes its manifest download, status, and
allowed next actions.

Deployments created before durable migration records may report
`needsRecovery: true` while `learningPaths/default.cutover` is present. Recover
that exact active migration through the dashboard or API:

```sh
curl --fail-with-body --silent --show-error \
  -X POST "${LATIN_APP_BASE_URL}/api/admin/learning-path/migration" \
  -H "Authorization: Bearer ${LATIN_ADMIN_ID_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"action":"recover"}' \
  | tee migration-recover-response.json
```

Recovery succeeds only when the untouched legacy source hash and ordered IDs
exactly reconstruct the active cutover. It creates an explicit `recovered`
audit event and still requires a fresh successful `verify` before retirement.

## 5. Production cutover sequence

Use this order for production:

1. Announce the curriculum-edit freeze and rollback owner.
2. Take and record the production Firestore backup/export.
3. Deploy Firestore rules and indexes against `latin-app-prod` with the
   repository-pinned CLI and explicit project ID:

   ```sh
   npx firebase deploy \
     --project latin-app-prod \
     --only firestore:rules,firestore:indexes
   ```

4. Wait for the required indexes to report ready.
5. Publish the approved immutable Netlify deploy from the confirmed production
   branch, then record its deploy ID, commit SHA, and public URL.
6. Before apply, smoke-test admin sign-in, one representative student
   dashboard, and one lesson-detail page while the legacy source remains active.
7. Generate the production dry-run manifest.
8. Archive and review the exact manifest.
9. Apply the reviewed manifest.
10. Run verification immediately.
11. Confirm `GET /api/admin/learning-path` reports:
    - `source: "learning-path"`;
    - `path.cutover.state: "active"`;
    - `canEdit: false`; and
    - `effectiveUnitIds` exactly matching the manifest.
12. Begin the stabilization window.

Do not place a normal test in the path before operational retirement. Ordinary
path saves are frozen while `cutover` is present, and both rollback and retire
deliberately reject a path containing a test.

## 6. How to confirm stabilization is complete

Retirement is approved only when every item below is recorded as satisfied.

### Stored-state evidence

- The same archived manifest passes `verify` at the start and end of the
  stabilization window.
- `learningPaths/default` remains active with the reviewed migration ID,
  source hash, and exact `unitIds`.
- No operator or automated process has modified the archived manifest.
- No test or practice lesson appears in the path.
- No legacy normal publish, unpublish, or reorder operation was required.

### Application evidence

- The admin Learning Path view uses `source: "learning-path"`.
- Representative students see the expected normal order.
- Locking and unlocking match the sticky-frontier rules.
- Direct lesson access agrees with dashboard access.
- Practice visibility, practice ordering, and category membership are
  unchanged.
- Mock-test flows remain healthy. Normal-test acceptance stays proven by CI and
  the staging rehearsal; production normal tests are intentionally not placed
  until after retirement.

### Operational evidence

- No sustained increase in student-dashboard or lesson-detail errors occurred.
- Logs contain no unexplained missing, invalid, ineligible, or malformed
  Learning Path unit messages.
- No support report indicates missing lessons, incorrect order, unexpected
  locking, or changed practice lists.
- The backup, reviewed manifest, apply response, verify responses, release
  identifier, operator, and timestamps are archived together.
- The named rollback approver explicitly approves closing the rollback window.

The stabilization window can end only when both its planned observation period
has elapsed and all evidence is green.

## 7. Rollback during stabilization

Rollback remains available only while `cutover` exists and the path is
lesson-only.

Request:

```json
{
  "action": "rollback",
  "migrationId": "learning-path-prod-YYYYMMDD-HHMM"
}
```

Example:

```sh
curl --fail-with-body --silent --show-error \
  -X POST "${LATIN_APP_BASE_URL}/api/admin/learning-path/migration" \
  -H "Authorization: Bearer ${LATIN_ADMIN_ID_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"action\":\"rollback\",\"migrationId\":\"${LATIN_MIGRATION_ID}\"}" \
  | tee migration-rollback-response.json
```

Rollback changes only `cutover.state` to `inactive` and records its audit
fields. It does not rewrite lessons, progress, attempts, categories, mocks, or
tests.

After rollback:

1. confirm the admin view reports `source: "legacy"`;
2. confirm the student normal order matches the pre-cutover order;
3. preserve the failed verify output and relevant logs;
4. diagnose before making additional changes;
5. generate a fresh manifest if the legacy source changes; and
6. reapply and verify before considering retirement.

Do not call `retire` on an inactive cutover. It correctly requires reapply
first.

## 8. Operational retirement

Operational retirement is irreversible through the API: it removes `cutover`,
ends the edit freeze, disables migration rollback, and makes the Learning Path
the permanent normal-placement source.

Immediately before retirement:

1. confirm the stored migration is still `verified` (the `retire` request also
   reruns the complete stored-state, admin-projection, and student-projection
   verification before it writes anything);
2. capture `learningPaths/default` and its revision;
3. confirm the path contains lessons only;
4. obtain the recorded rollback-approver sign-off; and
5. confirm no incident is still under investigation.

Request:

```json
{
  "action": "retire",
  "migrationId": "learning-path-prod-YYYYMMDD-HHMM"
}
```

Example:

```sh
curl --fail-with-body --silent --show-error \
  -X POST "${LATIN_APP_BASE_URL}/api/admin/learning-path/migration" \
  -H "Authorization: Bearer ${LATIN_ADMIN_ID_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"action\":\"retire\",\"migrationId\":\"${LATIN_MIGRATION_ID}\"}" \
  | tee migration-retire-response.json
```

The retire endpoint fails closed if its mandatory final verification does not
pass. Operators no longer need to transfer a manifest file back into this
request, and a stale earlier verification cannot authorize retirement.

After retirement, confirm:

- `learningPaths/default` has no `cutover` field;
- its revision and ordered `unitIds` did not change;
- `GET /api/admin/learning-path` reports `source: "learning-path"` and
  `canEdit: true`;
- the admin organizer can prepare an edit without a stabilization error;
- legacy normal placement controls remain rejected;
- student order and access are unchanged; and
- an attempted rollback returns the expected unavailable response.

Only after these checks may administrators begin placing eligible normal tests
in the Learning Path.

## 9. Code retirement after operational retirement

Operational retirement and code retirement are two different releases. Once
every deployed environment has no `cutover` field and no environment needs
rollback, the focused cleanup release can remove the temporary workflow.

This cleanup removes or simplifies:

- `src/app/api/admin/learning-path/migration/route.ts`;
- the `learningPathMigrations` collection constant and server-only rule;
- migration action, source, manifest, and cutover schemas/types;
- manifest hashing, source comparison, apply, verify, rollback, and retire
  service methods;
- lesson-only Phase 5 retirement assertions;
- active/inactive compatibility reads in the dashboard and admin projection;
- cutover-specific branches in attempt and mock authorization;
- the stabilization edit freeze and inactive-path messages; and
- migration-only route, service, dashboard, legacy-mutation, and snapshot tests.

Preserve:

- `learningPaths/default` as the canonical revisioned aggregate;
- ordinary complete-sequence save validation and stale-revision protection;
- student and admin projection behavior;
- deletion, lesson-validity, test-rotation, and ownership safety guards;
- protection against normal placement being mutated through legacy lesson
  routes;
- practice lesson `isLive` and `liveOrder`, which remain canonical for practice
  placement;
- existing production lesson documents unless a separate data-retention
  decision authorizes field cleanup; and
- the fail-closed full ownership scan until a separate behavior/performance
  design is approved.

In particular, do not blindly delete the legacy placement guards. After
retirement they should simplify to always reject normal placement changes
through old lesson routes whenever the canonical path exists.

### Code-retirement verification

Run:

```sh
rg -n "cutover|MigrationManifest|migrationAction|buildMigrationManifest|applyMigration|verifyMigration|rollbackMigration|retireMigration" src tests
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test -- --runInBand
npm run test:e2e:assessment
npm run build
git diff --check
```

The source/test search should return no migration-lifecycle references. Any
remaining `migration` wording should be unrelated infrastructure or intentional
historical documentation.

Release that cleanup normally and monitor the same dashboard, lesson-detail,
progression, attempt-start, and mock flows. It requires no Learning Path data
rewrite.

## 10. Definition of done

The overall refactor is operationally complete when:

- the application, Firestore rules, and indexes are released;
- the production manifest is reviewed and archived;
- apply and projection verification succeed;
- the stabilization evidence is recorded;
- the fallback is operationally retired while the path is lesson-only;
- normal tests are introduced only after that retirement;
- the migration code-retirement release is deployed and verified;
- production retains the canonical `learningPaths/default` document without
  `cutover`; and
- the manifest, backup, responses, release IDs, approvals, and monitoring notes
  are retained as the permanent cutover record.
