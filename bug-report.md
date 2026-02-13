# Progression System Bug Report

Bugs found during the re-architecture of exercise progression rules. Bug 1 (stale `showExplanation` state) has been fixed.

---

## Medium Severity

### Bug 2: fill-embolded-text — typing during feedback destroys state

`fill-embolded-text-exercise.tsx` `handleAnswerChange` calls `reset()` whenever `isCorrect !== null`. If the user types a character while the Continue button is showing or during the auto-advance delay:

1. `reset()` sets `isCorrect` back to `null`
2. The feedback and explanation vanish
3. `onContinue={isCorrect && isAwaitingConfirmation ? confirmAdvance : undefined}` becomes `undefined`
4. Continue button disappears but `pendingAdvanceRef` still holds the callback
5. User is permanently stuck — no Continue button, no auto-advance

**Fix:** Only call `reset()` when `isCorrect === false`, not when `true`.

**File:** `src/components/ui/exercises/fill-embolded-text-exercise.tsx` ~line 92

---

### Bug 3: translation-grading — onComplete before cleanup

`handleContinue` calls `onComplete` before `nextItem()` and `resetGrading()`. If the parent unmounts the component in response to `onComplete`, the subsequent `nextItem()` and `resetGrading()` calls hit an unmounted component.

**Fix:** Move `onComplete` to be the last call, or early-return on the last item after calling it.

**File:** `src/components/ui/exercises/translation-grading-exercise.tsx` ~line 84

---

### Bug 4: generated-form-identification — mid-exercise reset

`validatedItems` depends on `wordAnswers` state (in the useMemo dependency array). In standard step-by-step mode, answering a step calls `setWordAnswers`, which recomputes `validatedItems`. If the recomputation changes the array length (due to `filterPathsByPreviousAnswers` narrowing the path set), `totalItems` changes and the hook's reset effect fires — snapping `currentIndex` back to 0 mid-exercise.

**Fix:** The `totalItems` reset effect is too aggressive. Consider only resetting when the exercise itself changes (e.g. track an exercise ID), not on any length change.

**File:** `src/hooks/useExerciseProgression.ts` ~line 43, `src/components/ui/exercises/generated-form-identification-exercise.tsx` ~line 237

---

### Bug 5: score lost if user navigates away during auto-advance timer

On the last item, `onComplete` is inside the `afterAdvance` callback. If the user navigates away (back button, closes tab) during the auto-advance timer delay, the timer is cleaned up correctly but `onComplete` never fires. The score for that exercise is lost.

**Fix:** Call `onComplete` synchronously for the last item and only defer the visual transition (reset, advance) into the timer callback.

**Files:** All exercise components that defer `onComplete` into `autoAdvanceIfEnabled`

---

### Bug 6: isLastItem is true when totalItems is 0

`isLastItem = currentIndex >= totalItems - 1` evaluates to `true` when `totalItems` is 0 (during API loading for generated exercises). `0 >= -1` is `true`. Currently harmless due to early-return guards in `handleSubmit`, but semantically wrong and could break if new code reads it during the loading state.

**Fix:** `const isLastItem = totalItems > 0 && currentIndex >= totalItems - 1`

**File:** `src/hooks/useExerciseProgression.ts` ~line 55

---

## Low Severity

### Bug 7: translation-grading ignores progression rules

Translation-grading doesn't use `autoAdvanceIfEnabled` or `isAwaitingConfirmation` — it has its own manual flow. The `autoAdvanceOnCorrect` and `pauseForExplanation` settings have zero effect on this exercise type. The admin UI still shows these checkboxes, which is misleading.

**File:** `src/components/ui/exercises/translation-grading-exercise.tsx` ~line 49

---

### Bug 8: pauseForExplanation persists when autoAdvanceOnCorrect is disabled

The admin checkbox for `pauseForExplanation` is visually disabled when `autoAdvanceOnCorrect` is off, but its saved value persists. If an admin later re-enables `autoAdvanceOnCorrect`, the old `pauseForExplanation` value silently takes effect without explicit choice.

**File:** `src/components/ui/admin/content-editor/FeedbackConfigEditor.tsx` ~line 277

---

### Bug 9: input appears interactive during auto-advance delay

After a correct answer with auto-advance, `isProcessing` stays `true` for the duration of the timer delay. The input field has no `disabled` prop tied to `isProcessing`, so it appears interactive but submissions are silently blocked by the `if (isProcessing) return` guard.

**Files:** All exercise components with `ExerciseInput`
