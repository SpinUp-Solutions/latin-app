# Adversarial Review — Progress Schema Correctness & Regressions

Branch: `misc` (uncommitted diff + new untracked files). Review-only; no files edited.
Target: schema-v2 progress migration, the rewritten progress routes, lessons GET status computation, and ancillary UI/API consumers.

## Review

### Correct (with evidence)

- **Transaction atomicity is sound.** Every write in all three action branches of `src/app/api/progress/[userId]/[lessonId]/route.ts:84-178` and in `src/app/api/progress/[userId]/[lessonId]/complete/route.ts:38-79` is performed via `transaction.set(..., { merge: true })` inside `adminDb.runTransaction`, after `transaction.get` reads on both `lessonRef` and `progressRef`. No writes occur outside the transaction. The `legacy-finish` "missing exercises" path (`route.ts:152-154`) returns `{missingExercises}` from *inside* the transaction callback without calling `transaction.set`, so it correctly performs no write. (`tests/progressRoutes.test.ts` asserts `mockTransactionSet` was not called for that path.)
- **furthestPageIndex never regresses.** `visit-page` computes `Math.max(getFurthestPageIndex(existing, totalPages), submittedIndex)` (`route.ts:120`) and `getFurthestPageIndex` clamps to `[ -1, totalPages-1 ]` (`lessonProgress.ts:78-86`). The regression test `progressRoutes.test.ts` "never regresses the furthest page" passes.
- **Subset completion logic is correct.** `getMissingExercises` uses set membership of `completedIds` (`lessonProgress.ts:46-52`); stale extra records cannot block completion. Test "uses subset membership so stale extra records cannot block completion" passes.
- **Schema-v1 backward compat works.** `getFurthestPageIndex` falls back to `currentPageIndex` when `furthestPageIndex` is absent (`lessonProgress.ts:80-84`). `hasLegacyCompletion` treats `progressSchemaVersion !== 2` plus `currentPageIndex >= totalPages` as complete (`lessonProgress.ts:89-96`). `isStoredLessonComplete` ORs `status==='completed'` with legacy completion, so there is no double-count or conflict in the `legacy-finish` path. Tests "recognizes and clamps schema-v1 completion cursors" and migration "derives completion from a legacy cursor at the page count" both pass.
- **NaN/Infinity rejection.** `score: z.number().finite()` rejects NaN and Infinity; `progressRoutes.test.ts` "rejects an invalid exercise score" confirms `score: '20'` is rejected *before* the transaction starts.
- **Normal-lesson sequencing preserved.** `processNormalLessons` still only unlocks lesson N when `isStoredLessonComplete(previousProgress, previousLesson.pages.length)` (`lessons/route.ts:127-133`); `index===0` and `isLockingDisabled` paths retained. Completion gating did not regress for normal lessons.
- `/complete` empty/missing-id final-page guards are safe: `lesson.pages.at(-1)` returns `undefined` for empty `pages`; `!finalPage || finalPage.id !== finalPageId` returns `invalid-final-page` (400). Since `validateLessonProgression` now blocks publishing a lesson whose pages lack IDs, this is belt-and-suspenders.
- **All 64 tests pass; `tsc --noEmit` exits 0.**

### Blocker
None found.

### Notes (ordered by severity)

1. **`resolveExerciseId` positional remapping can silently map to the wrong exercise after reordering** — `lessonProgress.ts:59-69`. A legacy `pageN-itemM` ID is resolved by indexing into the *current* `pages[N].items[M]`. If the lesson's items were reordered since v1, the legacy record is remapped to whichever exercise now occupies that slot, silently crediting the wrong exercise. `normalizeExerciseProgress` (called on every `visit-page` and `complete-exercise`, and during migration) rewrites `exerciseProgress` with these remapped IDs *destructively* (only resolved, deduped records are kept). Risk: for live lessons whose content was reordered between v1 capture and migration, completion credit may be misattributed. Suggested mitigation: drop unmappable legacy IDs (already done via `null` check) but document explicitly that reordering is unsupported; consider logging `unmappedExerciseRecords` for admin review. (The migration route already surfaces `unmappedExerciseRecords` in its summary, which is good.) Severity: medium.

2. **Practice-lesson visible status changed from `available` to `in-progress` once any progress exists** — `lessons/route.ts:104-111` via `getStatusFromProgress`. Previously `processVocabLessons`/`processDiagrammingLessons`/`processListeningLessons` returned only `completed` or `available`. Now any non-completed saved progress yields `in-progress`. Gating is *unchanged* (practice lessons are still ungated via `processPracticeLessons`), but `CircularProgressButton` (`CircularProgressButton.tsx:22-47`) renders a distinct "in-progress" visual vs "available", so a student who partially opened a practice lesson now sees an in-progress indicator. `getInitialSlideIndex` (`dashboard/page.tsx:146-153`) only keys off `normalLessons`, so the carousel initial slide is unaffected. Severity: low/medium cosmetic + UX, confirm this is intended.

