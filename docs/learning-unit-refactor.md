# Learning Unit and Test Schema Refactor

Status: Working draft  
Last updated: 2026-07-15

## Purpose

Integrate tests into the existing lesson flow while preserving the lesson creator experience, supporting alternative test versions, and adding a separate Mock Tests dashboard category.

This document is the shared planning space for the refactor. Settled choices are recorded in the decision log. Questions that still need a product decision remain under **Open decisions**.

## Current state

- Lesson documents are stored in the Firestore `lessons` collection and use the `Lesson` schema.
- Lesson behavior is specialized with `type: vocab | normal | sentence-diagramming | listening`.
- Lessons contain ordered pages with both instructional content and exercises.
- The test POC stores a separate `TestDefinition` in the `tests` collection. It now persists lesson-style `pages` plus redundant `items` and deprecated `exercises` adapters for compatibility with the original flat POC.
- POC point values live in `ScoredTestExercise` wrappers and in a separate local points map rather than inline on exercise content.
- The POC test builder loads a lesson-shaped authoring document into `lessonEditorSlice` to reuse the existing page and content editors. The adapter is not persisted as a lesson.
- Test attempts and preview scores are held in browser memory and are not persisted.
- Admin lesson, test, and practice-category data already flow through authenticated RTK Query APIs using `createAuthenticatedBaseQuery`; the store currently registers a separate `createApi` reducer and middleware for each domain.
- Lesson exercise progress now uses persisted content-item IDs. Schema-v1 positional exercise IDs are normalized to stable IDs on server writes and can be migrated through the admin progress migration route.
- Lesson completion now uses progress schema v2: `status: 'completed'` is authoritative, `furthestPageIndex` is the non-regressing lesson cursor, and `currentPageIndex >= pages.length` remains only a legacy compatibility fallback.
- Finishing a lesson is an explicit authenticated server transaction that verifies the authored final page and required exercise completion. Lesson preview already disables page, exercise, and completion progress writes.
- Practice lesson categories are stored independently in `practiceCategories` and `practiceCategoryMemberships`; response-only category joins are not persisted on lesson documents.
- Direct client writes to `lessons` and direct client reads or writes to the two practice-category collections are denied by Firestore rules. The legacy wildcard still exposes other collections unless they receive an explicit rule.

The POC proves the authoring and scoring behavior. The refactor should now make tests part of the wider learning flow without creating parallel content, rendering, or editor systems.

Implementation agents must treat the existing code as the starting point, not as sample code to recreate. Before adding a type, registry, API client, editor, grader, ID helper, or transaction helper, search the reuse map and named files in **Project implementation blueprint** below. New code should extend those seams or deliberately replace them; two active implementations of the same rule are not acceptable.

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

  // Server-derived summary fields. Clients never supply authoritative values.
  totalPages: number;
  totalItems: number;
  totalExercises: number;
  totalPoints: number;

  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}
```

A test version is separately stored scored content, not an independently published student destination. Persisted versions must be structurally valid. The server recomputes all four summary fields from `pages` on every create or update, following the existing lesson-summary pattern; this permits list and picker APIs to project metadata without downloading page bodies. Versions are assigned to one active delivery context rather than shared simultaneously across tests and mocks. Domain mutation routes reject attaching an existing version to a second context; moving is an explicit atomic operation and copying creates a new version ID.

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
- Each allowlisted type gets one pure, environment-agnostic grading function in a shared module: `(gradingInput, answer) -> { awardedPoints, maxPoints }` per exercise. Existing component-local calculations are extracted into that function, then both practice UI and server submission grading call it. Do not retain separate client and server implementations whose equality depends only on tests.
- In test mode, components collect and report raw answers instead of receiving grading inputs or grading locally. Practice mode keeps its current feedback behavior but delegates its score calculation to the same pure function.
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

Normal lesson progress already uses persisted `item.id` values. The lesson renderer reports the stable item ID when an exercise completes, and the progress API normalizes legacy schema-v1 positional identifiers such as `page0-item1` to the current persisted item ID. A one-time admin migration can rewrite remaining legacy records, while read/write compatibility remains in place during rollout.

Test mode reuses this stable-ID path rather than introducing a separate normal-lesson adapter. If the assessment player needs page and item positions for display or diagnostics, its event payload may include that positional context alongside the authoritative persisted item ID; positions must never key answers, delivery state, or results.

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

- A student has at most one in-progress attempt per origin (`testId` or `mockTestId`). Enforce this with a deterministic server-only `testAttemptSessions` document keyed by a collision-safe hash of `[studentId, origin.kind, originId]`, not with an unguarded “query then create.” Attempt start reads the session pointer and attempt in one transaction: it resumes a valid in-progress attempt or creates one attempt and updates the pointer. Submission clears the active pointer in the same transaction that freezes the result. Double-clicks, retries, and a second device therefore converge on the same attempt.
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

The dashboard's lock chain is positional in the learning path: a unit is normally unlocked when the previous unit is complete. Stored lesson completion is no longer inferred from page math for schema-v2 records. It is represented by `status: 'completed'`; `furthestPageIndex` records the highest visited lesson page, and `currentPageIndex >= pages.length` is recognized only for unmigrated schema-v1 records. Tests must plug into that explicit completion model without acquiring fake page state.

- Sticky test completion is materialized into `userProgress`: when a normal-test submission grants completion (`passed` or `score-only`), the same server transaction writes a completed progress record for the test unit (`${userId}_${unitId}`), alongside the attempt statistics. The chain then needs only a kind-aware completion check, and completion never has to be re-derived from attempt history on every dashboard read.
- Keep the existing `lessonId` field as a compatibility name for the ID of a document in the shared `lessons` learning-unit collection. A test-completion record stores the `TestUnit.id` in `lessonId`; introducing and backfilling a parallel `unitId` is not required by this refactor.
- A materialized test-completion record has the following canonical shape. It deliberately has no `furthestPageIndex` or `currentPageIndex`, and test answers and exercise results remain in `testAttempts` rather than being copied into progress:

```ts
interface TestUnitCompletionProgress {
  userId: string;
  // Compatibility field: identifies either a LessonUnit or TestUnit in `lessons`.
  lessonId: string;
  status: 'completed';
  exerciseProgress: [];
  completedAt: string;
  lastAccessedAt: string;
  updatedAt: string;
  progressSchemaVersion: 2;
}
```

- The chain's completion check is kind-aware: lessons use the schema-v2 lesson completion helper with its schema-v1 fallback; tests require a materialized `status: 'completed'` record. A `TestUnit` has no `pages` array, so any code path applying page math to it is a bug.
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
testAttemptSessions/{scopeId}  Deterministic active-attempt uniqueness pointer
```

