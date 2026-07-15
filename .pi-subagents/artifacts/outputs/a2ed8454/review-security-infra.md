# Adversarial Review — Auth / Security Boundaries / Destructive Admin / Infra

Branch: `misc` · Review target: uncommitted diff + new untracked files · Reviewer role: security/infra · No files were edited.

## Scope inspected

- `src/lib/verifyRequestAuth.ts` (new, untracked)
- `src/app/api/admin/progress/migrate-stable-ids/route.ts` (new, untracked)
- `src/app/api/admin/lessons/route.ts` (modified — progression validation on PUT)
- `src/app/api/admin/lessons/update-publish-status/route.ts` (modified — progression validation)
- `src/app/api/progress/[userId]/[lessonId]/route.ts` (modified — switched to `verifyRequestAuth`)
- `src/app/api/progress/[userId]/[lessonId]/complete/route.ts` (new, untracked)
- `firestore.indexes.json` (modified — 3 new composite indexes)
- `firestore.rules` (unmodified — read for new-collection rules)
- `docs/practice-lesson-categorization.md` (new plan doc)
- `src/lib/verifyAdminAccess.ts`, `src/utils/progressMigration.ts`, `src/utils/lessonProgress.ts` (supporting)
- All `verifyRequestAuth` / `verifyAdminAccess` call sites grepped repo-wide (42 call sites)

## Review

### Correct (with evidence)

- **verifyRequestAuth null-handling is consistent across every caller.** `verifyRequestAuth` returns `null` on missing Bearer header and on token-verify failure (`src/lib/verifyRequestAuth.ts:7,11`). All three call sites check `!currentUser` before touching `.uid`:
  - `src/app/api/progress/[userId]/[lessonId]/route.ts:36` (GET) and `:56` (POST): `if (!currentUser || currentUser.uid !== userId) return 401`
  - `src/app/api/progress/[userId]/[lessonId]/complete/route.ts:22`: same guard
  - No caller forgets the null check → no NPE/500 leak path. The migration from the old throwing `verifyAuth` (which on missing header threw `'No authorization header'` and landed in the generic 500 catch) to the null-returning helper is a strict improvement: missing/invalid token now consistently yields `401 { error: 'Unauthorized' }` instead of a 500.
- **No anonymous-vs-invalid token enumeration leak at the API layer.** `verifyRequestAuth` collapses both "no Bearer header" and "verifyIdToken rejected" into the same `null`, and every caller emits the identical `401 { error: 'Unauthorized' }` body. There is no status/body differentiator that would let a caller distinguish present-but-invalid from absent. (The Admin path does an extra DB lookup for the role check, which is an inherent authn→authz step, not an oracle.)
- **Migration batch math is correct; no double-commit / no missed flush.** `pendingWrites += 2` per migrated doc (one backup `set` + one progress `set`); the in-loop flush fires at `pendingWrites >= BATCH_SIZE * 2` (i.e. every 200 docs / 400 writes) then resets `pendingWrites = 0` and allocates a fresh `batch` (`migrate-stable-ids/route.ts:64-69,74-79`). The tail flush is gated on `pendingWrites > 0` (`:83`), so it only commits a non-empty remainder. Skipped docs (already v2, missing lesson) hit `continue` before any write and do not perturb the counter. Verified: a crashed mid-run is **resumable** — already-migrated docs carry `progressSchemaVersion === 2` and are `continue`'d before the backup write (`:53-57`), so a re-run neither re-migrates nor double-writes backups for them.
- **`dryRun` defaulting is safe.** `dryRun = body.dryRun !== false` (`:38`): absent key → `undefined !== false` → `true` (dry run). Only an explicit `false` triggers writes, and writes are further gated by `confirmWrite === true` (`:40-42`). A `.strict()` Zod schema (`:16`) rejects unknown keys, preventing option-injection.
- **Publish-batch validation is not partially applied.** In `update-publish-status/route.ts:50-55` the `return 400` on a progression error happens **before** `batch.commit()` (`:79`). Firestore batches are in-memory until `commit()`, so an early return discards the aggregated writes for the whole `lessonIds` list rather than committing a subset — no partial/inconsistent publish state. This is a single atomic commit per request, not per-lesson. The same holds for the admin PUT route, which validates before the single `.set(...)` (`route.ts:152-158` → `:189`). Neither route is susceptible to the "earlier lessons published, later ones not" hazard.
- **Migration summary leaks no PII.** The response is pure aggregate counters (`documentsScanned`, `documentsMigrated`, `documentsAlreadyMigrated`, `documentsSkippedMissingLesson`, `mappedExerciseRecords`, `unmappedExerciseRecords`, `deduplicatedExerciseRecords`, `derivedCompletions`, `completedLessonsPreserved`, `batchesCommitted`, `dryRun`) — no UIDs, lesson IDs, or progress payloads. The only per-request identifier written server-side is `migratedBy: admin.uid` into the backup docs (`:75`), which is never echoed in the response.
- **Admin auth on the destructive migration is enforced and status-mapped correctly.** `migrate-stable-ids/route.ts:19` calls `verifyAdminAccess`, which throws `AdminAccessError` with the proper `401`/`403` status; the catch at `:88-90` maps it to `error.status` and `error.message`. This route is the only admin route in the diff that handles `AdminAccessError` at its real status code.