3. **`complete-exercise` cannot auto-complete a lesson with zero required exercises** — `route.ts:141`, `isCompleted = wasCompleted || (requiredExercises.length > 0 && missingExercises.length === 0)`. A text-only lesson will never flip to `completed` via this route even after the last page visit, because the guard short-circuits. Such lessons can only complete via the `/complete` route or `legacy-finish`. Confirm this is intended; it appears consistent with the design that "finish" must be an explicit action. Severity: low (by design, but undocumented).

4. **Dead/duplicate exports in `lessonUtils.ts`** — `calculateProgressFromPageIndex` (line 8), `isLessonComplete` (line 13), `getExerciseCountForPage` (line 22), `getCompletedExercisesForPage` (line 27) have no remaining importers in `src` (grep confirms only `isExerciseType` and `parsePageIndex` from `lessonUtils` are consumed, by `lessonProgress.ts`). These four functions are now dead exports. `parsePageIndex` remains legitimately used. Suggested follow-up cleanup (not in scope of this review target) to remove the dead four. Severity: low (tech debt).

5. **`visit-page` rewrites `exerciseProgress` on every navigation** — `route.ts:127`. `normalizeExerciseProgress` is run and the stored array is replaced with only resolvable records. Once fully migrated to stable IDs this is a no-op, but during the migration window, a record that happens to be momentarily unresolvable (e.g. lesson temporarily missing the page) would be dropped from the stored document rather than preserved. The migration route writes a backup to `userProgressMigrationV2Backups` first, but the per-visit rewrite does *not*. Severity: low (edge-case data-loss window).

6. **`currentPageIndex: furthestPageIndex` overwrites the authored cursor** — `route.ts:128, 68, 162`. After spreading `...existing`, `currentPageIndex` is force-set to `furthestPageIndex`. This is consistent and intentional (deprecation comment in `lesson.d.ts`), and no data is *lost* (furthest is derived from the max of existing furthest/current and the submitted index), but note the v1 `currentPageIndex` cursor is permanently overwritten on the first v2 write. Migration route (`progressMigration.ts:34`) does the same. Acceptable per the migration design.

7. **`legacy-finish` with zero pages** — `route.ts:161` `Math.max(lesson.pages.length - 1, 0)` yields `furthestPageIndex=0` when `pages=[]`, and the branch would write `status:'completed'`. `validateLessonProgression` should prevent zero-page lessons from being live, so this is academically only. Severity: trivial.

8. **`update-publish-status` validation returns mid-batch-loop** — `update-publish-status/route.ts:50-55`. The check returns 400 inside the per-lesson loop, but the batch is only committed after the loop, so no partial writes occur. Behavior is correct; noting only because the error message singles out one `lessonId` while other IDs in the request payload are ignored — acceptable for a fail-fast validation.

### Summary
The schema-v2 refactor is internally coherent and well-tested. Atomicity, monotonicity, backward compatibility, and validation hardening (finite scores, action inference, progression validation on publish) are all correct. The two substantive concerns worth surfacing to the author are (#1) legacy positional-ID remapping silently miscrediting after reorder, and (#2) the practice-lesson `in-progress` status change being a visible behavioral delta vs prior `available`. Neither is a blocker.

## Evidence

- Commands run:
  - `git status --short`, `git diff --stat`, `git diff <focus files>` (read-only)
  - `npx jest --config jest.config.mjs` → 17 suites / 64 tests pass
  - `npx tsc --noEmit` → exit 0
- Files inspected: `src/utils/lessonProgress.ts`, `src/utils/progressMigration.ts`, `src/app/api/progress/[userId]/[lessonId]/route.ts`, `src/app/api/progress/[userId]/[lessonId]/complete/route.ts`, `src/app/api/lessons/route.ts`, `src/types/lesson.d.ts`, `src/utils/lessonUtils.ts`, `src/store/api/lessonApi.ts`, `src/app/api/admin/progress/migrate-stable-ids/route.ts`, `src/app/api/admin/lessons/route.ts`, `src/app/api/admin/lessons/update-publish-status/route.ts`, `src/app/dashboard/page.tsx`, `src/components/ui/lesson/lesson-player.tsx`, `tests/lessonProgress.test.ts`, `tests/progressRoutes.test.ts`.
- No files were edited (review-only). No staged files.