All server behavior uses Next.js API routes and shared server modules. The preferred API surface is:

```text
/api/admin/learning-units        Mixed inventory, publication and ordering
/api/admin/tests                 TestUnit management backed by `lessons`
/api/admin/test-versions         Version content and summaries
/api/admin/mock-tests            Mock containers and assignment operations
/api/learning-path               Student mixed path projection
/api/mock-tests                  Student live mock summaries
/api/test-attempts               Start, resume, answer, submit and history
```

The existing `/api/admin/tests` path changes from POC `TestDefinition` CRUD to normal-test container management; the new service writes those containers to `lessons`, not `tests`. Existing lesson endpoints may remain as compatibility adapters until callers migrate. Admin routes must use the existing admin authorization rules. Validation and derived-score calculation should live in shared server modules so all routes apply identical rules. Attempt routes additionally enforce that a student can only start, resume, and submit their own attempts.

### Firestore security rules

The current rules already deny direct client writes to `lessons`, deny direct client reads and writes to `practiceCategories` and `practiceCategoryMemberships`, and keep `diagramming_attempts` server-only. A permissive legacy wildcard still allows direct access to collections without an explicit rule. Left unchanged, that wildcard would let a student read `testVersions` answer keys, forge a passing `testAttempts` document, or read and alter progress data, making the server-authoritative design a fiction.

- `testVersions`, `testAttempts`, `testAttemptSessions`, and `mockTests` are server-only: client read and write are denied, and all access flows through the API routes using the Admin SDK, which bypasses rules.
- `userProgress` also becomes server-only in this refactor because it now materializes gate-controlling test completion; its API routes already exist.
- `userProgressMigrationV2Backups` must be server-only immediately. It contains full copies of pre-migration progress records and must not remain exposed through the wildcard rule.
- Broader tightening of the legacy wildcard rule is desirable but out of scope; the explicit rules above must ship before any test attempt data exists.

### Composite indexes

`firestore.indexes.json` gains entries alongside the new queries, at minimum:

- `mockTests`: `status` + `isLive` + `mockOrder` for the student dashboard, and `parent.testId` lookups for admin overviews.
- `testAttempts`: origin-specific student history and `submittedAt` ordering for latest/best summaries. Resume lookup uses the deterministic `testAttemptSessions` pointer rather than a status query; add only the concrete history indexes exercised by the implemented queries.

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
- Existing lesson documents may omit `description`; the compatibility normalizer accepts that shape and new learning-unit writes canonicalize an absent description to an empty string.
- Existing lesson exercises do not need `maxPoints`; the field is optional in the shared exercise type and required only during test-version validation.
- Existing vocabulary lessons retain `type: 'vocab'` and their current dashboard, player, and progress behavior.
- Normal tests use the same `isLive` and `liveOrder` fields and can therefore be sorted together with lessons.
- Practice lesson categories remain in the independent `practiceCategories` and `practiceCategoryMemberships` collections. Memberships continue to reference `lessonId`, category fields are not added to `LearningUnitBase` or `TestUnit`, and every category mutation must require normalized `kind === 'lesson'` plus an eligible non-normal lesson `type`.
- `practiceCategoryIds`, `practiceCategories`, and `practiceCategoryPlacements` remain mutation-local or response-only joins and are never persisted on a `LessonUnit` or added to the learning-unit union.
- Firestore projections and summary queries must explicitly select `kind` before normalizing or filtering. In particular, the admin lesson summary projection cannot omit `kind`, because an omitted projected discriminator would be indistinguishable from a legacy lesson document.
- Existing schema-v2 lesson progress keeps the compatibility field name `lessonId`. Test-unit completion uses that same field for the ID of the shared `lessons` document, but never adds page cursors to a test progress record.
- A `kind: 'lesson'` backfill for existing lesson documents is optional; the read-time normalizer makes it safe to run at any point or not at all.

## Project implementation blueprint

This section is normative for implementation in this repository. The schema sections define the product model; this section defines where that model belongs in the current codebase and which existing paths must be extended.

### Required reuse map

