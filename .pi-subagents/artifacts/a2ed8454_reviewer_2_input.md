# Task for reviewer

[Read from: /Users/harry/Documents/dev/chris/latin-app/plan.md, /Users/harry/Documents/dev/chris/latin-app/progress.md]

Adversarial code review. Angle: TEST VALIDATION DEPTH + UI/PLAYBACK FLOW INTEGRATION.

Inspect the repository directly (run `git diff`, read files). Do NOT rely on any conversation summary. Current uncommitted diff on branch `misc` plus new untracked test files is the review target.

Focus files:
- tests/progressRoutes.test.ts, tests/lessonProgress.test.ts, tests/lessonPlayerPreview.test.tsx, tests/lessonNavigation.test.tsx, tests/richTextRendering.test.tsx, tests/adminLessonProgressValidation.test.ts
- src/components/ui/lesson/lesson-player.tsx (rewritten)
- src/components/ui/exercises/lesson-navigation.tsx (rewritten)
- src/components/ui/lesson/page-template.tsx (onExerciseComplete contract changed itemIndex->exerciseId)
- src/components/ui/core/swiper-nav.tsx (rewritten pointer/rAF)
- src/app/dashboard/page.tsx
- src/components/admin/SortableLessonItem.tsx, src/features/sentence-diagramming/SentenceDiagramStudent.tsx (rich text)
- src/components/ui/core/simple-rich-display.tsx (read it)

Investigate specifically (TESTS):
1. Do the new tests actually cover the real risk paths, or are they superficial? Specifically: v1->v2 backward-compat regression, transaction atomicity, furthestPageIndex non-regression, missingExercises content, finish idempotency, migration dry-run vs write behavior, preview-mode gating (trackProgress=false), finish-button enabled/disabled/finishing states.
2. Are mocks so heavy they bypass the real code? E.g. progressRoutes.test.ts mocks adminDb.collection/runTransaction and NextResponse — does it actually exercise the route logic or just the mock wiring? Does the migration test assert that dryRun writes NOTHING (backup + progress)? Does any test verify confirmWrite is required for writes?
3. lessonPlayerPreview.test.tsx: mocks page-template and lesson-navigation entirely. Does it prove the REAL LessonPlayer gates trackProgress correctly, or only that mocked children are not called? Is the visit-page useEffect covered?
4. richTextRendering.test.tsx asserts `getByRole('heading', { name: '...' })` on a `<div role='heading' aria-level={3}>` containing SimpleRichDisplay. Does a div with role=heading actually satisfy getByRole('heading') AND expose an accessible name from rendered rich text (img alt, etc.)? Is role='heading' on a div an accessibility antipattern vs a real heading element? Read simple-rich-display.tsx to verify the rendered output.

Investigate specifically (UI/FLOW):
5. lesson-player useEffect for visit-page: fires on `currentPage?.id` change with a lastVisitedPageId ref guard. Does it double-fire in React StrictMode/dev? Does it fire on initial mount for a resumed lesson (potentially overwriting furthestPageIndex with an earlier page on resume)? When navigating back to an earlier page, does visit-page correctly NOT regress furthestPageIndex (server-side) — and is that tested?
6. handleExerciseComplete now receives `exerciseId` (stable id) instead of `(itemIndex, score)`. PageTemplate now calls `onExerciseComplete?.(item.id, score)`. Are ALL callers of PageTemplate/onExerciseComplete updated consistently? Any place still passing itemIndex?
7. lesson-navigation: Next button becomes Finish Lesson when `!canGoNext` (last page). What defines canGoNext? If a user jumps to the last page via the page popover while exercises are incomplete, does Finish appear immediately? Is `onFinish` only ever called on the final page? Is the `disabled={isFinishing}` correct (button still clickable via onFinish path)?
8. swiper-nav rewrite: pointer capture + requestAnimationFrame. Check: rAF cancelled on unmount (cleanup in useEffect/useCallback)? pointer capture released on pointerup/pointercancel? Does it handle the swiper not being ready / 0 slides (division by zero in updateDrag via bounds.width===0 guard)? Any SSR/window references guarded? Is `setProgress` called with valid progress bounds?
9. dashboard page: removed `swiper/css/navigation` import and `modules={[]}` — does navigation still work without the Navigation module? Is the `slot='container-end'` div placement valid for Swiper?

Return concise, evidence-backed findings with file:line references and suggested fixes. Prioritize by severity. This is review feedback, NOT a context summary. Do NOT edit any files.

---
**Output:**
Write your findings to exactly this path: /Users/harry/Documents/dev/chris/latin-app/.pi-subagents/artifacts/outputs/a2ed8454/review-tests-ui-flow.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.

## Acceptance Contract
Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```