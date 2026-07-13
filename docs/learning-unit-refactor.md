# Learning Unit and Test Schema Refactor

Status: Working draft  
Last updated: 2026-07-14

## Purpose

Integrate tests into the existing lesson flow while preserving the lesson creator experience, supporting alternative test versions, and adding a separate Mock Tests dashboard category.

This document is the shared planning space for the refactor. Settled choices are recorded in the decision log. Questions that still need a product decision remain under **Open decisions**.

## Current state

- Lesson documents are stored in the Firestore `lessons` collection and use the `Lesson` schema.
- Lesson behavior is specialized with `type: vocab | normal | sentence-diagramming | listening`.
- Lessons contain ordered pages with both instructional content and exercises.
- The test POC stores a separate, flat `TestDefinition` in the `tests` collection.
- A POC test contains an ordered list of scored exercises and unscored content rather than normal lesson pages.
- The POC test builder creates a synthetic lesson page in Redux to reuse the existing content editors. The synthetic lesson is not persisted as a lesson.
- Test attempts and preview scores are held in browser memory and are not persisted.

The POC proves the authoring and scoring behavior. The refactor should now make tests part of the wider learning flow without creating parallel content, rendering, or editor systems.

Existing POC test documents will not be migrated. Real tests are authored fresh in the new system, and the POC `tests` collection is deleted during cleanup. Only existing lesson documents need compatibility handling.

## Architectural thought process

### Lessons and tests need a shared flow identity

Normal lessons and normal tests both appear in the student lesson flow. They should therefore share a top-level `LearningUnit` union and the existing `isLive` and `liveOrder` behavior. Vocabulary, sentence-diagramming, and listening lessons retain their existing separate dashboard categories and behavior.

Use `kind` to distinguish instructional units from assessed units. Preserve the current lesson `type` field because it describes specialized lesson/player behavior, which is a different concern.

### A normal test is not the same thing as its version

A normal test is the student-facing test at a particular point in the lesson flow, for example “Chapter 4 Test.” Version A and Version B are alternative sets of pages and exercises that may be selected when the student starts or retakes that test.

The normal test is therefore a container that references separately stored test versions. It does not directly contain pages.

### Version delivery is exclusive

A version attached to a normal test has exactly one current delivery role:

- `mockTestId: null` means the version participates in the parent test's normal random rotation;
- a non-null `mockTestId` means the version is excluded from normal rotation and delivered only through that mock-test card.

For example, if Test 3 contains Versions A, B, C, and D and Version D is assigned as mock, normal Test 3 attempts can select only A, B, or C. Version D remains visible under Test 3 in the admin UI with a **Mock** label and appears as its own card in the student Mock Tests category.

`TestVersion` remains a first-class document so large page content can be edited independently, but versions are not generally shared between simultaneous delivery contexts. If a teacher wants equivalent content in both normal rotation and Mock Tests, they explicitly duplicate the version and assign the duplicate as mock.

A manually created standalone mock has no parent normal test. It can later be moved into a normal test by archiving its mock container and attaching the same version for rotation, or duplicated when the teacher wants to keep both destinations.

### Mock tests are separate dashboard entities

Mock tests can only be encountered in the Mock Tests dashboard category. A mock test has its own `mockTestId`, visibility, ordering, lifecycle, passing rule, and exactly one version.

A parent-linked mock points back to the normal test that still owns the version administratively. A standalone mock explicitly records that it has no parent. Assigning Version A and Version B of a normal test as mocks creates two independently ordered student-facing mock-test cards. The student deliberately chooses a card; mock retakes do not rotate between those versions.

This makes a generic `placementId` unnecessary for the current requirements:

- normal tests use their `testId` and participate in `liveOrder`;
- mock tests use their `mockTestId` and participate in `mockOrder`;
- attempts record whether they originated from a normal test or a mock test.

### Passing requirements belong to containers

A passing requirement describes how a student-facing test is used, not the content of a version. Normal tests and mock tests therefore store their own `passingPercentage`. A value of `null` means score-only: the student receives a score but cannot fail.

The normal-test threshold applies only to its rotation-eligible versions. A mock-only version uses its `MockTest` threshold. Percentage thresholds allow alternative normal-test versions to have different total points while remaining comparable.

### Versions and edit history are intentionally simple

The model includes alternative test versions such as A, B, and C. It does not include immutable revision history. Editing a test version updates that version directly.

Submitted attempts preserve frozen score statistics and exercise-level results, which power the student results breakdown. They do not retain exact questions or student answers, and their statistics are never recalculated from the current editable test version. This intentionally means submitted attempts cannot later be reviewed question-by-question or regraded after a version changes.

While an attempt is in progress, it may temporarily retain answers and the resolved delivery state needed to survive a refresh or resume the same generated questions. That temporary state is removed when the attempt is submitted.

## Proposed schema

### Shared learning-unit metadata

```ts
interface LearningUnitBase {
  id: string;
  kind: 'lesson' | 'test';

  title: string;
  description: string;

  isLive: boolean;
  liveOrder: number | null;
  publishedAt: string | null;
  publishedBy: string | null;

  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}
```

### Lesson units

Existing lesson content remains page-based and largely unchanged.

```ts
interface LessonUnit extends LearningUnitBase {
  kind: 'lesson';
  type: 'vocab' | 'normal' | 'sentence-diagramming' | 'listening';

  pages: Page[];
  vocabulary_pool?: string | null;
}
```

### Test-version references

Normal tests use an ordered non-empty list of version references. The nullable `mockTestId` is the authoritative delivery switch: `null` means normal rotation, while a value means mock-only and directly identifies the version's mock-test card.

```ts
interface TestVersionReference {
  versionId: string;
  label: string;
  mockTestId: string | null;
}

type NonEmptyArray<T> = [T, ...T[]];
```

### Normal test units

A normal test participates in the lesson flow but delegates its page content and scoring to its referenced versions.

```ts
interface TestUnit extends LearningUnitBase {
  kind: 'test';
  type: 'normal';

  versions: NonEmptyArray<TestVersionReference>;
  // null means score-only: submitting completes the unit without pass/fail.
  passingPercentage: number | null;
}

type LearningUnit = LessonUnit | TestUnit;
```

Example for Test 3 after Version D is assigned as mock:

```ts
versions: [
  { versionId: 'a', label: 'Version A', mockTestId: null },
  { versionId: 'b', label: 'Version B', mockTestId: null },
  { versionId: 'c', label: 'Version C', mockTestId: null },
  { versionId: 'd', label: 'Version D', mockTestId: 'test-3-version-d-mock' },
];
```

Only A, B, and C are eligible for normal Test 3 attempts. The non-null link keeps D visible inside the Test 3 admin overview while pointing directly to D's mock card.

### Test versions

```ts
interface TestVersion {
  id: string;
  name: string;

  pages: Page[];

  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}
```

A test version is separately stored scored content, not an independently published student destination. Persisted versions must be structurally valid. Versions are assigned to one active delivery context rather than shared simultaneously across tests and mocks. Domain mutation routes reject attaching an existing version to a second context; moving is an explicit atomic operation and copying creates a new version ID.

Incomplete editor work remains in the existing draft mechanism. If cross-device server drafts are required later, a narrower `draft | ready` lifecycle can be introduced without adding independent publication semantics.

### Mock tests

Mock tests are separate from `LearningUnit` because they do not participate in the normal lesson flow.

```ts
interface MockTest {
  id: string;
  versionId: string;

  parent: { kind: 'test'; testId: string } | { kind: 'standalone' };

  title: string;
  description: string;

  // null means score-only; a mock result never gates the normal learning path.
  passingPercentage: number | null;

  status: 'active' | 'archived';
  isLive: boolean;
  mockOrder: number | null;

  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}
```