| Concern                             | Existing project seam                                                                                                            | Implementation rule                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated client API            | `src/store/api/baseQuery.ts`                                                                                                     | Reuse `createAuthenticatedBaseQuery` and `getApiErrorMessage`; do not add component-level token handling or a second base-query implementation.                                                                       |
| Admin and student authorization     | `src/lib/verifyAdminAccess.ts`, `src/lib/verifyRequestAuth.ts`                                                                   | Admin routes call `verifyAdminAccess`; attempt routes decode the token and derive the student from it. A client-supplied student ID is never authoritative.                                                           |
| Domain/service/route structure      | `src/lib/practice-categories/{domain,schemas,service,api}.ts` and its thin route handlers                                        | Follow this separation for learning units and assessments: pure normalization, Zod boundaries, injectable Firestore service, shared domain errors, and thin routes.                                                   |
| Learning-unit queries and progress  | `src/store/api/lessonApi.ts`, `src/app/api/lessons/route.ts`, `src/utils/lessonProgress.ts`                                      | Evolve these into kind-aware learning-unit paths. Do not create a second student learning-path fetch or another completion algorithm.                                                                                 |
| Test client API and POC routes      | `src/store/api/testApi.ts`, `src/app/api/admin/tests/**`                                                                         | Replace the POC endpoint definitions in place with container/version/mock/attempt endpoints. Do not add parallel assessment API slices alongside `testApi`.                                                           |
| Page/content authoring              | `lessonEditorSlice`, `LessonBuilder`, `PageSection`, `DraggableContentList`, `ContentEditor`, and `content-editor/**`            | Reuse the existing editor actions and every leaf content editor through a typed page-document adapter. Do not fork test-specific copies of content editors or drag-and-drop components.                               |
| Content creation and classification | `src/utils/contentFactory.ts`, `src/utils/contentTypeConstants.ts`, `src/utils/lessonUtils.ts`, `src/utils/editorRegistry.ts`    | Consolidate pure content metadata and the exercise predicate before adding test eligibility. Derive lesson palettes and the test allowlist from that source instead of adding another hard-coded list.                |
| Copy and stable IDs                 | `src/utils/idUtils.ts`, `clipboardSlice`, `ClipboardProvider`                                                                    | Reuse `regeneratePageIds` and `regenerateContentAndTooltipIds`. Copying preserves inline `maxPoints` through object copying while regenerating page and top-level content IDs.                                        |
| Rendering                           | `ContentRenderer`, `PageTemplate`, `LessonPlayer`                                                                                | Extend the shared renderer with an explicit runtime mode and answer events. Do not implement a separate switch over content types in the test player.                                                                 |
| Existing pure scoring helpers       | `src/utils/exercises/**`, especially generated translation/form-identification, and `src/features/sentence-diagramming/model.ts` | Extract or extend pure graders here and call the same functions from practice UI and server submission. `scoreSingleFieldFormIdentificationAnswer` and `compareDiagramAnnotationSets` are existing examples to reuse. |
| Generated exercise queries          | `advancedVocabularyApi`, `src/app/api/admin/words/route.ts`, `composeSelectFields`, `deriveTableTypeFromPOS`                     | Extract reusable server query/resolution logic; attempt services must not call an internal HTTP route or instantiate RTK Query on the server. Reuse the existing select-field and form-mapping utilities.             |
| Admin ordering UI                   | `src/app/admin/lessons/live/page.tsx`, `lessonSlice`, `SortableLessonItem`                                                       | Generalize the row and server mutation for mixed units. RTK Query becomes the server-state owner; do not add test entities to the existing duplicated `lessonSlice` mirror.                                           |
| Student dashboard                   | `src/app/dashboard/page.tsx`, `PracticeSection`, existing lesson cards                                                           | Change the main sequence to `LearningUnit[]`, add a test-card variant, and insert `MockTestsSection` before `PracticeSection`. Practice categories remain untouched.                                                  |
| Route and service tests             | Existing direct route tests and injected-service tests under `tests/`                                                            | Continue Jest route/service tests with mocked Admin SDK boundaries, plus focused React tests. Add Playwright coverage only for the final cross-page happy paths.                                                      |

### Target module boundaries

Evolve existing files where they already own the concept, and add only the missing domain modules:

```text
src/types/learning-unit.ts                 Shared discriminated unit and summary types
src/types/test.ts                          TestVersion, MockTest, attempt and answer types
src/lib/learning-units/domain.ts           Legacy lesson normalization and kind guards
src/lib/learning-units/schemas.ts          Learning-unit Zod document/input schemas
src/lib/learning-units/service.ts          Shared collection queries, publication and ordering
src/lib/tests/domain.ts                    Pure scoring totals, summaries and assignment rules
src/lib/tests/schemas.ts                   Version, mock, attempt and route-input schemas
src/lib/tests/service.ts                   Firestore transactions and attempt lifecycle
src/lib/tests/api.ts                       Shared typed domain/auth error responses
src/lib/tests/grading/                     Pure answer schemas, sanitizers and graders by type
src/lib/tests/generated.ts                 Server-side generated-exercise resolver
src/store/api/appApi.ts                    One authenticated RTK Query base for touched domains
src/store/api/lessonApi.ts                 Injected learning-unit/progress endpoints
src/store/api/testApi.ts                   Injected test/version/mock/attempt endpoints
src/store/api/practiceCategoryApi.ts       Injected existing category endpoints
src/store/api/tags.ts                      Shared tag names/constants without circular imports
```

`src/lib/**/service.ts` and Admin SDK helpers are server-only modules and must never be imported by client components or RTK endpoint files. Pure schemas, domain functions, and types may be shared when they do not import Firebase Admin, Node-only APIs, or secrets. Collection names belong in `shared/constants/firestore.ts`, including the new test collections.

Zod schemas are the runtime boundary source of truth. Infer document and input types from them where practical rather than maintaining matching handwritten request types. UI view models and response summaries may remain explicit types because they intentionally differ from persisted documents.

### RTK Query integration

