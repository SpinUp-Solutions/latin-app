# Task for reviewer

[Read from: /Users/harry/Documents/dev/chris/latin-app/plan.md, /Users/harry/Documents/dev/chris/latin-app/progress.md]

Adversarial code review. Angle: PROGRESS SCHEMA CORRECTNESS & REGRESSIONS.

Inspect the repository directly (run `git diff`, read files). Do NOT rely on any conversation summary. The current uncommitted diff on branch `misc` is the review target, plus these new untracked files.

Focus files:
- src/utils/lessonProgress.ts (new)
- src/utils/progressMigration.ts (new)
- src/app/api/progress/[userId]/[lessonId]/route.ts (rewritten)
- src/app/api/progress/[userId]/[lessonId]/complete/route.ts (new)
- src/app/api/lessons/route.ts (rewritten status computation)
- src/types/lesson.d.ts (schema changes)
- src/utils/lessonUtils.ts (legacy helpers now possibly dead)

Investigate specifically:
1. Transaction atomicity in the POST route: read-then-write inside runTransaction for complete-exercise, visit-page, legacy-finish. Any read-after-write issues? Any path that writes outside the transaction? The `legacy-finish` branch returns {missingExercises} WITHOUT writing when incomplete — is that inside/outside the transaction correctly?
2. furthestPageIndex monotonicity and clamping (getFurthestPageIndex). Does visit-page correctly never regress? Does the merge with `...existing` then overwriting currentPageIndex=furthestPageIndex ever lose data?
3. Completion derivation: getRequiredExercises + getMissingExercises subset logic. Does an empty requiredExercises list (lesson with no exercises) mean it can NEVER auto-complete via complete-exercise (requiredExercises.length > 0 guard)? Is that intended? How does such a lesson complete — only via the /complete route?
4. The discriminated-union `progressRequestSchema` and the manual `action` inference fallback. Can a malformed legacy payload bypass validation? Is `score: z.number().finite()` enough (NaN/Infinity)? Is the `.refine` on visit-page correct?
5. resolveExerciseId legacy positional-ID parsing (`page0-item1`). Off-by-one? What if page items were reordered since v1 — does migration silently remap to the WRONG exercise?
6. Backward compat: old v1 docs with only `currentPageIndex` (no furthestPageIndex, no progressSchemaVersion). Does isStoredLessonComplete / getFurthestPageIndex / calculateStoredProgress handle them? Does the `legacy-finish` hasLegacyCompletion path (`currentPageIndex >= totalPages`) double-count or conflict with status==='completed'?
7. /lessons GET regression: processNormalLessons sequencing (previous lesson must be complete to unlock next) — was this preserved? processPracticeLessons now uses getStatusFromProgress for vocab/diagramming/listening which previously were 'completed'?'completed':'available' with no gating. Did this change student-visible gating/sequencing for practice lessons? Is `in-progress` now shown where 'available' was before?
8. Dead/duplicate code: are calculateProgressFromPageIndex / isLessonComplete / getExerciseCountForPage / getCompletedExercisesForPage / parsePageIndex in lessonUtils still used anywhere, or now dead exports?
9. The /complete route's finalPage check: `lesson.pages.at(-1)` — what if the last page has no id? What if pages is empty?

Return concise, evidence-backed findings with file:line references and suggested fixes. Prioritize by severity. This is review feedback, NOT a context summary. Do NOT edit any files.

---
**Output:**
Write your findings to exactly this path: /Users/harry/Documents/dev/chris/latin-app/.pi-subagents/artifacts/outputs/a2ed8454/review-progress-core.md
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