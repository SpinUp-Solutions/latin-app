# Generated exercise retry queue — implementation plan

Status: implemented. Admin control, default-on behavior, whole-word morphology
retries, existing advancement settings, and disabling forced resets in queue
mode were agreed during planning. The implementation preserves existing scoring,
opt-out, and assessment-preview behavior as described below.

Branch: `harry/generated-exercise-retry-queue`, created from latest fetched
`origin/edge` at `59e2b0c8` on 2026-09-29.

## Confirmed requirements

- Applies to generated morphology (`generated-form-identification`) and generated
  vocabulary translation (`generated-translation`), with either pools or filters.
- Incorrect answers send the affected entry to the back of a queue. It returns
  until answered correctly; correct entries leave the queue.
- Enabled by default, including exercises authored before this feature.
- Only the teacher/admin controls the opt-out, per exercise. Students do not
  receive a toggle. New and legacy exercises default to on; an explicit admin
  opt-out remains saved.
- In multi-step morphology, a mistake moves the entire word occurrence to the
  back of the queue and restarts its steps when it returns.
- Wrong-answer transitions follow the existing advancement settings: show
  feedback, then advance after the configured delay when auto-advance is enabled,
  or require Continue when it is disabled. Correct-answer behavior stays intact.
- Ignore the existing forced whole-exercise reset setting (`maxLevelFailures`)
  while queue mode is on. Completed entries remain completed after any number
  of mistakes. Preserve the saved setting for use when queue mode is off.
- Test mode retains its current behavior.
- Implementation was subsequently authorized, with no Playwright or browser tests.
  Push the feature branch and open a pull request targeting `edge`.

## Current behavior verified in the repository

Practice currently stays on an incorrect answer until corrected. Generated
translation uses `applySequentialItemResult`; morphology implements its own
practice branches. Both use the index-based `useExerciseProgression` hook.
Test mode records answers and advances separately. `preview` is also a distinct
runtime mode with assessment behavior; do not accidentally enable the queue by
checking only `mode !== 'test'`.

Morphology has single-field, step-by-step, and multiple-primary-answer variants.
Later steps can depend on answers to earlier steps for the same occurrence.
The same vocabulary document can appear multiple times with different selected
forms. The item builder already assigns occurrence-specific word IDs, which must
remain stable through retries.

Practice samples can be retained when moving between lesson pages, through
`usePracticeGeneratedExerciseWords` and the retained practice session. Queue
state and delayed transitions must work with that lifecycle.

## Decision record

| Decision | Behavior | Status |
| --- | --- | --- |
| Who opts out? | Teacher/admin, per exercise; always on by default | Confirmed |
| Step-by-step morphology retry | Move the entire word occurrence to the back; restart all its steps on return | Confirmed |
| Wrong-answer transition | Follow existing auto-advance and delay settings; Continue when manual advancement is configured | Confirmed |
| Existing forced reset after repeated errors | Ignore forced whole-exercise resets while queue mode is enabled; preserve saved settings and configured hints/answer reveals | Confirmed |
| Practice completion score | Preserve completion/mastery semantics; report 100 only once all entries pass, with attempt counts kept separately if displayed | Implemented |
| Opt-out behavior | Preserve the current practice flow, including retrying immediately on the same question | Preserve existing behavior |
| Runtime preview | Leave assessment preview unchanged; use practice runtime when demonstrating the queue | Implemented |

## Student flow

Example: start with `[A, B, C]`. A is wrong, giving `[B, C, A]` after the configured
delay or Continue.
B is correct, giving `[C, A]`. C is wrong, giving `[A, C]`. The exercise finishes
only after both A and C have subsequently passed.

- Sample the exercise once. Requeue the same prompt and selected form; retries
  never fetch replacement words or reroll forms.
- Translation: one generated prompt is one queue entry, in either direction.
- Single-field morphology: one occurrence is one entry; require the existing
  fully-correct practice validation, not partial credit.
- Step-by-step morphology: one occurrence contains its ordered steps. A correct
  step advances within that entry; only the final successful step removes it.
- Under the confirmed restart rule, a failure ends that occurrence's current
  attempt, skips its remaining steps, and queues it once at the back. Clear only
  that occurrence's step answers, path constraints, and multi-answer slots for
  the new attempt. Completed other occurrences stay completed.
- If only one entry remains and it is wrong, advancement returns to that same
  entry with blank input and fresh attempt state. It cannot complete on failure.
- Track failures per occurrence and step across queue visits, so feedback
  escalation remains useful without carrying mistakes into another entry.
- Progress uses completed entries against the original entry total, e.g.
  “7 of 10 complete · 3 remaining”. For multi-step morphology, show the active
  step separately. Retries do not inflate the denominator.
- Use the existing advancement preference for both correct and incorrect
  answers in queue mode. Although the current field is named
  `autoAdvanceOnCorrect`, reuse its value for wrong-answer queue transitions;
  do not change its meaning for other exercises or modes. Reuse
  `itemProgressionDelay` and its existing 2-second fallback. Preserve existing
  explanation-pause behavior where applicable; hints and revealed answers are
  not automatically treated as explanations.
- Keep the answered prompt and feedback visible until the transition commits.
  Lock submission during this interval; a single timer or Continue action moves
  the queue exactly once. Disabling forced resets must not disable feedback
  escalation or clear an admin's stored `maxLevelFailures` setting.
- Prevent repeated submission/Continue clicks from enqueueing an entry twice.
- Emit accepted completion once when the last entry passes; preserve the existing
  distinction between accepted completion and delayed visual/page advancement.

## Configuration and backward compatibility