### Blocker

- **`firestore.rules` leaves the two new collections (and the migration backup collection) fully writable/readable by any client.** This directly contradicts an explicit, repeated requirement of the plan. The entire rules file is:
  ```
  match /{collection}/{document=**} {
    allow read, write: if collection != 'diagramming_attempts';
  }
  ```
  (`firestore.rules`). This wildcard grants `read, write` to **every** collection except `diagramming_attempts`, with **no auth check at all** — not even `request.auth != null`. Consequences for this diff:
  1. `practiceCategories` and `practiceCategoryMemberships` — the plan states verbatim: *"The two new collections should be denied to direct clients in Firestore security rules; admin access flows through the API routes"* and *"The existing permissive Firestore client rules must not expose the new admin-only collections."* `firestore.rules` is **unchanged** in this diff, so neither collection is protected. No data exists yet (Phase 0/plan only), but the indexes shipped in `firestore.indexes.json:465-512` declare intent to use these collections; if Phase 1 lands without a rules change, any client can create/delete/administer categories by direct Firestore writes, fully bypassing `verifyAdminAccess`.
  2. `userProgressMigrationV2Backups` — newly introduced by `migrate-stable-ids/route.ts:74`. Each backup doc stores `data: existing`, i.e. a **full copy of the user's progress record** (exercise completions, scores, page progress, `userId`, `lessonId`). Under the wildcard rule this collection is **client-readable and client-writable with no auth**. A client can exfiltrate every user's progress history (`firestore.rules` → `read: if collection != 'diagramming_attempts'` → allowed) and can tamper with backups. This is PII/integrity exposure introduced by this diff's new write path, on top of the pre-existing fact that `userProgress` itself is already wildcard-readable.

  Suggested fix: add explicit deny rules for the three server-only collections *before* any code writes to them, e.g.
  ```
  match /practiceCategories/{doc=**}        { allow read, write: if false; }
  match /practiceCategoryMemberships/{doc=**} { allow read, write: if false; }
  match /userProgressMigrationV2Backups/{doc=**} { allow read, write: if false; }
  ```
  (Placing these before / in lieu of the catch-all wildcard match so the specific denies win.) The `firestore.rules` file must be part of this change set, not deferred.

### Notes (non-blocking, prioritized)