The matching mock card for Test 3 Version D is:

```ts
{
  id: 'test-3-version-d-mock',
  versionId: 'd',
  parent: { kind: 'test', testId: 'test-3' },
  title: 'Test 3 — Mock Version D',
  description: '',
  passingPercentage: null,
  status: 'active',
  isLive: true,
  mockOrder: 4,
}
```

## Schema relationships

```text
LessonUnit ──────────────────────────────> Page[]

TestUnit ───────> TestVersionReference ──> TestVersion ──> Page[]
   ^                      │
   │ parent               │ mockTestId when mock-only
   │                      v
   └────────────────── MockTest

Standalone MockTest ────────────────────> TestVersion
```

For a parent-linked active mock, both directions must agree: the parent reference points to the `MockTest.id`, and the mock points back to the same `testId` and `versionId`. A standalone mock has no `TestUnit` parent. Archived mocks retain their IDs and history but are not active delivery relationships.

## Scoring invariants

- A test version uses the same `Page` and `RenderableContentItem` structure as a lesson.
- Pages may freely mix exercise and non-exercise content.
- Whether an item is an exercise is derived from the existing content-type registry/type guard. Teachers do not manually mark content as scored.
- Point allocation is stored directly on each exercise as `maxPoints` rather than in a separate point map.
- `maxPoints` is optional on the shared `BaseExercise` type so existing lessons and lesson documents remain valid without it.
- Lesson creation, rendering, and progress do not require or use `maxPoints`.
- Adding an exercise in the test-version builder automatically assigns `maxPoints: 1`.
- Every exercise in a persisted test version must have a positive whole-number `maxPoints` value.
- Non-exercise content cannot define `maxPoints` and never contributes to the total.
- The server derives total points by summing exercise `maxPoints` values across the version's pages and never trusts a client-supplied total.
- Alternative versions of the same normal test may have different total points. Stored and displayed percentages provide the normalized comparison used for pass/fail and best-score history.
- `passingPercentage` is either `null` or a whole number from 1 through 100. It is stored on the normal-test or mock-test container, never on `TestVersion`.
- Generated exercises award credit per independently gradable answer component, then normalize that component score to the exercise's admin-assigned `maxPoints`.
- For `generated-form-identification` in `single-field` mode, every requested grammatical field is one grading unit even though the student submits the fields together. A response with two correct fields out of three earns `2 / 3` of the exercise's `maxPoints`; for example, expected `1,s,m` and submitted `1,s,f` earns two of three units. If the admin assigned 1 point, the exercise awards `0.666...`; if they assigned 6 points, it awards 4.
- Missing or incorrect components earn zero units, accepted answer variants earn the same credit as their canonical value, and incorrect components never cancel credit already earned for correct components.
- Other single-step partial acceptance remains exercise-specific grading behavior and does not change the container schema.
- Scoring calculations retain full precision and do not round each step independently.
- The UI displays awarded points with at most two decimal places and the final percentage as a whole number initially; display rounding never changes the stored score.

The shared exercise shape therefore adds only an optional field:

```ts
interface BaseExercise extends ContentItem {
  // Existing exercise fields remain unchanged.
  maxPoints?: number;
}
```

Validation is contextual: lesson validation ignores an absent `maxPoints`, while test-version validation requires it on every exercise. Existing lesson documents require no point-related migration.

A structurally valid test version must contain at least one scored exercise. This guarantees `maxScore` is always positive and percentage calculation can never divide by zero. The POC builder already enforces this rule.

## Server-side grading architecture

Grading currently lives entirely in the client: every exercise component grades itself and reports a completion score, and the POC records those client-computed results. That model is acceptable for practice lessons but not for persisted, gate-controlling test results. Test grading is therefore server-authoritative, and this section defines what that requires, because none of it exists yet.

### Test-eligible exercise types

Test versions may only contain exercise types on an explicit server-side allowlist, extending the POC's `SUPPORTED_TEST_EXERCISE_TYPES`: `matching`, `fill`, `multiple-choice`, `odd-one-out`, `text-selection`, `fill-embolded-text`, `sentence-diagramming`, `table-fill`, `click-on-multiple-words`, `generated-translation`, and `generated-form-identification`.

`translation-grading` is excluded: it is graded by an LLM through the `gradeTranslationFn` Firebase Function, which is non-deterministic, slow, and per-call costly, and the component has no test mode. It can be revisited later; excluding it now keeps submission grading synchronous and deterministic. `listening-passage` is not an exercise type and participates only as unscored content. Version validation rejects exercise types that are not on the allowlist, and the test builder's palette only offers allowlisted types.

`sentence-diagramming` is the most complex grading port and keeps its existing `diagramming_attempts` audit writes in test mode; the audit record is diagnostic and independent of the attempt's frozen results.

### Canonical answer formats and grading modules

- Each allowlisted exercise type defines a canonical serializable answer format, keyed by persisted item ID (and item index within multi-item exercises). The attempt's `answers` map stores exactly these shapes.
- Each allowlisted type gets a pure server grading function in a shared module: `(deliveryState, answers) -> { awardedPoints, maxPoints }` per exercise. These functions are extracted from, or verified against, the existing component grading logic so practice and test grading cannot drift.
- In test mode, components collect and report raw answers instead of grading locally. Practice mode keeps the existing client-side grading behavior unchanged.
- Multi-item exercises award the appropriate fraction of the exercise's `maxPoints` per correct item, calculated at full precision.
- The `generated-form-identification` grader expands each resolved item into its requested grammatical fields. In `single-field` mode it scores those submitted fields independently and calculates `awardedPoints = maxPoints * correctFieldCount / totalRequestedFieldCount` across the exercise. The combined input format does not make the answer all-or-nothing.

### Resolving generated exercises server-side

Generated exercises (`generated-translation`, `generated-form-identification`) currently fetch their word data in the browser at render time with client-side randomness. For tests this moves to attempt start:

- The attempt-start route resolves every generated exercise's items server-side, reusing the existing word-query server logic and the shared mapping utilities, and freezes the resolved items plus grading inputs into the attempt's `deliveryState`.
- Exercise components accept injected pre-resolved items in test mode instead of self-fetching, so a refresh or resume re-renders the identical questions. Practice mode keeps self-fetching.

### Answer-key sanitization

The content payload returned to a student for an in-progress attempt is a sanitized projection of the frozen delivery state: prompts, options, and layout data only. Accepted answers, correct options, and other grading inputs stay server-side in `deliveryState`. Each exercise type's grading module declares which fields are grading inputs so sanitization and grading cannot disagree. Lessons continue to ship full content to the client; sanitization applies only to test attempts.

## Stable content identity

Persisted content-item IDs, not page or item positions, are the stable identity for test exercises.

- Every item in a persisted test version must have a non-empty `ContentItem.id`.
- Item IDs must be unique across the entire test version, including across different pages.
- IDs are assigned during authoring and are never generated by the student renderer.
- Moving or editing an existing item preserves its ID.
- Copying an item or page creates new IDs for every copied item while preserving the originals.
- Answers, in-progress delivery state, and exercise results use the persisted exercise ID.
- The shared renderer reports both the persisted item ID and positional context when an exercise completes.

Existing lesson progress currently uses positional identifiers. To preserve compatibility, the normal-lesson adapter may continue translating completion events into the legacy positional format while test mode uses the persisted item ID directly. Replacing legacy lesson-progress identifiers is not required by this refactor.

## Test-version builder behavior

The test-version builder should feel like the normal lesson creator and use the same page and content editors.