The repository currently has multiple `createApi` calls that all target `/api`. RTK Query recommends one API slice per base URL because tag invalidation does not cross slices and every API adds middleware work. This refactor should improve the touched path without turning the feature into a migration of all vocabulary code. See the official [API slice guidance](https://redux-toolkit.js.org/rtk-query/api/created-api/overview).

1. Add an empty authenticated `appApi` using `createAuthenticatedBaseQuery`, the shared tag types, and `endpoints: () => ({})`.
2. Convert `lessonApi`, `testApi`, and `practiceCategoryApi` from separate `createApi` calls to `appApi.injectEndpoints`. Preserve their current module-level hook exports so components migrate with minimal churn.
3. Register `appApi.reducer` and `appApi.middleware` once in `src/store/index.ts`, removing the three replaced reducers and middleware entries. Keep the unrelated vocabulary APIs working as-is; migrate them later when touched.
4. Every new learning-unit, version, mock, and attempt endpoint is injected into `appApi`. Do not add `learningUnitApi`, `mockTestApi`, or `attemptApi` via new `createApi` calls.
5. Put shared tags in `src/store/api/tags.ts` rather than importing one endpoint module from another. This removes the current `practiceCategoryApi -> lessonApi` cache coupling and prevents circular imports after injection.

Use entity tags plus explicit list/summary tags:

- `LearningUnit:{id}` and `LearningUnit:LIST` for admin inventory and the mixed path;
- `StudentLearningPath:{uid}` for the authenticated dashboard projection;
- `TestVersion:{id}` and `TestVersion:FOR_TEST:{testId}`;
- `MockTest:{id}` and `MockTest:LIST`;
- `TestAttempt:{id}` and `AttemptSummary:{originKind}:{originId}:{uid}`;
- the existing practice-category assignment tag, moved to the shared tag module.

Mutation invalidation is domain-based, not page-based. Saving a version invalidates that version and its parent container summary. Publishing, inserting, or reordering a test invalidates admin learning-unit lists and affected student learning paths. Submitting an attempt invalidates the attempt, its origin summary, and—only when normal-flow completion is newly granted—the student learning path. Failed mutations return no invalidation tags. Use optimistic `updateQueryData` only for deterministic reorders and undo the patch on rejection, following `practiceCategoryApi`.

RTK Query owns fetched server state. Ordinary Redux slices remain appropriate for editor drafts, modal state, clipboard state, and temporary ordering UI, but must not hold duplicate authoritative copies of learning units, versions, mocks, or attempts. When the Learning Path organizer replaces the current live-lesson screen, remove its `syncLessonsFromRTQ` mirror; use query data plus a local ordered-ID draft or an optimistic cache patch.

Use generated hooks, `.unwrap()`, `skipToken` for missing IDs, and `getApiErrorMessage`. Do not use raw `fetch` for the new assessment CRUD or attempt lifecycle and do not add Server Actions for the same mutations. Keep the authenticated user's UID in student query arguments as a cache partition even when the server derives identity from the token. Reset the authenticated `appApi` cache when `AuthProvider` changes users or signs out so admin and student projections cannot survive an identity transition.

### Shared authoring implementation

The current content editors read `state.lessonEditor.editingContent` directly, while `PageSection` and its draggable children dispatch lesson-editor actions. Rewriting all of those components to introduce a second test editor store would be expensive and would create drift. Use this incremental design:

- Introduce a typed `PageDocumentDraft` authoring shape containing `editorKind: 'lesson' | 'test-version'`, `ownerId`, `title`, `description`, `pages`, and tooltips. Adapt a `Lesson` or `TestVersion` into that shape when opening the editor and map it back only at save time.
- Extend `lessonEditorSlice` internally to operate on that shared draft while preserving its existing content-editing action API. Compatibility selectors may retain current names during migration; new code should use page-document selectors rather than assume the draft will persist to `lessons`.
- Namespace session draft keys as `lesson:{lessonId}` and `test-version:{versionId}`. Reusing raw IDs in the existing `lesson_drafts` map could let a version overwrite a lesson draft.
- Keep `PageSection`, `DraggableContentList`, `ContentItem`, `ContentEditor`, leaf editor components, clipboard, tooltip handling, `contentFactory`, and ID regeneration shared.
- Replace the POC's `points` state and `ScoredTestExercise` wrappers. In test-version context, the add-content handler adds `maxPoints: 1` to a newly created exercise before dispatching `addContentToPage`; the points control writes the exercise item through `updateContentItem`.
- Editing, moving, and copying then preserve points naturally. Crossing the exercise/content boundary is handled in one domain helper that adds or removes `maxPoints`, not separately in the UI and validator.
- `TestVersionEditor` is a composition shell around the shared page editor. It owns breadcrumbs, the derived total, container passing controls, save status, and preview mode; it does not own another page state or another content modal.

The POC adapter in `TestBuilder` is useful evidence but not the final persistence shape. Replace its ad hoc `TestDefinition <-> Lesson` conversion with the typed shared authoring adapter. Do not spend time maintaining the redundant POC `items`/`exercises` fields because POC documents are explicitly discarded.

### Content registry, runtime modes, and grading

Content classification is currently repeated across `contentTypeConstants`, `lessonUtils.isExerciseType`, `SUPPORTED_TEST_EXERCISE_TYPES`, renderer/editor switches, and builder filtering. Consolidate the server-safe facts into one pure metadata registry: content type, `kind: 'content' | 'exercise'`, and `testEligible`. Derive `isExerciseType`, lesson palettes, test palettes, counts, and validation allowlists from it. Keep React icons/components in client-only registries so server grading never imports client components.

Replace the boolean `testMode` contract incrementally with `runtimeMode: 'practice' | 'test' | 'preview'` and a typed exercise-response callback. A temporary adapter may translate old `testMode` callers while components migrate. The final meanings are:

- `practice`: use shared grading immediately and preserve existing feedback/progression behavior;
- `test`: emit canonical serializable answers, accept restored answers and pre-resolved generated data, and reveal no grading inputs or correctness;
- `preview`: exercise the same assessment UI locally without writing attempts or progress.

Each test-eligible exercise registers four server-safe operations in the grading layer: answer schema, delivery-state sanitizer, pure grader, and optional generated-data resolver. The player and answer-save endpoint use the same answer schema. The start route sanitizes with the same adapter whose grader later consumes the private state. Unsupported types fail version validation before publication and fail safely again at attempt start.

Move score formulas out of exercise components rather than copying them. Existing reusable foundations include generated translation normalization, generated form-identification validation and partial-credit scoring, sentence-diagram comparison, and the other helpers under `src/utils/exercises`. Parity tests protect the extraction, but parity tests are not permission to keep two formulas.

Generated test resolution runs inside the test service. Extract the Firestore vocabulary selection work currently embedded in `src/app/api/admin/words/route.ts` and the multi-POS/multi-paradigm orchestration currently embedded in `advancedVocabularyApi.queryFn` into reusable server and pure helpers. Reuse `composeSelectFields`, `deriveTableTypeFromPOS`, form-path parsing, and existing mappings. The service calls those helpers directly with `adminDb`; it must not make an HTTP request back into `/api/admin/words`, depend on browser randomness, or call RTK Query on the server.

Persist answers only when an answer is committed or explicitly cleared, not on every keystroke. The RTK answer mutation updates one exercise answer, the server validates that answer against the exercise's canonical schema, and the transaction merges it into the existing answer map. Avoid dynamic Firestore field paths built from content IDs; read and write the validated map so IDs containing field-path punctuation cannot target unintended fields.

### Next.js route and service conventions

Use App Router Route Handlers under `src/app/api`, following the project's Next.js 16 convention that dynamic `params` are promises and must be awaited. Current official behavior is documented in the [Route Handler reference](https://nextjs.org/docs/app/api-reference/file-conventions/route).

Every new route follows the same sequence:

1. verify admin or student authentication;
2. await route params;
3. parse JSON or search params through a strict Zod input schema;
4. call one service method;
5. map the typed result or shared domain error to `NextResponse`.

Routes do not contain Firestore relationship logic, scoring, selection, or sanitization. Client auth guards such as `withAdminAuth` are UI affordances only; every admin route still verifies `verifyAdminAccess`. Authenticated GET routes are dynamic/private and must not be statically cached. Services accept an injectable `Firestore` in the same style as `PracticeCategoryService`, centralize timestamps and document conversion, and expose transaction methods for all multi-document invariants.

Use this initial route ownership so UI callers do not invent overlapping endpoints:

```text
GET/POST      /api/admin/tests
GET/PATCH     /api/admin/tests/[testId]
GET/POST      /api/admin/tests/[testId]/versions
GET/PATCH     /api/admin/test-versions/[versionId]
PUT/DELETE    /api/admin/tests/[testId]/versions/[versionId]/mock-assignment
GET/POST      /api/admin/mock-tests
GET/PATCH     /api/admin/mock-tests/[mockTestId]
POST          /api/admin/learning-units/reorder
POST          /api/admin/learning-units/[unitId]/publication

GET           /api/learning-path
GET           /api/mock-tests
POST          /api/test-attempts/start
GET           /api/test-attempts/[attemptId]
PATCH         /api/test-attempts/[attemptId]/answers
POST          /api/test-attempts/[attemptId]/submit
GET           /api/test-attempts/summaries
```

Moving or duplicating a standalone mock into a normal test may use a dedicated action subroute because it is a multi-document domain command, but that command still calls the same test service. List filtering uses validated search parameters; it does not get a route per filter.

Use deterministic, collision-safe IDs where uniqueness is part of an invariant: the project already uses SHA-256 membership IDs in `PracticeCategoryService`, which is the pattern for parent/version mock IDs and attempt-session scope IDs. Do not build ambiguous IDs with raw delimiter concatenation.

List routes return purpose-built summaries. `TestVersion` writes recompute `totalPages`, `totalItems`, `totalExercises`, and `totalPoints`; admin list and picker routes select those fields instead of `pages`. Student dashboard routes return only card/attempt summaries. Full version pages are returned only for admin editing or as sanitized frozen attempt content.

### Learning path and progress implementation

Introduce `normalizeLearningUnit` and `isLessonUnit`/`isTestUnit` in the pure learning-unit domain module. Every Firestore snapshot is normalized before `type` checks. Update `toLessonSummary` or replace it with a kind-aware summary function; the admin `.select(...)` field list must include `kind`.

Refactor the student lessons route into a learning-path service rather than adding a second route that repeats its lock algorithm. It loads live shared-path units once, loads the authenticated user's progress and server-computed attempt summaries, then applies one kind-aware lock pass. Practice lesson enrichment continues through `practiceCategoryService` after filtering to actual lesson units.

The dashboard consumes that projection through the injected learning-unit endpoint. Lesson cards continue to route to `/lesson/[lessonId]`; test cards route to the assessment start/resume screen. `MockTestsSection` uses its own lightweight query and remains outside the normal lock chain. The current `normalLessons.filter(lesson.type === 'normal')` pattern must disappear because it conflates normal lessons with normal tests.

### Verification strategy

- Pure domain tests cover normalization, registries, scoring, sanitization, totals, stable IDs, version selection, and progression without React or Firestore mocks.
- Service tests inject a fake/mocked Firestore boundary and cover transaction atomicity, deterministic uniqueness, stale references, assignment moves, attempt resume, idempotent submit, and sticky completion. Follow the `PracticeCategoryService` and progress-route test style.
- Route tests cover auth status preservation, malformed JSON, strict Zod errors, ownership checks, and domain-error mapping; they do not retest service algorithms.
- Component tests cover the shared editor's inline points behavior, runtime-mode answer emission/restoration, no feedback leakage, preview non-persistence, mixed organizer rows, and dashboard cards.
- Add end-to-end coverage after the APIs stabilize for one score-only normal test, one required-pass failure/pass/retake, refresh/resume, and one mock assignment/card flow.
- Run focused Jest tests while implementing each layer, then `npm test`, `npm run lint`, and `npm run build` before cleanup. Security rules and index changes are reviewed and deployed with the phase that first writes protected data.

## Implementation plan

### Phase 1: Domain compatibility

- Add `appApi`, convert the touched `lessonApi`, `testApi`, and `practiceCategoryApi` modules to `injectEndpoints`, register the shared reducer/middleware once, and move cross-domain tag constants to `src/store/api/tags.ts`.
- Add `LearningUnitBase`, `LessonUnit`, `TestUnit`, `LearningUnit`, `TestVersionReference`, `TestVersion`, and `MockTest` types.
- Preserve all existing lesson types, including `vocab`.
- Add optional `maxPoints` to the shared `BaseExercise` type without changing lesson validation or behavior.
- Add exclusive-assignment, container-level `passingPercentage`, nullable `mockTestId`, mock parent, and active/archived lifecycle validation.
- Add normalizers that interpret missing `kind` as `lesson`.
- Preserve a temporary `Lesson` alias to avoid a flag-day caller migration.
- Define a kind-aware progress union around the existing schema-v2 lesson progress and the page-less `TestUnitCompletionProgress` shape. Keep `lessonId` as the shared-document ID compatibility field.
- Establish Zod schemas for learning units, separately stored versions, version references, and mock tests, with scoped reuse of existing exercise validators.
- Enforce bidirectional consistency between an active parent-linked `MockTest` and the matching `TestVersionReference.mockTestId`.
- Reuse the existing lesson stable-ID validator and schema-v1 normalization path, and enforce non-empty, version-wide unique persisted item IDs plus contextual test scoring rules for test versions.
- Consolidate server-safe content metadata and the exercise/test-eligibility registry used by authoring, counting, rendering, and validation. Preserve client-only icon and component registries separately.
- Add the new collection constants to `shared/constants/firestore.ts`.
- Add unit tests for legacy lesson normalization, vocabulary compatibility, stable-ID rules, scoring rules, and all new domain schemas.

### Phase 2: Shared test-version editor and player

- Introduce the typed `PageDocumentDraft` adapter and extend `lessonEditorSlice` to support lesson and test-version drafts without changing the leaf content-editor action contract. Namespace persisted session drafts by editor kind.
- Make the test builder edit page-based `TestVersion` documents rather than a synthetic flat test.
- Support multiple pages, ordinary content, exercises, points, and derived total points.
- Match the lesson creator's page/content workflow and split-screen interactive preview, while adding test breadcrumbs, point controls, total points, and container passing settings.
- Remove the POC wrapper/local points map. Set and edit `maxPoints` directly on exercise items through existing editor actions; initialize new test exercises to `1` point.
- Reuse the shared renderer's existing persisted `item.id` completion contract. Extend the test-player event payload with positional context only where display or diagnostics require it; identity remains the persisted ID.
- Reuse the existing server-side schema-v1 positional-ID normalizer during compatibility rollout. Both lesson and test runtime state key exercises by persisted item ID.
- Replace the boolean `testMode` API with runtime mode `practice | test | preview`, retaining only a temporary compatibility adapter while components migrate.
- In test mode, exercise components collect and report canonical raw answers instead of grading locally, and generated exercises render from injected pre-resolved items instead of self-fetching.
- Restrict the test builder's content palette to allowlisted exercise types plus unscored content.
- Reuse the lesson editor's draft and recovery conventions for `TestVersion` editing rather than inventing a separate safety mechanism.
- Delete the POC `TestDefinition -> Lesson` conversion once the typed shared page-document adapter owns both lesson and version authoring.

### Phase 3: Learning-unit API

- Add the learning-unit/test domain, schema, service, and error modules, then thin Next.js learning-unit and test-version API routes.
- Optionally backfill existing lessons with `kind: 'lesson'`; the normalizer covers unbackfilled documents either way.
- Update the admin lesson list APIs and `LessonManager` to select and filter on `kind` so `TestUnit` documents in the shared `lessons` collection never appear in Lesson Management. Any Firestore `.select(...)` projection used before normalization must include `kind`.
- Preserve practice-category administration by returning only lesson summaries to its APIs; never migrate `PracticeCategoryMembership.lessonId` to a generic learning-unit reference or make tests category-eligible.
- Save newly created containers and their first valid version atomically.
- Recompute and persist the four `TestVersion` summary fields on every write; list endpoints project summaries rather than page bodies.
- Lock down `testVersions`, `testAttempts`, `testAttemptSessions`, `mockTests`, `userProgress`, and `userProgressMigrationV2Backups` in Firestore security rules, and add the composite indexes required by the new collections (see Storage direction).
- Retain compatibility routes and redirects during rollout.

### Phase 4: Attempts and retakes

- Persist attempts separately from lesson progress before tests enter the normal flow.
- Extract one pure grader and canonical answer schema per allowlisted exercise type, then use it from both practice UI and server submission.
- Extract the existing vocabulary query/generator logic into reusable server helpers, resolve generated exercises at attempt start, and freeze the resolved items into `deliveryState`.
- Return only sanitized attempt content to the client; grading inputs never leave the server.
- Enforce one in-progress attempt per student and origin through the deterministic `testAttemptSessions` pointer; attempt start resumes an existing attempt, and duplicate submissions return the stored result idempotently.
- Select normal-test versions server-side using the least-used randomized cycle, and always use a mock card's single referenced version.
- Freeze the origin container's `passingPercentage` at attempt start.
- Temporarily retain answers and resolved delivery state, including grading inputs and `maxPoints`, so an in-progress attempt resumes consistently; guard against the Firestore document size limit at attempt start.
- Grade against the attempt's delivery state rather than the current editable test version.
- Freeze score statistics, passing outcome, and exercise-level results on submission, then remove exact questions, answers, and temporary delivery state.
- Retain submitted statistics for student history and retake decisions.
- Add the attempt start/resume, committed-answer save, submit, and summary endpoints to the existing injected `testApi`; do not use raw `fetch` in the player.
- Grant sticky normal-flow completion after a passing or score-only submission by writing the canonical page-less `TestUnitCompletionProgress` record in the same transaction; never revoke it because of a later lower retake.
- Query best percentage and latest attempt separately for dashboard presentation.
- Calculate with full precision and apply rounding only when displaying points and percentages.
- Add tests proving both runtimes call the shared graders, component-level partial credit in both generated-exercise modes, normalization to different `maxPoints` values, threshold equality, score-only completion, failed gating, permanent completion after a pass, duplicate start/submit idempotency, and best/latest summary selection.
- Verify that in-progress normal and mock attempts remain resumable when later assignment changes make their selected version ineligible for new attempts.

### Phase 5: Normal-flow integration

- Include normal tests in the same `isLive` and `liveOrder` sequence as normal lessons.
- Make every consumer of the `lessons` collection kind-aware before any test is published; the dashboard lock chain uses page math for lessons and the materialized completion record for tests.
- Make progression monotonic across path edits: derive each student's reached frontier from existing progress and attempts so a newly inserted required-pass test cannot re-lock students who already progressed beyond its insertion point.
- Extend the current live-lesson screen into a shared Learning Path organizer for normal lessons and normal tests. Read server state from RTK Query and retire the organizer's duplicated `lessonSlice` mirror.
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
- Remove `TestDefinition`, the old POC handlers behind `/api/admin/tests`, the POC-only `/admin/tests/try/*` page, `TestBuilder`/`TestRunner`, and test-specific adapter state. Keep the `/api/admin/tests` path and applicable admin page paths with their new container/version semantics.
- Remove temporary aliases and compatibility adapters after all callers use the new model.

## Acceptance criteria

- Existing lessons load and behave the same before and after backfill.
- Legacy documents without `kind` continue to load during rollout.
- Normal, vocabulary, sentence-diagramming, and listening lessons retain their specialized behavior.
- Existing lesson exercises without `maxPoints` remain valid and behave exactly as before.
- `lessonApi`, `testApi`, and `practiceCategoryApi` inject endpoints into one authenticated `appApi`; the store registers its reducer and middleware once, and no new assessment `createApi` slice is introduced.
- RTK Query is the only authoritative client cache for learning units, versions, mocks, and attempts; no ordinary Redux slice mirrors those fetched entities.
- New route handlers contain auth, parsing, service invocation, and response mapping only; Firestore invariants, scoring, selection, and sanitization are covered in shared domain/services.
- Test Management remains a separate top-level admin section from Lesson Management.
- Opening a normal test shows every version, its scoring, and whether it is in normal rotation or linked to a mock card.
- The test-version editor retains the lesson creator's page/content workflow and interactive preview while adding exercise points and container passing settings.
- Normal lessons and normal tests can be ordered together through `liveOrder`.
- The Learning Path organizer provides an insertion button before, between, and after units; selecting a test inserts it at that exact position.
- Admin rows and student cards distinguish tests from lessons using visible labels and icons as well as color.
- Mock tests appear only in the Mock Tests category and use `mockOrder`.
- The Mock Tests section appears immediately below the normal learning path and before existing practice categories.
- A test version can contain multiple pages, non-scored content, and scored exercises.
- Every test-version write recomputes its persisted page/item/exercise/point summary fields on the server, and list APIs do not download page bodies.
- Every persisted test version belongs to at most one active delivery context; attaching it elsewhere requires an explicit move or copy operation.
- Every persisted test-version item has a non-empty ID that is unique across the entire version.
- Reordering an item preserves its ID, while copying an item or page creates new IDs.
- Test answers and results use persisted item IDs; existing lesson progress also uses persisted IDs while the server continues to normalize legacy positional records during migration.
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
- Direct client reads and writes of `testVersions`, `testAttempts`, `testAttemptSessions`, `mockTests`, `userProgress`, and `userProgressMigrationV2Backups` are denied by security rules.
- Final scoring uses the attempt's temporary grading inputs and `maxPoints`, not the current editable version.
- Server submission and practice-mode scoring call the same pure grader for every allowlisted exercise type; there is no duplicate score formula.
- Submitting an attempt removes its exact questions, answers, and temporary delivery state.
- Editing a test version does not change the frozen score statistics of previously submitted attempts.
- Attempt start freezes the applicable passing percentage, and submission freezes the resulting score-only/passed/not-passed outcome.
- A score-only normal test completes on submission, while a required-pass test gates the next unit until passed.
- A completed normal test materializes a schema-v2 `userProgress` record with its `TestUnit.id` in the compatibility `lessonId` field, `status: 'completed'`, and no lesson page cursors.
- Test units never appear in Lesson Management, and lesson page math is never applied to a test unit.
- Every lesson-summary projection used to separate `LessonUnit` and `TestUnit` documents selects `kind` before applying legacy normalization.
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
- Grading helpers must remain environment-agnostic and shared by server submission and practice UI. Pulling client components into server code or keeping a second formula would reintroduce drift and bundle-boundary failures.
- The current multi-API RTK setup incurs separate middleware and blocks cross-domain automatic invalidation. The touched lesson/test/category APIs must converge on `appApi`; adding another API slice would worsen the problem.
- Editor reuse must not turn the lesson-shaped POC adapter into a second persistence model. The shared authoring draft maps explicitly to a `Lesson` or `TestVersion`, and only the domain document is written.
- Security rules for the new test collections and `userProgress` must ship before any attempt data exists; server-authoritative grading is meaningless while clients can write attempts or gate-controlling completion directly. `userProgressMigrationV2Backups` must be protected immediately because it already contains server-generated copies of progress records.
- No test may be published until every consumer of the `lessons` collection discriminates on `kind`; otherwise live test units render as broken zero-page lessons.
- A flag-day `Lesson` to `LearningUnit` rename creates unnecessary regression risk; migrate callers incrementally.
- Moving the existing lesson collection immediately would complicate rollback and existing references.

## Open decisions

1. Submitted attempts retain per-exercise statistics, but no teacher-facing view of student results is planned in this refactor. Confirm it is deliberately out of scope or schedule it as a later phase.

## Decision log

The current schema, invariants, workflows, and implementation phases are authoritative. This register records the rationale for settled choices; if it conflicts with the current document body, the body wins.

| Date       | Settled decision                                                                                                                                                                     | Why it matters                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-13 | Use `LearningUnit = LessonUnit \| TestUnit`, distinguish with `kind`, and preserve every lesson `type`.                                                                              | Lessons and normal tests share one flow without breaking vocab, diagramming, or listening behavior.                                                                                           |
| 2026-07-13 | Keep learning units in the existing Firestore `lessons` collection during migration.                                                                                                 | Incremental normalization and compatibility adapters are safer than a collection flag day.                                                                                                    |
| 2026-07-13 | Store each `TestVersion` as a separate first-class document without immutable revision history.                                                                                      | Large page content remains independently editable; alternative versions matter now, edit history does not.                                                                                    |
| 2026-07-14 | Use Next.js server routes plus scoped Zod validation for all new domain mutations.                                                                                                   | Next.js API routes are the primary server boundary; the `gradeTranslationFn` Firebase Function stays a practice-only exception.                                                               |
| 2026-07-14 | Store positive `maxPoints` directly on every test exercise and infer exercises from the type registry.                                                                               | Scoring stays synchronized while existing lesson exercises remain valid without points.                                                                                                       |
| 2026-07-14 | Use stable persisted content-item IDs and calculate item- and component-level fractional scores at full precision.                                                                   | Reordering cannot re-key answers, and generated-form fields such as `1,s,m` can earn independent credit normalized to the exercise points.                                                    |
| 2026-07-14 | Store container-level percentage thresholds; `null` means score-only, and version totals may differ.                                                                                 | Passing is delivery policy, while percentages normalize alternatives with different point totals.                                                                                             |
| 2026-07-14 | Persist attempts before flow integration, freeze delivery and passing state at start, then retain only submitted statistics.                                                         | Refreshes remain stable without permanently retaining questions or answers.                                                                                                                   |
| 2026-07-13 | Select normal versions server-side through a least-used random cycle and scope histories by origin.                                                                                  | Students cycle through eligible alternatives while normal and mock attempts remain independent.                                                                                               |
| 2026-07-14 | Apply assignment/configuration changes only to future attempts and make earned normal completion sticky.                                                                             | Existing attempts remain valid, and a later lower retake cannot relock the learning path.                                                                                                     |
| 2026-07-14 | Do not let a newly inserted required-pass test re-lock students who already progressed beyond its insertion point.                                                                   | Learning-path edits must not revoke access a student has already reached; the new gate applies only before the student's recorded frontier.                                                   |
| 2026-07-14 | Make normal rotation and mock delivery mutually exclusive through nullable `mockTestId`.                                                                                             | A mock-only version remains under its parent test but can never be selected in normal rotation.                                                                                               |
| 2026-07-14 | Keep one separate `MockTest` document per mock version with its own ID, order, passing rule, and visibility.                                                                         | Dashboard queries, attempt origins, standalone mocks, and two-version/two-card behavior use one shape.                                                                                        |
| 2026-07-14 | Maintain a bidirectional parent/mock link, archive instead of delete, and separate lifecycle from visibility.                                                                        | Parent overviews stay complete, IDs and history survive reassignment, and hidden mocks stay mock-only.                                                                                        |
| 2026-07-14 | Require explicit duplication when equivalent content must exist in both normal and mock delivery.                                                                                    | Versions are never silently shared across simultaneous delivery contexts.                                                                                                                     |
| 2026-07-13 | Do not introduce a generic `placementId`.                                                                                                                                            | `testId`, `mockTestId`, explicit origins, `liveOrder`, and `mockOrder` cover current delivery needs.                                                                                          |
| 2026-07-14 | Keep Test Management separate and make the version editor match the lesson creator with points, passing controls, and preview.                                                       | Teachers get a familiar authoring experience without a second content-editor system.                                                                                                          |
| 2026-07-14 | Extend the existing live-order screen into the mixed Learning Path organizer with plus-button insertion and explicit placement.                                                      | Teachers can distinguish, insert, and reorder tests among lessons without accidental publishing.                                                                                              |
| 2026-07-14 | Give lesson, test, and mock cards distinct accessible treatments; place Mock Tests below the learning path and hide it when empty.                                                   | Students can identify assessment types immediately without an empty or color-only interface.                                                                                                  |
| 2026-07-14 | Hide normal-flow version labels, while keeping mock titles teacher-controlled.                                                                                                       | Students should not compare hidden alternatives as easy/hard, but separate mock cards need names.                                                                                             |
| 2026-07-14 | Show best score primarily, latest score and trend secondarily, and retained exercise statistics on results.                                                                          | Students can judge progress and retake value without reopening historical questions.                                                                                                          |
| 2026-07-14 | Required-pass failures show threshold distance, a retake path, and a related live-mock nudge when available.                                                                         | Failure feedback remains actionable without leaking answers or consuming rotation versions.                                                                                                   |
| 2026-07-15 | Reuse schema-v2 lesson progress and stable content IDs; materialize page-less test completion in `userProgress` using `lessonId` as the shared learning-unit ID compatibility field. | The progress refactor has already removed positional runtime identity and page-index-derived completion, so tests can join the lock chain without fake page state or a second progress model. |
| 2026-07-15 | Consolidate the touched lesson, test, and practice-category RTK endpoints onto one injected authenticated `appApi`.                                                                  | One reducer/middleware and shared tags avoid new cache islands while keeping the unrelated vocabulary migration out of this feature.                                                          |
| 2026-07-15 | Use a typed shared page-document draft over `lessonEditorSlice` and persist inline exercise `maxPoints`.                                                                             | The existing page, drag/drop, clipboard, tooltip, and content-editor stack stays singular without preserving the POC's redundant test shape.                                                  |
| 2026-07-15 | Extract one environment-agnostic grader per exercise and call it from practice UI and server submission.                                                                             | Server authority no longer requires a second scoring implementation that can drift from the student exercise behavior.                                                                        |
| 2026-07-15 | Use a deterministic `testAttemptSessions` pointer for one active attempt per student/origin.                                                                                         | Concurrent starts converge transactionally without relying on an empty query race, while submitted attempts retain independent history IDs.                                                   |