- **N1 (High) — Premature indexes without the required rules.** `firestore.indexes.json:465-512` adds three composite indexes for `practiceCategories` (×2) and `practiceCategoryMemberships` (×1). The plan marks these as *"declared … as part of this plan … not left for runtime discovery"* and pairs them with a rules change (Phase 1: *"Add Firestore security rules for the two server-only collections and verify the … composite indexes against the implemented query shapes"*). The indexes are committed here but the rules and the implementing code are not. This is half of a required pair. Declaring indexes against collections that have no rules and no writer is dead config today; shipping it in isolation signals the feature is further along than it is and risks the rules change being forgotten when Phase 1 lands. Recommend either (a) hold the indexes with the Phase 1 rules+code change, or (b) add the deny rules in this same diff so the collections are protected the moment any data appears.
- **N2 (Medium) — Full-collection scans on every migration call (cost / unbounded memory).** `migrate-stable-ids/route.ts:44-48` does `adminDb.collection('userProgress').get()` and `adminDb.collection('lessons').get()` with no cursor/limit/`where`. On every invocation — including a *dry run* — both entire collections are loaded into memory and `lessons` is fully materialized into a `Map`. It is admin-gated, so not an unauthenticated DoS vector, but for a production-sized dataset a single call can pull millions of docs into one Node process and time out / OOM. Since the route is designed for one-time use, recommend documenting it as single-use/manual-only and/or switching to a paginated/cursored scan plus a targeted `where('progressSchemaVersion','!=',2)` filter (which itself would need an index) to bound per-call work.
- **N3 (Low, pre-existing) — `update-publish-status/route.ts` mis-maps `AdminAccessError` to 500.** `verifyAdminAccess` throws on non-admin/missing token, but this route's catch does only `console.error` + `500 'Failed to update lessons'` (`:81-84`). The pattern `const user = await verifyAdminAccess(request); if (!user) return 401` (`:14-16`) is **dead code** — `verifyAdminAccess` never returns null. So a forbidden (403) or unauthenticated (401) caller gets a 500. This is pre-existing (the diff only added the progression check at `:50-55`) and not a regression introduced here, but it is worth fixing alongside: catch `AdminAccessError` and return its `status`, and remove the dead `if (!user)`. The same dead-null-check pattern recurs in `admin/lessons/route.ts:29,74,132`, though that route's catch does inspect `error.message` and at least returns 401 (it still flattens a 403 Forbidden to a 401). The new migration route (`migrate-stable-ids/route.ts:88-90`) is the only one that does this correctly and should be the template.
- **N4 (Low) — Inconsistent auth-helper surface.** There are now three coexisting patterns: `verifyRequestAuth` (returns `null`), `verifyAdminAccess` (throws `AdminAccessError`), and a local `verifyAuth` in `src/app/api/lessons/route.ts:6` (returns `null`) and `src/app/api/words/search/route.ts:16`. The student-facing `api/lessons/route.ts` local `verifyAuth` also returns `null` for missing header and uses `currentUser` unchecked for an anonymous path (intentional — anonymous reads live lessons). This is not a bug, but the proliferation of near-duplicate helpers is a maintainability/consistency risk; a future refactor should collapse the student token-verify helpers onto `verifyRequestAuth`.
- **N5 (Info) — `lessonProgress`/`progressMigration` utilities are not part of this security surface.** Spot-checked `src/utils/progressMigration.ts` for destructive behavior: it is a pure transform (builds a normalized `Map` of stable-ID exercise records, dedups by latest `completedAt`, derives completion). No writes, no external calls; safe to call from the migration loop. Tests `tests/lessonProgress.test.ts`, `tests/progressRoutes.test.ts`, `tests/adminLessonProgressValidation.test.ts` pass (17/17).

### Validation performed

- `git diff --stat HEAD` and `git status --short` to enumerate the review surface (17 modified + 8 untracked, including the focus files).
- `git diff` on `update-publish-status/route.ts`, `admin/lessons/route.ts`, `firestore.indexes.json`, and `progress/[userId]/[lessonId]/route.ts` to confirm exactly what this diff changes (validation additions + verifyRequestAuth swap + new indexes).
- Repo-wide grep for `verifyRequestAuth|verifyAdminAccess|verifyAuth` (42 hits) to audit **every** caller for null-handling correctness — all `verifyRequestAuth` call sites are safe.
- Read `firestore.rules` in full — confirmed no new-collection rules and the unauthenticated wildcard.
- `npx jest tests/progressRoutes.test.ts tests/adminLessonProgressValidation.test.ts tests/lessonProgress.test.ts` → **3 suites, 17/17 passed**.
- `git diff --cached --stat` → empty (no staged files).

### Suggested fixes (summary, for the parent — not applied)