- Use the same overall page structure, content palette, drag-and-drop behavior, content modal, and split-screen interactive preview as the normal lesson creator.
- Show a breadcrumb such as **Tests / Chapter 4 Test / Version B** so the teacher always knows which container and version are being edited.
- Teachers can add, edit, remove, copy, and reorder the same content items used in lessons.
- Adding ordinary content creates no scoring metadata.
- Adding an exercise sets `maxPoints: 1` automatically.
- Exercise cards display a points control; ordinary content cards do not.
- Removing an exercise removes its point allocation naturally because the value lives on the removed item.
- Copying an exercise creates a new item ID and carries the source `maxPoints` value with the copied item.
- Moving an item within or between pages naturally preserves its `maxPoints` value.
- If changing an item's type crosses the exercise/non-exercise boundary, the builder adds the default `maxPoints` value or removes the field automatically.
- Loading an existing version reports missing, duplicate, or unstable item IDs and any exercise with a missing or invalid `maxPoints` value rather than silently repairing persisted data.
- Preview uses the normal page renderer in test-preview mode and writes no lesson progress or test attempts.
- The editor header shows the derived total points and provides save and preview actions.
- The surrounding container settings expose **Score only** or **Require a passing score**, with a whole-number percentage input when passing is enabled. These controls update the current `TestUnit` or `MockTest`, not the version content.
- For the version currently being edited, show the equivalent threshold for context, for example **70% = 14 of 20 points**.

The existing exercise-type registry remains the source of truth. Scoring must not be inferred from whether `maxPoints` exists because that would hide invalid unscored exercises. The normal lesson builder does not display point controls, and lesson rendering ignores `maxPoints` if an exercise copied from a test happens to retain it.

## Runtime feedback behavior

Feedback timing is delivery behavior rather than test-version content. The initial model therefore does not store `feedbackMode` on `TestVersion`.

- `practice` mode preserves the existing exercise feedback behavior.
- `test` mode suppresses answer-revealing feedback until the test is submitted.
- `preview` mode emulates test behavior without persisting progress or attempts.
- Exercise-level `feedbackConfig` continues to define the available messages, hints, explanations, and progression behavior, but the runtime mode decides when those elements may be shown.

If normal tests and mock tests later need different feedback policies, configuration belongs on their respective containers rather than on the version.

## Teacher workflows

### Create a normal test

1. Build the first `TestVersion` using the lesson-like page builder.
2. Choose **Score only** or set a container-level passing percentage.
3. Save the valid version and its referencing non-live `TestUnit` together with `mockTestId: null`.
4. Add more valid versions as needed.
5. Add the test at a chosen insertion point in the shared learning-path organizer.
6. When live, students see one test card and the server selects only among references whose `mockTestId` is `null`.

Creating a test in Test Management does not automatically place it in the learning path. Placement is an explicit later action so authoring and curriculum ordering cannot accidentally publish one another.

### Create a standalone mock test

1. Create one valid `TestVersion` from the Mock Tests area using the same lesson-like editor.
2. Choose **Score only** or set an informational passing percentage.
3. Save an active `MockTest` containing the version ID and `parent: { kind: 'standalone' }`.
4. The mock appears as one card only in the Mock Tests dashboard category when made live.
5. No `TestUnit` or normal-flow entry is required.

### Assign normal-test versions as mocks

1. On a normal test's overview or version editor, enable **Available as a mock test** for a specific version.
2. Show a confirmation explaining that this version will be removed from all future normal-test rotation and will become available only through its mock card.
3. Prefill an editable student-facing title such as **Chapter 4 Mock Test — Version A** and inherit the parent passing rule while allowing the teacher to change it or select **Score only**.
4. In one transaction, create or reactivate the version's `MockTest`, set `parent: { kind: 'test', testId }`, and write its ID into the parent `TestVersionReference.mockTestId`.
5. Reject the operation if a live parent test would be left with no references whose `mockTestId` is `null`.
6. Assigning Version A and Version B creates two active `MockTest` documents and therefore two student dashboard cards; neither version remains eligible for the parent test's normal rotation.

Assignment is idempotent for a given parent test/version pair. If an archived mock already exists, reuse its `mockTestId` and attempt history rather than creating a second card. A teacher who wants equivalent content in both contexts duplicates the version first and marks only the duplicate as mock.

Once assigned, the version row shows a **Mock** badge and a **Manage mock assignment** link. The mock overview links back to the parent test and version.

### Return a mock version to normal rotation

Turning off **Available as a mock test** requires confirmation. In one transaction:

1. Set the parent version reference's `mockTestId` to `null`.
2. Set the `MockTest` to `status: 'archived'` and `isLive: false`.
3. Retain the mock document and all attempts so reassigning the version can reactivate the same `mockTestId` and history.

An active but non-live mock is different from an archived mock. Active plus `isLive: false` means the version remains mock-only but is temporarily hidden from students. Archived means the assignment has ended and the version has returned to normal rotation.

### Use a mock version in the normal flow

For a parent-linked mock, turning off the mock assignment returns that same version to its existing parent test's normal rotation.

For a standalone mock, **Use in normal test** offers two explicit operations:

- **Move to normal test** archives the standalone `MockTest` and attaches that same version to the selected `TestUnit` with `mockTestId: null`.
- **Duplicate into normal test** keeps the standalone mock unchanged and creates a new version with new version and content-item IDs for the selected normal test.

Versions are never silently shared between simultaneous delivery contexts.

## Admin UI/UX direction

Admin screens should make the delivery model legible rather than assume it is understood: describe states by their consequences, group by delivery role instead of badging flat lists, and make every guardrail rejection point to a next action.

### Test Management section

- Keep Test Management as a distinct top-level admin section from Lesson Management, backed by the shared learning-unit APIs.
- Provide **Create Test** and **Manage Tests** entry points. Manual standalone mock creation remains available from the same section.
- The management screen supports search and filters for **All**, **Normal tests**, **Mock tests**, **Live**, **Draft**, and **Archived mocks**.
- Every container card shows title, description, a visible **Normal Test** or **Mock Test** badge, live/draft state, passing rule, last-edited time, and relevant point/version counts.
- A normal-test card shows its number of versions and whether it is currently placed in the learning path.
- A mock-test card represents exactly one version and shows that version's total points.
- Use icons, labels, border treatments, and color together; do not rely on color alone to distinguish tests, mocks, and lessons.

### Test overview and versions

- Clicking a normal test opens an overview showing its container settings and all of its versions.
- Versions are grouped by delivery role rather than shown as one badged list: **In rotation**, introduced with a one-line explanation such as “students receive one of these at random, least-used first”, and **Mock cards**. The grouping itself teaches the delivery model, including the otherwise invisible selection behavior.
- Each version row shows its contextual label, exercise count, total points, and last-edited time.
- Each version provides **Preview**, **Edit**, **Duplicate**, a confirmed mock assignment control, and guarded remove/delete actions.
- A version with a non-null `mockTestId` remains listed beneath its parent test and states its consequence directly, for example **Excluded from rotation · Live to students as “Chapter 4 Mock Test — Version D”**, linking to that mock card.
- Mock lifecycle is always described in plain language, never as raw stored values: an active hidden mock reads **Hidden from students (still mock-only)** and an archived mock reads **Assignment ended — back in rotation**.
- When a passing percentage is set, container settings resolve the threshold against every version, for example **Version A: 14 of 20 · Version B: 18 of 25**, so percentage normalization is tangible rather than trusted.
- Guardrail rejections offer the exits: refusing to make the last rotation version mock-only suggests **Add another version first** or **Unpublish this test**.
- Clicking a parent-linked mock-test card opens its overview with a breadcrumb back to the parent test and version. The overview clearly labels it **Mock Test** and shows its own student-facing title, passing rule, visibility, lifecycle, and ordering settings.
- A manually created orphan mock follows the same one-card/one-version structure and is labelled as a mock; it does not need a parent normal test.

