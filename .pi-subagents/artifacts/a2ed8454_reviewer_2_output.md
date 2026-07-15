# Adversarial Review — TEST VALIDATION DEPTH + UI/PLAYBACK FLOW INTEGRATION

Branch `misc`, working tree has unstaged diff + new untracked test files. All evidence sourced directly from `git diff`, file reads, and a live test run.

## Review Summary

- No blockers. `tsc --noEmit`, `eslint` (changed targets + tests), and the six new test files (23 tests) all pass.
- The route-side test mocking is *shallow Firestore only* — it does exercise real route parsing, action discrimination, helper calls, and doc construction, so it is not mere mock wiring.
- The substantive test-coverage gaps are concentrated in the **migration route** (only the malformed-JSON rejection is tested) and the **PageTemplate contract change** (only verified through a mock). Several smaller gaps in `legacy-finish` and `visit-page(via currentPageIndex)` paths also surface.
- UI/flow surface (swiper-nav rAF/pointer, dashboard Swiper config, visit-page ref guard, finish-button state machine) is structurally sound.

---

## Correct (with evidence)

### Route tests exercise real logic, not just mocks
`tests/progressRoutes.test.ts:28-58` mocks `firebase-admin` and `NextResponse`, but `configureTransaction` only stubs `transaction.get/set` — the actual `updateProgress` POST body parsing (`src/app/api/progress/[userId]/[lessonId]/route.ts:55-83`), discriminated-union Zod schema, helper calls (`resolveExerciseId`, `normalizeExerciseProgress`, `getMissingExercises`, `getFurthestPageIndex`, `isStoredLessonComplete`), and document construction all run in test. The mocks do not bypass the route logic.

### furthestPageIndex non-regression covered
`tests/progressRoutes.test.ts:143-154` posts `pageId:'page-1'` (index 0) against existing `furthestPageIndex:1` and asserts both the response's `furthestPageIndex === 1` and the persisted doc's `furthestPageIndex === 1`. This exercises `src/app/api/progress/[userId]/[lessonId]/route.ts:163 Math.max(getFurthestPageIndex(existing), submittedIndex)`.

### finish idempotency covered
`tests/progressRoutes.test.ts:177-189` calls `finishLesson` against a `status:'completed'` doc and asserts status 200, `alreadyCompleted:true`, and a persisted `completedAt` that preserves the existing value (`existing.completedAt || now` at `complete/route.ts:69`).

### missingExercises content covered (shape + equality)
`tests/progressRoutes.test.ts:165-172` asserts the 422 body's `missingExercises === [{ objectContaining({exerciseId:'exercise-1', pageIndex:0}) }]`. Tight shape check; not just length.

### v1→v2 backward-compat helpers well covered
`tests/lessonProgress.test.ts:23-47` covers `resolveExerciseId` for `page0-item1 → exercise-a`, `page1-item0 → null` (non-exercise), and stable-id passthrough. `normalizeExerciseProgress` dedup+drop-removed-positions is also asserted. Migration `migrateUserProgress` (`tests/lessonProgress.test.ts:108-127`) covers completion preservation, mapping count, derived completion, and `progressSchemaVersion:2`.

### Migration dry-run vs write — IMPLEMENTED but NOT TESTED
The route at `src/app/api/admin/progress/migrate-stable-ids/route.ts:30-37` correctly requires `confirmWrite === true` when `dryRun !== false`, and conditionally gates backup+progress writes inside `if (!dryRun) {...}` blocks (`route.ts:84-103`). The behavior is present and correct; it just has no test (see blockers / gaps below).

### Preview-mode gating covered (with shallow child mock — still valid)
`tests/lessonPlayerPreview.test.tsx:18-23` mocks `page-template` and `lesson-navigation`, but the mock only forwards the real `onExerciseComplete`/`onFinish` callbacks the real `LessonPlayer` constructs. The test therefore exercises the **real `LessonPlayer` guards** at `lesson-player.tsx:54 (visit-page)`, `lesson-player.tsx:96-98 (exercise gate)`, and `lesson-player.tsx:140-143 (finish toast)`. It asserts none of the three RTK mutations are called and that `toast.info('Preview mode: progress is not tracked.')` fires. The visit-page useEffect's own `if (!trackProgress || ...) return;` is exercised by rendering real `LessonPlayer` with `trackProgress={false}`.

### Finish button state machine covered
`tests/lessonNavigation.test.tsx:14-34` covers all three states: `Next` on inner pages (calls `onNext`, not `onFinish`), `Finish Lesson` enabled on last page (calls `onFinish`), and `Finishing…` disabled when `isFinishing`. The disabled state at `lesson-navigation.tsx:138 disabled={isFinishing}` would suppress click bubbling in the browser, so double-submission is also prevented.