1. **(Blocker)** Add `allow read, write: if false` rules for `practiceCategories`, `practiceCategoryMemberships`, and `userProgressMigrationV2Backups` to `firestore.rules` in this same change set, placed before the catch-all wildcard match. At minimum the backup collection must be denied — it stores full per-user progress PII and is introduced by this diff.
2. **(N1)** Either move the three `practiceCategories`/`practiceCategoryMemberships` indexes into the Phase 1 PR (with rules + code) or add the deny rules now; do not ship bare indexes for a plan-only feature without the matching security rules.
3. **(N2)** Paginate/cursor the migration scans and gate on `progressSchemaVersion != 2`; document the route as single-use/manual.
4. **(N3)** In `update-publish-status/route.ts` (and ideally `admin/lessons/route.ts`), catch `AdminAccessError` and return its `status`; remove the dead `if (!user)` checks.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Review adhered to the requested angle (auth/security/destructive-admin/infra) and stayed within scope: only inspected/reported; no files edited, no scope widened. Findings limited to the focus files plus call-site/ supporting files necessary to verify caller safety and rules coverage."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "Evidence provided via git diff/stat, full firewall.rules + index read, repo-wide caller grep (42 sites), file:line citations, and a passing test run (17/17)."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "git diff --stat HEAD && git status --short",
      "result": "passed",
      "summary": "Enumerated 17 modified + 8 untracked files; focus files confirmed present."
    },
    {
      "command": "git diff <focus files>",
      "result": "passed",
      "summary": "Confirmed diff scope: progression-validation additions, verifyRequestAuth swap, 3 new composite indexes. firestone.rules unchanged."
    },
    {
      "command": "grep -rn 'verifyRequestAuth|verifyAdminAccess|verifyAuth' src",
      "result": "passed",
      "summary": "42 call sites audited; all verifyRequestAuth callers check !currentUser; no null deref."
    },
    {
      "command": "npx jest tests/progressRoutes.test.ts tests/adminLessonProgressValidation.test.ts tests/lessonProgress.test.ts",
      "result": "passed",
      "summary": "3 suites, 17/17 tests passed in 0.305s."
    },
    {
      "command": "git diff --cached --stat",
      "result": "passed",
      "summary": "Empty staged index — no staged files; reviewer made no edits."
    }
  ],
  "validationOutput": [
    "progressRoutes.test.ts, adminLessonProgressValidation.test.ts, lessonProgress.test.ts: 17/17 passed",
    "git diff --cached --stat: empty (noStagedFiles = true)",
    "firestore.rules read: unauthenticated wildcard allow for all collections except diagramming_attempts; no new-collection rules present"
  ],
  "residualRisks": [
    "firestore.rules remains a wildcard allow with no auth check — blocker for the two new practice-category collections and the new userProgressMigrationV2Backups PII collection until deny rules are added.",
    "Migration scans full userProgress + lessons collections per call; cost/OOM risk on large datasets (admin-gated, single-use)."
  ],
  "noStagedFiles": true,
  "diffSummary": "Adds live-lesson progression validation to admin PUT and update-publish-status routes; swaps progress GET/POST and new complete route to a null-returning verifyRequestAuth; adds a one-time admin backfill migration (migrate-stable-ids) writing backups of each userProgress doc; adds three composite Firestore indexes for planned practiceCategories/practiceCategoryMemberships collections described in a new plan doc.",
  "reviewFindings": [
    "blocker: firestore.rules grants unauthenticated read/write to every collection except diagramming_attempts; practiceCategories, practiceCategoryMemberships, and the new PII-bearing userProgressMigrationV2Backups are all client-exposed. Plan explicitly requires these to be server-only/denied — rules unchanged in this diff.",
    "note-1 (high): firestore.indexes.json ships 3 composite indexes for practiceCategories/practiceCategoryMemberships while the plan is Phase 0 only and the matching security rules + implementing code are absent — half of a required pair.",
    "note-2 (medium): migrate-stable-ids/route.ts:44-48 loads entire userProgress and lessons collections into memory on every call (incl. dry run); no cursor/limit/filter — cost/OOM risk on production data.",
    "note-3 (low, pre-existing): update-publish-status/route.ts:14-16,81-84 has dead `if(!user)` check and swallows AdminAccessError as 500 instead of 401/403; admin/lessons/route.ts flattens Forbidden 403→401.",
    "note-4 (low): three coexisting auth-helper variants (verifyRequestAuth null-return, verifyAdminAccess throw, local verifyAuth) — consistency/maintainability risk.",
    "ok: verifyRequestAuth null-handling correct at all 3 call sites; no NPE/500 leak.",
    "ok: publish-batch validation returns 400 before batch.commit() — no partial publish state; atomic.",
    "ok: migration batch math correct, resumable/idempotent on re-run, dryRun/confirmWrite gating safe, summary leaks no PII.",
    "ok: AdminAccessError mapped to correct 401/403 in migrate-stable-ids route."
  ],
  "manualNotes": "No blockers found in the code logic itself; the single blocker is the missing firestore.rules change, which must land before (or with) any code that writes to the three server-only collections. Recommend the parent add the deny rules in this same diff rather than deferring to Phase 1, given the migration route already writes to userProgressMigrationV2Backups."
}
```