### Learning-path organizer

- Extend the existing live-lesson/order experience into a shared **Learning Path** organizer rather than creating an unrelated ordering system.
- Show normal lessons and normal tests together in `liveOrder`.
- Render an insertion button between every pair of units, plus one before the first unit and after the last unit.
- Clicking an insertion button opens a test-selection dialog listing structurally valid normal tests that are not already in the learning path.
- The dialog selects a `TestUnit`, never an individual version, because version selection happens when the student starts an attempt.
- Each dialog result shows the test title, number of versions, passing rule, and total-point range. Ineligible tests remain disabled with an actionable reason.
- Selecting a test inserts it at that exact position, marks it live through the normal publication workflow, and transactionally shifts subsequent `liveOrder` values.
- A test can appear only once in the learning path under the current no-`placementId` model.
- Test rows use a distinct persistent treatment such as an indigo/purple background and border, a test icon, and a **TEST** badge. Lesson rows retain their lesson treatment.
- Test rows carry a passing-rule chip, **Pass ≥ 70%** or **Score only**, because the rule changes the flow's semantics.
- A required-pass test is the only unit that can block progression. Render a subtle gate marker after it so the teacher sees exactly where students can get stuck; the organizer is where that consequence is designed.
- Existing drag-and-drop reordering continues to work across the mixed lesson/test sequence.

## Student UI/UX direction

The student experience is designed around two ideas: stakes are always legible before they matter, and taking a test is an emotional arc whose start, silence, and results each need deliberate design.

### Normal learning path

- The dashboard learning path renders an ordered `LearningUnit[]` containing both normal lessons and normal tests.
- Test cards use a visibly different color treatment from lesson cards and always include a test icon and **TEST** label. The treatment reads as serious, not alarming; alarm and warning colors are reserved for results.
- A test card shows its passing requirement or **Score only**, plus the appropriate **Start Test**, **Continue Test**, or **Retake Test** action.
- Score-only and required-pass tests use distinct visual grammar so a student can never confuse the stakes before starting.
- After submission, show the student's best percentage prominently and the latest raw score and percentage secondarily.
- A required-pass test that has not been passed does not unlock the next learning unit. The card communicates the unsuccessful result and offers a retake.
- A locked unit names its gate, for example **Pass the Chapter 4 Test to unlock**, rather than showing an unexplained padlock.
- A score-only test is completed on submission and unlocks the next unit.
- Once a student passes a required-pass normal test, that learning-unit completion is permanent. A later optional retake with a lower score does not relock subsequent units.
- Completion summaries use learning-unit language rather than counting a mixed sequence as lessons only.
- Students never see version labels in the normal flow. Which version an attempt received is deliberately invisible so versions cannot be compared as easy or hard.

### Taking a test

- Starting is a commitment, so a brief pre-start moment states the passing rule or **Score only**, the total points, that answer feedback is withheld until submission, and that progress is saved across a refresh. That last reassurance is earned by attempt persistence and should be said, not implied.
- Tests are untimed. A countdown timer is an explicit non-goal of this refactor for both normal and mock tests.
- Test mode's silence is designed, not just imposed: the player acknowledges each answer without judging it, for example **Answer recorded**, and shows progress such as **12 of 20 answered**.
- Submission is a deliberate act. A review step lists unanswered questions before the student confirms.
- The results screen is the emotional peak and the consolation for intentionally unreviewable questions: the retained per-exercise results are surfaced as a strengths-and-weaknesses breakdown.
- A failing result states the distance to pass in percentage terms, for example **You need 70% — you reached 62%**, with the retake path front and center.
- A passing result celebrates with restraint.

### Mock Tests category

The section's identity is a practice arena: low-stakes, repeatable rehearsal under real test conditions. Everything about it should normalize retaking.

- Add a dedicated Mock Tests section immediately below the normal learning path and before the existing practice categories. Hide the section entirely when no mock is live; an empty shell advertises absence.
- Only active, live `MockTest` documents appear, ordered by `mockOrder`.
- Every mock test is a separate card backed by exactly one version. Version A and Version B assigned from the same normal test therefore appear as two cards.
- Give each card a clear **MOCK TEST** label and a student-facing title that distinguishes it from related cards.
- Without opening the mock, the student can see **Not attempted**, **In progress**, or submitted score history.
- For submitted mocks, display best percentage prominently, latest awarded/max points and percentage secondarily, and the number of attempts. Attempt counts read as normal and positive rather than clinical; retaking is the point.
- Because every submitted attempt's percentage is retained, each card shows a small score trend across attempts. Watching 55% become 81% is the section's most motivating element and costs nothing extra to store.
- If the mock has a passing percentage, show **Passed** or **Not passed** as informational status. Mock results never unlock or block the normal learning path.
- Provide **Start**, **Continue**, or **Retake** directly from the card.
- Retaking a mock reuses that card's single referenced version. Generated exercises may still resolve fresh delivery data for the new attempt.
- When a student fails a required-pass normal test and a related live mock exists, the learning path nudges them toward it, for example **Practice with the Chapter 4 Mock Test before retaking**. Because mock versions are excluded from rotation, practice never consumes a rotation version; the exclusivity rule doubles as a remediation strategy.
- The editable mock title is where a teacher chooses how much version identity to expose to students.

## UI implementation mapping

- Evolve the current `/admin/tests/manage` page and `TestManager` into the container inventory described above rather than maintaining the POC's one-card-per-definition model.
- Add a normal-test overview route such as `/admin/tests/[testId]` and a version editor route such as `/admin/tests/[testId]/versions/[versionId]/edit`. Keep compatibility redirects from the POC test routes during migration.
- Add a mock overview route such as `/admin/mock-tests/[mockTestId]`; it reuses the version editor but loads and saves the mock container's own title, passing rule, and live state.
- Refactor `TestBuilder` toward a shared `TestVersionEditor` composed from the existing lesson-builder page/content components. Do not fork a second exercise-editor implementation.
- Extract a reusable `PassingRequirementControl` for the **Score only** versus percentage choice and use it in normal-test settings, mock settings, and the mock-assignment confirmation.
- Add a `MockAssignmentDialog` that explains removal from normal rotation and owns confirmation, editable title, inherited/editable passing rule, last-rotation-version validation, and idempotent submission.
- Generalize `SortableLessonItem` into a discriminated learning-unit row so the current `/admin/lessons/live` route can become the Learning Path organizer without rewriting its drag-and-drop behavior.
- Add a reusable insertion control and test-picker dialog around the mixed ordered list. The server mutation accepts the selected `testId` and target index and updates publication/order atomically.
- Generalize the dashboard's learning-path card boundary so it renders a lesson or test variant from the `kind` discriminator while preserving shared locked/available/in-progress/completed behavior.
- Add a dedicated `MockTestsSection` below the learning path; do not merge mock cards into the existing practice lesson data.
- Return admin container summaries with version count, rotation/mock counts, point range, passing rule, placement state, and direct mock links so management screens do not fetch every page body.
- Return student test summaries with in-progress state, best submitted attempt, latest submitted attempt, attempt count, the recent score trend, sticky completion state, and any related live mock used by the failed-test nudge. Calculate those summaries server-side rather than downloading full attempt histories to the dashboard.
- Include loading, empty, unavailable, validation-error, and destructive-confirmation states in the initial implementation; these are required behavior, not later visual polish.

## Publication eligibility

Test versions do not have an independent published status. A persisted `TestUnit` must reference at least one existing, structurally valid `TestVersion`. A live `TestUnit` must retain at least one rotation-eligible reference with `mockTestId: null`.