### Swiper-nav rewrite is clean
`src/components/ui/core/swiper-nav.tsx`:
- rAF cancelled on unmount: cleanup at `:138-139` calls `window.cancelAnimationFrame(frameRef.current)` if non-null. ✓
- pointer capture released on both pointerup AND pointercancel: `finishDrag` (line 80-102) releases via `barRef.current?.hasPointerCapture(event.pointerId)` and is wired to both `onPointerUp` and `onPointerCancel` (`:152-153`). ✓
- 0-width bounds / div-by-zero guarded: `updateDrag` returns early on `!bounds || bounds.width === 0` (`:60`). ✓
- SSR-safe: `window.requestAnimationFrame` is only referenced inside event handlers/effect (post-mount), so no SSR crash; the `'use client'` directive plus Swiper's client-only mount context also protects this.
- `setProgress` always fed a clamped `[0,1]` value via `clampProgress` (`:7`) in `updateDrag` before rAF flush.

### Dashboard Swiper config still navigates
`src/app/dashboard/page.tsx:280-310` removed `swiper/css/navigation` and `modules={[]}`. `SwiperNavigation` (`swiper-nav.tsx:117-148`) drives `swiper.slidePrev/slideNext/slideTo` — all core Swiper APIs that need *no* `Navigation` module. The `<div slot="container-end">` placement is valid: Swiper supports `container-end` as a portal slot, and `useSwiper()` still resolves the context because the div remains inside the Swiper viewport. ✓

### visit-page useEffect double-fire guard
`src/components/ui/lesson/lesson-player.tsx:50-58` uses `lastVisitedPageId.current` ref + `===` short-circuit. In React StrictMode dev double-invoke, the second run sees `lastVisitedPageId.current === currentPage.id` and bails before posting.

### handleExerciseComplete signature migration is consistent
`src/components/ui/lesson/page-template.tsx:15` changed `(itemIndex, score) → (exerciseId: string, score)`. Grep for `onExerciseComplete` shows only two call sites: `page-template.tsx:37 onExerciseComplete?.(item.id, score)` and `lesson-player.tsx:229 onExerciseComplete={handleExerciseComplete}` (whose signature at `:93-103` is now `(exerciseId: string, score)`). `ContentRenderer` (`content-renderer.tsx`) keeps its own `(score) => void` contract, and `PageTemplate.handleItemComplete` (line 27-49) bridges itemIndex→`item.id`. No stale `itemIndex` call site remains.

### LessonPreview defaults trackProgress=false
`src/components/ui/admin/lesson-builder/LessonPreview.tsx:24` now passes `trackProgress={false}`. The admin preview `[id]/page.tsx:48` also passes `trackProgress={false}`. Both admin preview routes are properly gated.

---

## Blocker
None. `tsc --noEmit`, `eslint` (changed files + tests dir), and the 23-test suite all pass cleanly.

---

## Gaps / Notes (prioritized)

### GAP-G1 (Medium) — Migration route destructive write path is untested
`src/app/api/admin/progress/migrate-stable-ids/route.ts` has only ONE test (`progressRoutes.test.ts:130-138`) — the malformed-JSON rejection. Untested behaviors that the task explicitly called out:
- `dryRun: true` (default) writes NOTHING — neither the `userProgressMigrationV2Backups` doc nor the migrated `userProgress` doc. The route's `if (!dryRun) {batch.set...}` (`:84-103`) is never asserted.
- `dryRun:false` WITHOUT `confirmWrite:true` is rejected with 400 (`route.ts:36-37`). Not tested.
- `dryRun:false, confirmWrite:true` actually schedules writes (backup + migrated progress) and commits batches when reaching `BATCH_SIZE * 2` (`:88-99`).

Suggested fix: add tests in `progressRoutes.test.ts`:
1. Call `migrateProgress(request({dryRun:true}))` → assert `summary.dryRun === true` and that no `batch.set` was called (assert `pendingWrites === 0` via mocking `batch`).
2. Call `migrateProgress(request({dryRun:false}))` (no confirmWrite) → assert 400 with the `confirmWrite` error string.
3. Call `migrateProgress(request({dryRun:false, confirmWrite:true}))` with one v1 progress doc → assert backup+progress writes occur and `summary.documentsMigrated === 1`.

`migrateUserProgress` itself is well covered (`lessonProgress.test.ts:108-127`), so the gap is purely in route wiring.

### GAP-G2 (Medium) — PageTemplate contract change is not unit-tested
`tests/lessonPlayerPreview.test.tsx:24-27` mocks `page-template` entirely. So `PageTemplate`'s real new behavior — `handleItemComplete(index, score)` calling `onExerciseComplete?.(item.id, score)` (`page-template.tsx:37`), instead of legacy `onExerciseComplete(itemIndex, score)` — is exercised nowhere. `ContentRenderer` returning `onComplete(score)` (which PageTemplate then bridges via `index` → `item.id`) is also not covered.