Implement admin control with an optional boolean `data.retryIncorrectAnswers`
on these two generated exercise types only.

- Missing or `true`: queue mode in practice.
- Explicit `false`: existing practice behavior.
- Non-boolean present values: reject through the applicable configuration schemas.
- Runtime gate: `mode === 'practice' && (retryIncorrectAnswers ?? true)`.
- New-exercise factories write `true`; editors display missing values as enabled.
- Suggested editor label: “Repeat incorrect words until correct”, with help text
  explaining that this applies to practice and does not affect tests.
- In queue-mode editor help, explain that the existing advancement setting also
  controls movement after mistakes and that the forced-reset threshold is ignored.
  Retain stored values when queue mode is toggled.
- Preserve explicit `false` through saving, loading, duplication, and legacy
  normalization. No bulk edits or production data migration are required.
- Do not alter test answer payloads, item ordering, grading, frozen test versions,
  delivery projection, or review semantics to implement the queue.

## Implementation outline

1. Add the optional field, validation, factory default, and editor control.
   Inspect the existing persistence/normalization path so it preserves the field.
2. Line up prepared items with a small queue hook that stores only their original
   indices. On failure, move every step of that word occurrence to the back and
   return the position where the next pending word now starts. The exercise's
   existing cursor separates the completed prefix from the pending queue.
   Keep validation, feedback attempts, grading, and completion in the exercise.
   Use `useExerciseProgression` with the actual item count for both flows; only
   redirect its cursor when a failed word is requeued. No second cursor, queue
   result state, or special queue score is needed.
   Key each exercise session by its exercise, mode, and sample so replacement
   clears answers and pending timers, including same-length replacements.
3. Integrate translation first, retaining original item indices for its answer
   array even as queue order changes.
4. Integrate morphology using occurrence-specific IDs and grouped ordered steps.
   Preserve dynamic path narrowing within an attempt and clear it on restart.
   Cover both generated-word and supplied-resolved-item practice paths.
5. Add queue progress and wrong-answer timed/manual advancement using existing UI
   primitives. Suppress forced-reset blocking and Start over prompts in queue
   mode. Preserve generic feedback and sequential behavior for other types.
6. Verify lifecycle: initial async load, exercise replacement (even at the same
   length), reset, retained page navigation, pending timers, unmount, and final
   completion. Full browser-reload persistence is outside this proposal.

The queue changes only the order of prepared items. Word loading and construction
remain independent of ordering, and the shared progression hook is unchanged.

### Main files identified

- `src/types/exercises/generated-translation.d.ts`
- `src/types/exercises/generated-form-identification.d.ts`
- `src/utils/contentFactory.ts`
- `src/lib/tests/active-exercise-validation.ts`
- `src/lib/tests/generated-preview-schema.ts`
- `src/components/ui/admin/content-editor/GeneratedTranslationEditor.tsx`
- `src/components/ui/admin/content-editor/GeneratedFormIdentificationEditor.tsx`
- `src/components/ui/exercises/generated-translation-exercise.tsx`
- `src/components/ui/exercises/generated-form-identification-exercise.tsx`
- New generated-practice queue helper/hook and its tests

Related integration points to inspect or reuse: `generated-exercises.ts`,
`useExerciseFeedback.ts`, `useExerciseProgression.ts`, `feedback-display.tsx`,
`exercise-progress.tsx`, `usePracticeGeneratedExerciseWords.ts`, and
`legacyExerciseCompat.ts`. Shared code changes are not automatically required.

## Verification plan

Use actual rendered exercise interactions for progression regressions, alongside
pure queue transition tests. Cover:

- Legacy missing setting, explicit true, and explicit false; editor save/reload
  and duplication preserve opt-out.
- `[A, B, C]` rotation, repeated failures, one remaining entry, no duplicate
  entries, no completion until every entry passes, callbacks fire exactly once.
- Both translation directions; both pool and filter sources; unchanged sample
  and selected forms on retry.
- All morphology variants, failure after earlier correct steps, alternative
  valid form paths, and repeated occurrences of the same vocabulary document.
- Manual and automatic advancement after both correct and incorrect answers,
  configured delays and their fallback, repeated clicks, and feedback escalation.
- Exceed a configured `maxLevelFailures` threshold in queue mode: no reset or
  blocked input after advancement, and completed entries remain completed.
  With queue mode off, the same stored threshold retains its existing behavior.
- Stable progress denominator, original-index answer storage, async loading,
  same-length exercise replacement, retained navigation, and timer cleanup.
- Test and assessment-preview regression cases with missing, true, and false
  settings: sequential answer recording, restoration, grading, and review stay
  unchanged. Include sectioned test mode.

Relevant existing suites include `generatedFormIdentificationRepeatedWords`,
`generatedFormIdentificationFailureModes`, `generatedFormPartialCredit`,
`runtimeModeScoring`, `testDeliveryRendering`, and `testGradingFoundation`.
`translationPracticeCompletion` tests the separate AI-graded translation type,
not generated vocabulary translation; add dedicated generated queue tests.

Run targeted Jest tests, `npx tsc --noEmit`, `npm run lint`, and
`git diff --check`. Run the full suite if shared runtime/feedback code changes.
Playwright and browser tests are explicitly excluded by the implementation
request. Cover legacy exercises, opt-out, pool/filter sources, and test mode with
Jest component tests instead. No Firestore rules change is required.

Implementation adds `tests/generatedExerciseRetryQueue.test.tsx` and
`tests/generatedExerciseRetryConfig.test.ts`, extends editor-toggle coverage,
and updates existing morphology progress/reset expectations.