- Publishing a normal test validates every reference and requires at least one structurally valid rotation version.
- An active parent-linked mock must point to a version reference in its parent whose `mockTestId` points back to that same mock document.
- An active standalone mock must reference a structurally valid version that is not simultaneously assigned to another active delivery context.
- A live mock must have `status: 'active'`; archived mocks must have `isLive: false` and must not be referenced by a parent version's `mockTestId`.
- Making the last rotation version of a live normal test mock-only is rejected.
- Deleting a test version is blocked while a normal test, active or archived mock, or in-progress attempt still references it.
- Hard-deleting a parent test or removing one of its versions is blocked while a retained parent-linked mock still points back to that test/version; cleanup must be explicit and must respect attempt retention.
- Mock assignment, unassignment, reactivation, and standalone-to-normal moves use a Firestore batch or transaction so both sides remain consistent.
- Attempt start defensively handles inconsistent data by returning a student-safe unavailable response, logging the configuration error, and exposing the actionable error to admins.

## Version selection and retakes

Normal-test version selection happens in a Next.js server route when an attempt starts, never solely in the browser.

For a normal test:

1. Load and validate only references whose `mockTestId` is `null`.
2. Load the student's prior attempts for that specific origin.
3. Find the least-used eligible versions.
4. Select randomly among those versions.
5. Prefer not to select the immediately previous version when another equally eligible option exists.
6. Create the in-progress attempt with the selected `versionId` and required temporary delivery state before returning content to the client.

Selecting among the least-used versions creates the required shuffle-cycle behavior without a separate placement or rotation document. Every eligible normal-test version is used before versions with higher usage counts are selected again.

A mock-test card always starts its one referenced version. Retaking that card does not rotate into another mock card, even when both cards were created from versions of the same normal test. Attempt history remains scoped to the specific `mockTestId`. Generated exercises may still produce new resolved delivery data for each attempt.

Changing a version's mock assignment affects only attempts started after the transaction commits. An in-progress normal attempt on a version that later becomes mock-only resumes and submits normally from its frozen `versionId`, delivery state, and passing rule. Likewise, an in-progress mock attempt remains resumable if its mock is later archived and the version returns to normal rotation.

## Test attempts

Attempt persistence is required before tests enter the normal lesson flow. The intended lifecycle is:

```ts
interface TestAttemptBase {
  id: string;
  studentId: string;
  versionId: string;
  // Copied from the origin container at attempt start; null means score-only.
  passingPercentage: number | null;

  origin:
    | {
        kind: 'normal-test';
        testId: string;
      }
    | {
        kind: 'mock-test';
        mockTestId: string;
      };

  startedAt: string;
}

interface InProgressTestAttempt extends TestAttemptBase {
  status: 'in-progress';

  // Retained only while the attempt can be resumed.
  answers: Record<string, unknown>;
  // Resolved prompts plus the grading inputs and maxPoints used for this attempt.
  deliveryState: Record<string, unknown>;
}

interface SubmittedTestAttempt extends TestAttemptBase {
  status: 'submitted';

  exerciseResults: Record<
    string,
    {
      title?: string;
      awardedPoints: number;
      maxPoints: number;
    }
  >;

  score: number;
  maxScore: number;
  percentage: number;
  outcome: 'score-only' | 'passed' | 'not-passed';
  submittedAt: string;
}

type TestAttempt = InProgressTestAttempt | SubmittedTestAttempt;
```

At attempt start, the server freezes the container's current `passingPercentage` onto the attempt. Changing the container later affects future attempts only and cannot reinterpret an attempt already in progress or submitted.

On submission, the server grades against the attempt's temporary delivery state rather than the current editable `TestVersion`. It calculates and freezes `exerciseResults`, `score`, `maxScore`, `percentage`, and `outcome`, then removes `answers` and `deliveryState` only after those statistics are persisted successfully. `outcome` is `passed` when `percentage >= passingPercentage`, `not-passed` when it is below a configured threshold, and `score-only` when no threshold exists.

### Attempt concurrency and idempotency

- A student has at most one in-progress attempt per origin (`testId` or `mockTestId`). Attempt start runs in a transaction: if an in-progress attempt already exists for that student and origin, it is returned for resumption instead of creating a second one. Double-clicks, retries, and a second device therefore converge on the same attempt.
- There is no abandon-and-restart action. The exit from an unwanted attempt is submitting it (unanswered exercises score zero) and then retaking; this keeps version-usage counts and attempt history honest.
- Answers persist incrementally to the in-progress attempt as each exercise is answered, keyed by persisted item ID with last-write-wins per exercise. A refresh or device switch resumes from the stored answers and frozen delivery state.
- Submission is transactional on attempt status: submitting an already submitted attempt returns the stored result idempotently rather than regrading, so a network retry cannot double-submit.
- Version-usage counts for least-used selection consider submitted attempts; the single resumable in-progress attempt cannot skew counts because starting again resumes it.
- `deliveryState` lives inside the attempt document, which is subject to Firestore's 1 MiB document limit. Attempt start must fail with an admin-visible configuration error if the frozen delivery state would exceed a safety threshold; extremely large versions are an authoring problem to surface, not silently truncate.
- Stale in-progress attempts are not automatically expired in this refactor. They contain grading inputs, so if a cleanup policy is added later it must delete, not archive, the temporary state.

For a normal test, a `passed` or `score-only` submission grants sticky learning-unit completion. Once granted, later retakes cannot remove it. A mock outcome is informational only. The student can use retained statistics to review performance and decide whether to retake, but cannot reopen historical questions or answers. Editing a test version later never changes a submitted attempt's stored statistics.

Dashboard summaries derive the best result by highest stored percentage and the latest result by `submittedAt`; raw awarded/max points always come from the specific attempt being displayed.

There is no `placementId` or revision number. The attempt's origin distinguishes normal-flow and mock usage. Preview attempts remain ephemeral and must never persist progress or attempt records.

## Learning-path gating integration

The dashboard's lock chain currently derives each unit's status positionally: a unit is unlocked when the previous unit is complete, and lesson completion is computed as `currentPageIndex >= pages.length` from the `userProgress` record. Tests must plug into that chain without breaking it.

- Sticky test completion is materialized into `userProgress`: when a normal-test submission grants completion (`passed` or `score-only`), the same server transaction writes a completed `userProgress` record for the test unit (`${userId}_${unitId}`), alongside the attempt statistics. The existing chain then needs only a kind-aware completion check, and completion never has to be re-derived from attempt history on every dashboard read.
- The chain's completion check becomes kind-aware: lessons keep the page-index calculation; tests read the materialized completion record. A `TestUnit` has no `pages` array, so any code path applying page math to it is a bug.
- Progression is monotonic when the learning path changes. Inserting a new required-pass test does not re-lock a student who has already started or completed a unit after that insertion point. The dashboard derives the student's reached frontier from existing lesson progress, test attempts, and completion records; an inserted test behind that frontier remains available to take but is treated as non-gating for that student. Students whose recorded frontier has not passed the insertion point must satisfy the new test normally.
- `TestUnit` keeps `type: 'normal'`, which collides with the lesson type filter `type === 'normal'` used by the dashboard API and admin screens. Every consumer of the `lessons` collection must discriminate on `kind` before `type`. Until that is deployed, no test may be published: a live `TestUnit` would be swept into the normal-lessons pipeline as a broken zero-page lesson. This is the one hard sequencing constraint between Phase 3 and Phase 5.
- The `NEXT_PUBLIC_DISABLE_PROGRESSION_LOCK` flag bypasses required-pass test gates the same way it bypasses lesson locks. It is a development convenience, and a half-disabled chain would be harder to reason about than a fully disabled one.
- Test cards do not show page-based progress percentages. Their card state derives from attempt summaries: not attempted, in progress, or the best/latest submitted results.

## Storage and Next.js API direction