Suggested fix: add `tests/pageTemplate.test.tsx` that renders real `PageTemplate` with a stub `ContentRenderer` (or a known exercise type) and asserts `onExerciseComplete` receives `{item.id, score}`, including the case where the page contains a non-exercise first item.

### GAP-G3 (Medium) — `legacy-finish` action has no route-level test
`src/app/api/progress/[userId]/[lessonId]/route.ts:184-218` implements `legacy-finish` for cached client bundles. Its Zod arm (`:29`) is implicitly exercised by schema parse, but its actual handler (requires all required exercises OR already-completed, otherwise returns 422 via `missingExercises`) is never called in tests. A small refactor could break old clients silently.

Suggested: add a test calling `updateProgress` with `{action:'legacy-finish'}` for an already-completed doc (= idempotent) and for an incomplete doc (= 422 with `missingExercises`).

### GAP-G4 (Low) — `visit-page` with `currentPageIndex` (legacy fallback) untested
`route.ts:148-152` falls back to `Number(progressData.currentPageIndex)` when `pageId` is absent. The schema branch (`pageId optional, currentPageIndex optional` with `.refine`) permits this; only the `pageId` path is tested (`progressRoutes.test.ts:143-154`).

### GAP-G5 (Low) — Idempotent finish route implicitly migrates schemas but test doesn't catch it
`tests/progressRoutes.test.ts:177-189` configures existing with no `progressSchemaVersion` (v1) but asserts only `status` and `completedAt`. The route at `complete/route.ts:71` always writes `progressSchemaVersion: PROGRESS_SCHEMA_VERSION` (=2), so the finish route auto-upgrades v1→v2 docs. The side-effect is invisible to the test; if someone later removed that write, the test still passes.

Suggested: add `progressSchemaVersion: 2` to the `objectContaining` assertion so silently-upgrading v1 becomes an observably-locked behavior.

### GAP-G6 (Low) — complete-exercise silently completes a lesson WITHOUT advancing furthestPageIndex
`route.ts:113 furthestPageIndex: getFurthestPageIndex(existing, lesson.pages.length)` preserves existing furthestPageIndex, while `legacy-finish`/`complete/route.ts:65 furthestPageIndex = lesson.pages.length - 1` advance it. A user who completes all required exercises from page 0 will have `status:'completed'` but `furthestPageIndex:0`; on re-enter, `lesson-player.tsx:43-45` resumes them at page 0 despite the completed badge. Not a data bug, but counterintuitive UX worth a note.

### GAP-G7 (Low) — Dashboard LessonCard does NOT render rich text for student-facing titles
`src/app/dashboard/page.tsx:63-65` keeps `<h3 className="...">{lesson.title}</h3>` and `<div className="..."><SimpleRichDisplay content={lesson.description||''} /></div>` (description uses SimpleRichDisplay but title does not). Wait — verified via `grep`: only `description` uses `SimpleRichDisplay`; `title` is rendered as JSX text — so any HTML in `lesson.title` (now that `SortableLessonItem` (`SortableLessonItem.tsx:46-48`) and `live/page.tsx:446-448` render titles rich) will surface as literal `<p>...</p>` text on the student dashboard. Inconsistent across surfaces and untested. Suggest wrapping LessonCard's title in `<SimpleRichDisplay content={lesson.title} />` too.

### NOTE-N1 (Low) — Role="heading" on a div: justified, not an antipattern
`SortableLessonItem.tsx:46`, `SentenceDiagramStudent.tsx:339`, and `live/page.tsx:446` use `<div role="heading" aria-level={3}>` wrapping `SimpleRichDisplay`. Per ARIA's first rule this is generally discouraged, but here the underlying rich content is `dangerouslySetInnerHTML` wrapping `<p>` — a block element — which CANNOT nest inside `<h3>` validly per HTML spec. Using a div with `role=heading` is the semantically cleanest legal option. `getByRole('heading', {name})` correctly resolves the accessible name from the rendered text (HTML stripped) — confirmed by passing tests. Not a defect.

### NOTE-N2 (Low) — ESLint and TS clean on all changed + test files
`npx eslint ...` returned no output; `npx tsc --noEmit` returned no output. No type drift from making `UserProgress.currentPageIndex` optional. Grebbed the codebase: no consumer relies on it being required; the migration helper and route tolerate undefined via `?? currentPageIndex ?? 0` / `typeof ... === 'number'` guards.

### NOTE-N3 (Low) — Swiper removes `modules={[]}` prop entirely
`dashboard/page.tsx:277-286` no longer passes `modules`. In Swiper v10+ this means "core only" (no modules registered), which is the intended state since `SwiperNavigation` uses only core APIs. Harmless. If a future developer adds a Pagination/Navigation import-only prop without re-registering `modules`, things will break silently — non-issue for this diff.

---

## Acceptance Report
---