Keep the existing Firestore `lessons` collection for learning units during the initial refactor. This avoids a risky collection rename while application code adopts learning-unit terminology.

```text
lessons/{learningUnitId}       LessonUnit or TestUnit during migration
testVersions/{versionId}      Separately stored version pages and scoring
mockTests/{mockTestId}         Mock Tests category containers
testAttempts/{attemptId}       Attempt lifecycle and frozen statistics
```

All server behavior uses Next.js API routes and shared server modules. The preferred API surface is:

```text
/api/admin/learning-units
/api/admin/test-versions
/api/admin/mock-tests
/api/test-attempts
```

Existing lesson endpoints may remain as compatibility adapters until callers migrate. Admin routes must use the existing admin authorization rules. Validation and derived-score calculation should live in shared server modules so all routes apply identical rules. Attempt routes additionally enforce that a student can only start, resume, and submit their own attempts.

### Firestore security rules

The current rules allow direct client read/write on every collection except `diagramming_attempts`. Left unchanged, a student could read `testVersions` answer keys or forge a passing `testAttempts` document from the browser console, making the server-authoritative design a fiction.

- `testVersions`, `testAttempts`, and `mockTests` are server-only: client read and write are denied, and all access flows through the API routes using the Admin SDK, which bypasses rules.
- `userProgress` also becomes server-only in this refactor because it now materializes gate-controlling test completion; its API routes already exist.
- Broader tightening of the legacy wildcard rule is desirable but out of scope; the rule above must ship with Phase 3, before any attempt data exists.

### Composite indexes

`firestore.indexes.json` gains entries alongside the new queries, at minimum:

- `mockTests`: `status` + `isLive` + `mockOrder` for the student dashboard, and `parent.testId` lookups for admin overviews.
- `testAttempts`: `studentId` + `origin.testId` + `status` and `studentId` + `origin.mockTestId` + `status` for selection counts and resume checks, plus `submittedAt` ordering for latest-attempt summaries.

Exact shapes are settled during implementation; the requirement is that every new query path has its index deployed with the phase that introduces it rather than discovered as a runtime error.

## Validation architecture

This refactor establishes a domain-validation layer rather than extending an existing comprehensive lesson validator. Zod is the standard boundary for new and migrated documents.

- Normalize legacy data before validation, including interpreting a missing learning-unit `kind` as `lesson`.
- Use a discriminated Zod union for `LessonUnit | TestUnit` and dedicated schemas for `TestVersion`, `TestVersionReference`, and `MockTest`.
- Use structural schemas for shared metadata, pages, item IDs, references, and lifecycle fields.
- Use semantic refinements for version-wide unique item IDs, contextual `maxPoints` requirements, non-exercise scoring rejection, the `passingPercentage` range, rotation eligibility, active/archived lifecycle combinations, and live-container eligibility.
- Keep pure document-shape checks in Zod; enforce cross-document exclusivity and bidirectional parent/mock consistency in the server transaction service using those parsed documents.
- Reuse existing exercise-specific validators where available rather than rewriting every exercise schema in Phase 1.
- Consolidate deeper exercise validation incrementally behind the same shared server modules.
- Apply the same schemas in all Next.js mutation routes and server-side attempt creation.

## Compatibility

There is no POC data migration. The `tests` collection is deleted during cleanup and real tests are created fresh through the new builder. Compatibility work is limited to existing lessons:

- Existing lesson documents without `kind` are read as `kind: 'lesson'`.
- New and updated learning-unit documents persist an explicit `kind`.
- Existing lesson pages, `type`, progress behavior, URLs, `isLive`, and `liveOrder` remain unchanged.
- Existing lesson exercises do not need `maxPoints`; the field is optional in the shared exercise type and required only during test-version validation.
- Existing vocabulary lessons retain `type: 'vocab'` and their current dashboard, player, and progress behavior.
- Normal tests use the same `isLive` and `liveOrder` fields and can therefore be sorted together with lessons.
- A `kind: 'lesson'` backfill for existing lesson documents is optional; the read-time normalizer makes it safe to run at any point or not at all.

## Implementation plan

### Phase 1: Domain compatibility

- Add `LearningUnitBase`, `LessonUnit`, `TestUnit`, `LearningUnit`, `TestVersionReference`, `TestVersion`, and `MockTest` types.
- Preserve all existing lesson types, including `vocab`.
- Add optional `maxPoints` to the shared `BaseExercise` type without changing lesson validation or behavior.
- Add exclusive-assignment, container-level `passingPercentage`, nullable `mockTestId`, mock parent, and active/archived lifecycle validation.
- Add normalizers that interpret missing `kind` as `lesson`.
- Preserve a temporary `Lesson` alias to avoid a flag-day caller migration.
- Establish Zod schemas for learning units, separately stored versions, version references, and mock tests, with scoped reuse of existing exercise validators.
- Enforce bidirectional consistency between an active parent-linked `MockTest` and the matching `TestVersionReference.mockTestId`.
- Enforce non-empty, version-wide unique persisted item IDs and contextual test scoring rules.
- Consolidate the exercise-type registry used by authoring, counting, rendering, and test validation.
- Add unit tests for legacy lesson normalization, vocabulary compatibility, stable-ID rules, scoring rules, and all new domain schemas.

### Phase 2: Shared test-version editor and player

- Generalize reusable lesson editor state where necessary without duplicating content-editor behavior.
- Make the test builder edit page-based `TestVersion` documents rather than a synthetic flat test.
- Support multiple pages, ordinary content, exercises, points, and derived total points.
- Match the lesson creator's page/content workflow and split-screen interactive preview, while adding test breadcrumbs, point controls, total points, and container passing settings.
- Set and edit `maxPoints` directly on exercise items; initialize new test exercises to `1` point.
- Make the shared renderer emit the persisted `item.id` plus positional context instead of inventing an exercise ID at runtime.
- Keep the existing normal-lesson positional progress format behind a compatibility adapter while test mode keys state by persisted item ID.
- Use runtime mode `practice | test | preview`, with test-mode feedback timing overriding when exercise-level feedback may be revealed.
- In test mode, exercise components collect and report canonical raw answers instead of grading locally, and generated exercises render from injected pre-resolved items instead of self-fetching.
- Restrict the test builder's content palette to allowlisted exercise types plus unscored content.
- Reuse the lesson editor's draft and recovery conventions for `TestVersion` editing rather than inventing a separate safety mechanism.
- Remove the synthetic lesson adapter after the page-based version editor is stable.

### Phase 3: Learning-unit API

- Add Next.js learning-unit and test-version API routes.
- Optionally backfill existing lessons with `kind: 'lesson'`; the normalizer covers unbackfilled documents either way.
- Update the admin lesson list APIs and `LessonManager` to filter on `kind` so `TestUnit` documents in the shared `lessons` collection never appear in Lesson Management.
- Save newly created containers and their first valid version atomically.
- Lock down Firestore security rules and add the composite indexes required by the new collections (see Storage direction).
- Retain compatibility routes and redirects during rollout.

### Phase 4: Attempts and retakes

- Persist attempts separately from lesson progress before tests enter the normal flow.
- Build the per-type server grading modules and canonical answer formats for every allowlisted exercise type, verified against the existing client grading behavior.
- Resolve generated exercises server-side at attempt start and freeze the resolved items into `deliveryState`.
- Return only sanitized attempt content to the client; grading inputs never leave the server.
- Enforce one in-progress attempt per student and origin transactionally; attempt start resumes an existing attempt, and duplicate submissions return the stored result idempotently.
- Select normal-test versions server-side using the least-used randomized cycle, and always use a mock card's single referenced version.
- Freeze the origin container's `passingPercentage` at attempt start.
- Temporarily retain answers and resolved delivery state, including grading inputs and `maxPoints`, so an in-progress attempt resumes consistently; guard against the Firestore document size limit at attempt start.
- Grade against the attempt's delivery state rather than the current editable test version.
- Freeze score statistics, passing outcome, and exercise-level results on submission, then remove exact questions, answers, and temporary delivery state.
- Retain submitted statistics for student history and retake decisions.
- Grant sticky normal-flow completion after a passing or score-only submission by writing the materialized `userProgress` completion record in the same transaction; never revoke it because of a later lower retake.
- Query best percentage and latest attempt separately for dashboard presentation.
- Calculate with full precision and apply rounding only when displaying points and percentages.
- Add tests for per-type grading parity with the client implementations, component-level partial credit in both generated-exercise modes, normalization to different `maxPoints` values, threshold equality, score-only completion, failed gating, permanent completion after a pass, duplicate start/submit idempotency, and best/latest summary selection.
- Verify that in-progress normal and mock attempts remain resumable when later assignment changes make their selected version ineligible for new attempts.

### Phase 5: Normal-flow integration

- Include normal tests in the same `isLive` and `liveOrder` sequence as normal lessons.
- Make every consumer of the `lessons` collection kind-aware before any test is published; the dashboard lock chain uses page math for lessons and the materialized completion record for tests.
- Make progression monotonic across path edits: derive each student's reached frontier from existing progress and attempts so a newly inserted required-pass test cannot re-lock students who already progressed beyond its insertion point.
- Extend the current live-lesson screen into a shared Learning Path organizer for normal lessons and normal tests.
- Add insertion buttons before, between, and after units; open a test picker and transactionally insert the selected `TestUnit` at that exact `liveOrder`.
- Give admin rows and student cards distinct accessible test styling through color, iconography, and labels.
- Enforce at publish time that every live test has at least one valid reference whose `mockTestId` is `null`.
- Route normal lessons to practice behavior and tests to persisted attempt creation, randomized version selection, and assessment behavior.
- Include the pre-start expectations moment, in-test answered-count progress, review-before-submit step, and results breakdown with distance-to-pass messaging.
- Return a safe unavailable state and log an admin-visible configuration error if an attempt cannot resolve a valid version.
- Ensure preview never writes lesson progress or attempts.

### Phase 6: Mock Tests

- Add Mock Tests admin management and a student dashboard section directly below the normal learning path.
- Support manual standalone one-version mock creation.
- Create one active `MockTest` and one student card for every normal-test version assigned as mock; never group multiple assigned versions into one mock card.
- Add the confirmed assignment workflow from the version editor, including the rotation-removal warning, editable mock title, and passing rule.
- Atomically set the parent reference's `mockTestId` and create or reactivate the matching parent-linked mock document.
- Make assignment idempotent per parent test/version pair and reuse the same `mockTestId` and attempt history after reactivation.
- Use a stable server-side idempotency key for the parent test/version pair, implemented through a deterministic mock ID or an equivalent transactional uniqueness record.
- Archive rather than delete when returning a version to rotation; distinguish archived mocks from active but non-live mocks.
- Support atomically moving a standalone mock version into normal rotation, or explicitly duplicating it when both destinations are required.
- Enforce active parent/mock bidirectional consistency and require at least one normal-rotation version in every live parent test.
- Keep `mockOrder` independent from normal `liveOrder`, and give admins an explicit control for ordering mock cards.
- Display best percentage, latest raw/percentage score, attempt count, score trend, and informational passing status directly on each mock card.
- Nudge a failed required-pass normal test toward its related live mock when one exists.
- Hide the student Mock Tests section when no mock is live.

### Phase 7: Cleanup

- Delete the POC `tests` collection outright; no conversion or retention period is needed because real tests are authored fresh in the new system.
- Remove `TestDefinition`, the POC `/api/admin/tests` routes, the POC `/admin/tests/*` pages, `TestBuilder`/`TestRunner`, and test-specific adapter state.
- Remove temporary aliases and compatibility adapters after all callers use the new model.

## Acceptance criteria

- Existing lessons load and behave the same before and after backfill.
- Legacy documents without `kind` continue to load during rollout.
- Normal, vocabulary, sentence-diagramming, and listening lessons retain their specialized behavior.
- Existing lesson exercises without `maxPoints` remain valid and behave exactly as before.
- Test Management remains a separate top-level admin section from Lesson Management.
- Opening a normal test shows every version, its scoring, and whether it is in normal rotation or linked to a mock card.
- The test-version editor retains the lesson creator's page/content workflow and interactive preview while adding exercise points and container passing settings.
- Normal lessons and normal tests can be ordered together through `liveOrder`.
- The Learning Path organizer provides an insertion button before, between, and after units; selecting a test inserts it at that exact position.
- Admin rows and student cards distinguish tests from lessons using visible labels and icons as well as color.
- Mock tests appear only in the Mock Tests category and use `mockOrder`.
- The Mock Tests section appears immediately below the normal learning path and before existing practice categories.
- A test version can contain multiple pages, non-scored content, and scored exercises.
- Every persisted test version belongs to at most one active delivery context; attaching it elsewhere requires an explicit move or copy operation.
- Every persisted test-version item has a non-empty ID that is unique across the entire version.
- Reordering an item preserves its ID, while copying an item or page creates new IDs.
- Test answers and results use persisted item IDs; existing lesson progress remains compatible with its legacy positional format.
- Server validation rejects a version with a missing score or a score assigned to non-exercise content.
- Server validation rejects a version containing a non-allowlisted exercise type or no scored exercise at all.
- Adding an exercise automatically assigns the default point value.
- Adding or editing non-exercise content does not change total points.
- Copying an exercise copies its inline `maxPoints`; deleting it requires no separate scoring cleanup.
- In `generated-form-identification` single-field mode, each requested grammatical field is scored independently; expected `1,s,m` versus submitted `1,s,f` earns `2 / 3` of the exercise's configured `maxPoints`.
- A normal test can reference multiple versions.
- A mock test references exactly one version.
- A version reference with `mockTestId: null` participates in normal rotation; a non-null value makes that version mock-only.
- Assigning two normal-test versions as mocks creates two mock containers and two student dashboard cards, and neither version remains in normal rotation.
- A parent-linked mock points directly back to the test and version that remain visible together in the admin overview.
- Parent tests and versions cannot be hard-deleted while retained linked mocks or their required attempt history depend on that relationship.
- Repeating or retrying the same assignment action reuses the same mock card and does not create duplicates.
- Unassigning a mock archives it, preserves its ID and attempts, and returns the parent version to normal rotation.
- An active non-live mock remains mock-only, while an archived mock is no longer assigned.
- A standalone mock version can later be used in a new or existing normal test.
- Moving a standalone mock to a normal test archives the mock; keeping both destinations requires an explicit version duplication.
- Versions are never shared simultaneously between normal rotation and Mock Tests.
- Publishing or mutating a live normal test cannot leave it with zero valid rotation references, and every active mock retains one valid version.
- Normal-test random selection uses every eligible version before repeatedly favoring an already-used version; a mock retake uses that card's single version.
- Refreshing an in-progress attempt does not change the selected version or resolved generated questions.
- Changing a version's mock assignment does not invalidate an attempt that already selected that version.
- A student can never hold two in-progress attempts for the same origin, and repeating a start or submit request returns the existing result instead of duplicating it.
- The attempt payload delivered to the client contains no accepted answers, correct options, or other grading inputs.
- Direct client reads and writes of `testVersions`, `testAttempts`, `mockTests`, and `userProgress` are denied by security rules.
- Final scoring uses the attempt's temporary grading inputs and `maxPoints`, not the current editable version.
- Server grading produces the same result as the practice-mode client grading for every allowlisted exercise type.
- Submitting an attempt removes its exact questions, answers, and temporary delivery state.
- Editing a test version does not change the frozen score statistics of previously submitted attempts.
- Attempt start freezes the applicable passing percentage, and submission freezes the resulting score-only/passed/not-passed outcome.
- A score-only normal test completes on submission, while a required-pass test gates the next unit until passed.
- Test units never appear in Lesson Management, and lesson page math is never applied to a test unit.
- Inserting a required-pass test does not re-lock a student with recorded progress beyond its insertion point; it gates only students who have not yet reached that point.
- Once a normal test grants completion, a later lower retake never relocks the learning path.
- Students can view submitted attempt statistics and choose to retake without reopening historical questions or answers.
- Normal and mock test cards show best percentage prominently and latest raw/percentage score secondarily; mock cards also show attempt count and a score trend across submitted attempts.
- The Mock Tests section is hidden when no mock is live.
- Students never see normal-flow version labels; the editable mock title remains the teacher-controlled exception.
- Every test states its stakes before the attempt starts, and a failing result shows the percentage distance to the threshold with a retake path and, when one exists, a nudge to the related live mock.
- Fractional scores are calculated at full precision and rounded only for display.
- Admin preview writes neither lesson progress nor test attempts.

## Risks and safeguards

- Test-version IDs and content-item IDs must be stable and unique; renderer code must never derive test identity from page or item position.
- Copying an exercise must create a new item ID and retain its inline `maxPoints` value.
- Hard deletion of a test version must be blocked while a normal test or mock test references it.
- Mutation routes must reject accidental cross-context attachment; moves and copies must update all affected references atomically.
- `TestVersionReference.mockTestId` and the active parent-linked `MockTest` are a bidirectional relationship; every mutation must update and validate both sides atomically.
- Archival and visibility are distinct: `isLive: false` cannot by itself mean that a mock assignment has ended.
- Mock assignment mutations must prevent a live normal test from having zero rotation-eligible versions, while attempt start still fails safely if inconsistent data exists.
- Assignment changes affect only future selection and must never invalidate an already persisted in-progress attempt.
- Passing settings are mutable container configuration, so every attempt must freeze the threshold used to determine its outcome.
- Submitted attempts cannot be reviewed question-by-question or regraded after their exact questions and answers are removed; this is an intentional product limitation.
- In-progress delivery state must be removed only after the server has calculated and persisted the final score statistics successfully.
- Normal-test random selection must happen server-side and persist the chosen version before the client receives it.
- Server grading modules and client practice grading are parallel implementations of the same rules; parity tests per exercise type are the guard against drift.
- Security rules for the new collections must ship before any attempt data exists; server-authoritative grading is meaningless while clients can write attempts directly.
- No test may be published until every consumer of the `lessons` collection discriminates on `kind`; otherwise live test units render as broken zero-page lessons.
- A flag-day `Lesson` to `LearningUnit` rename creates unnecessary regression risk; migrate callers incrementally.
- Moving the existing lesson collection immediately would complicate rollback and existing references.

## Open decisions

1. Submitted attempts retain per-exercise statistics, but no teacher-facing view of student results is planned in this refactor. Confirm it is deliberately out of scope or schedule it as a later phase.

## Decision log

The current schema, invariants, workflows, and implementation phases are authoritative. This register records the rationale for settled choices; if it conflicts with the current document body, the body wins.

| Date       | Settled decision                                                                                                                   | Why it matters                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-13 | Use `LearningUnit = LessonUnit \| TestUnit`, distinguish with `kind`, and preserve every lesson `type`.                            | Lessons and normal tests share one flow without breaking vocab, diagramming, or listening behavior.                                         |
| 2026-07-13 | Keep learning units in the existing Firestore `lessons` collection during migration.                                               | Incremental normalization and compatibility adapters are safer than a collection flag day.                                                  |
| 2026-07-13 | Store each `TestVersion` as a separate first-class document without immutable revision history.                                    | Large page content remains independently editable; alternative versions matter now, edit history does not.                                  |
| 2026-07-14 | Use Next.js server routes plus scoped Zod validation for all new domain mutations.                                                 | Next.js API routes are the primary server boundary; the `gradeTranslationFn` Firebase Function stays a practice-only exception.             |
| 2026-07-14 | Store positive `maxPoints` directly on every test exercise and infer exercises from the type registry.                             | Scoring stays synchronized while existing lesson exercises remain valid without points.                                                     |
| 2026-07-14 | Use stable persisted content-item IDs and calculate item- and component-level fractional scores at full precision.                 | Reordering cannot re-key answers, and generated-form fields such as `1,s,m` can earn independent credit normalized to the exercise points.  |
| 2026-07-14 | Store container-level percentage thresholds; `null` means score-only, and version totals may differ.                               | Passing is delivery policy, while percentages normalize alternatives with different point totals.                                           |
| 2026-07-14 | Persist attempts before flow integration, freeze delivery and passing state at start, then retain only submitted statistics.       | Refreshes remain stable without permanently retaining questions or answers.                                                                 |
| 2026-07-13 | Select normal versions server-side through a least-used random cycle and scope histories by origin.                                | Students cycle through eligible alternatives while normal and mock attempts remain independent.                                             |
| 2026-07-14 | Apply assignment/configuration changes only to future attempts and make earned normal completion sticky.                           | Existing attempts remain valid, and a later lower retake cannot relock the learning path.                                                   |
| 2026-07-14 | Do not let a newly inserted required-pass test re-lock students who already progressed beyond its insertion point.                 | Learning-path edits must not revoke access a student has already reached; the new gate applies only before the student's recorded frontier. |
| 2026-07-14 | Make normal rotation and mock delivery mutually exclusive through nullable `mockTestId`.                                           | A mock-only version remains under its parent test but can never be selected in normal rotation.                                             |
| 2026-07-14 | Keep one separate `MockTest` document per mock version with its own ID, order, passing rule, and visibility.                       | Dashboard queries, attempt origins, standalone mocks, and two-version/two-card behavior use one shape.                                      |
| 2026-07-14 | Maintain a bidirectional parent/mock link, archive instead of delete, and separate lifecycle from visibility.                      | Parent overviews stay complete, IDs and history survive reassignment, and hidden mocks stay mock-only.                                      |
| 2026-07-14 | Require explicit duplication when equivalent content must exist in both normal and mock delivery.                                  | Versions are never silently shared across simultaneous delivery contexts.                                                                   |
| 2026-07-13 | Do not introduce a generic `placementId`.                                                                                          | `testId`, `mockTestId`, explicit origins, `liveOrder`, and `mockOrder` cover current delivery needs.                                        |
| 2026-07-14 | Keep Test Management separate and make the version editor match the lesson creator with points, passing controls, and preview.     | Teachers get a familiar authoring experience without a second content-editor system.                                                        |
| 2026-07-14 | Extend the existing live-order screen into the mixed Learning Path organizer with plus-button insertion and explicit placement.    | Teachers can distinguish, insert, and reorder tests among lessons without accidental publishing.                                            |
| 2026-07-14 | Give lesson, test, and mock cards distinct accessible treatments; place Mock Tests below the learning path and hide it when empty. | Students can identify assessment types immediately without an empty or color-only interface.                                                |
| 2026-07-14 | Hide normal-flow version labels, while keeping mock titles teacher-controlled.                                                     | Students should not compare hidden alternatives as easy/hard, but separate mock cards need names.                                           |
| 2026-07-14 | Show best score primarily, latest score and trend secondarily, and retained exercise statistics on results.                        | Students can judge progress and retake value without reopening historical questions.                                                        |
| 2026-07-14 | Required-pass failures show threshold distance, a retake path, and a related live-mock nudge when available.                       | Failure feedback remains actionable without leaking answers or consuming rotation versions.                                                 |
