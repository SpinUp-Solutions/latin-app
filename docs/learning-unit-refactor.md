# Learning Unit and Test Schema Refactor

Status: Working draft  
Last updated: 2026-07-14

## Purpose

Integrate tests into the existing lesson flow while preserving the lesson creator experience, supporting alternative test versions, and adding a separate Mock Tests dashboard category.

This document is the shared planning space for the refactor. Settled choices are recorded in the decision log. Questions that still need a product decision remain under **Open decisions**.

## Current state

- Lesson documents are stored in the Firestore `lessons` collection and use the `Lesson` schema.
- Lesson behavior is specialized with `type: normal | sentence-diagramming | listening`.
- Lessons contain ordered pages with both instructional content and exercises.
- The test POC stores a separate, flat `TestDefinition` in the `tests` collection.
- A POC test contains an ordered list of scored exercises and unscored content rather than normal lesson pages.
- The POC test builder creates a synthetic lesson page in Redux to reuse the existing content editors. The synthetic lesson is not persisted as a lesson.
- Test attempts and preview scores are held in browser memory and are not persisted.

The POC proves the authoring and scoring behavior. The refactor should now make tests part of the wider learning flow without creating parallel content, rendering, or editor systems.

## Architectural thought process

### Lessons and tests need a shared flow identity

Lessons and normal tests both appear in the student lesson flow. They should therefore share a top-level `LearningUnit` union and the existing `isLive` and `liveOrder` behavior.

Use `kind` to distinguish instructional units from assessed units. Preserve the current lesson `type` field because it describes specialized lesson/player behavior, which is a different concern.

### A normal test is not the same thing as its version

A normal test is the student-facing test at a particular point in the lesson flow, for example “Chapter 4 Test.” Version A and Version B are alternative sets of pages and exercises that may be selected when the student starts or retakes that test.

The normal test is therefore a container that references reusable test versions. It does not directly contain pages.

### Test versions need to be reusable

A teacher can:

- assign one or more versions from a normal test to the Mock Tests category;
- create a standalone mock test with versions that are not currently used by a normal test;
- later add a standalone mock version to an existing normal test;
- create a new normal test from one or more mock versions.

For those workflows, a test version cannot be exclusively owned by a normal test or a mock test. It must be a first-class reusable content document that either container can reference.

### Mock tests are separate dashboard entities

Mock tests can only be encountered in the Mock Tests dashboard category. A mock test has its own `mockTestId`, visibility, and ordering. It does not share the identity of a normal test, even when both reference the same underlying test version.

This makes a generic `placementId` unnecessary for the current requirements:

- normal tests use their `testId` and participate in `liveOrder`;
- mock tests use their `mockTestId` and participate in `mockOrder`;
- attempts record whether they originated from a normal test or a mock test.

### Versions and edit history are intentionally simple

The model includes alternative test versions such as A, B, and C. It does not include immutable revision history. Editing a test version updates that version directly.

Submitted attempts preserve frozen score statistics and optional exercise-level results. They do not retain exact questions or student answers, and their statistics are never recalculated from the current editable test version. This intentionally means submitted attempts cannot later be reviewed question-by-question or regraded after a version changes.

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
  type: 'normal' | 'sentence-diagramming' | 'listening';

  pages: Page[];
  vocabulary_pool?: string | null;
}
```

### Test-version references

Both normal tests and mock tests use ordered references to reusable versions. The reference label is contextual, so the same underlying version could be called “Version A” in a normal test and “Practice Set 1” in a mock test.

```ts
interface TestVersionReference {
  versionId: string;
  label: string;
}
```

### Normal test units

A normal test participates in the lesson flow but delegates its page content and scoring to its referenced versions.

```ts
interface TestUnit extends LearningUnitBase {
  kind: 'test';
  type: 'normal';

  versions: TestVersionReference[];
}

type LearningUnit = LessonUnit | TestUnit;
```

### Reusable test versions

```ts
interface TestVersion {
  id: string;
  name: string;

  pages: Page[];

  feedbackMode: 'immediate' | 'on-completion';

  status: 'draft' | 'published' | 'archived';

  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}
```

### Mock tests

Mock tests are separate from `LearningUnit` because they do not participate in the normal lesson flow.

```ts
interface MockTest {
  id: string;
  title: string;
  description: string;

  versions: TestVersionReference[];

  isLive: boolean;
  mockOrder: number | null;

  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}
```

## Schema relationships

```text
LessonUnit ──────────────────────────────> Page[]

TestUnit ───────┐
                ├──> TestVersion ───────> Page[] with scored exercises
MockTest ───────┘
```

The containers have different IDs and delivery locations. Sharing occurs only through an explicit test-version reference.

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
- Multi-step generated exercises award the appropriate fraction of the exercise's allocated points.
- Single-step partial acceptance remains exercise-specific grading behavior and does not change the container schema.

The shared exercise shape therefore adds only an optional field:

```ts
interface BaseExercise extends ContentItem {
  // Existing exercise fields remain unchanged.
  maxPoints?: number;
}
```

Validation is contextual: lesson validation ignores an absent `maxPoints`, while test-version validation requires it on every exercise. Existing lesson documents require no point-related migration.

## Test-version builder behavior

The test-version builder should feel like the normal lesson creator and reuse the same page and content editors.

- Teachers can add, edit, remove, copy, and reorder the same content items used in lessons.
- Adding ordinary content creates no scoring metadata.
- Adding an exercise sets `maxPoints: 1` automatically.
- Exercise cards display a points control; ordinary content cards do not.
- Removing an exercise removes its point allocation naturally because the value lives on the removed item.
- Copying an exercise creates a new item ID and carries the source `maxPoints` value with the copied item.
- Moving an item within or between pages naturally preserves its `maxPoints` value.
- If changing an item's type crosses the exercise/non-exercise boundary, the builder adds the default `maxPoints` value or removes the field automatically.
- Loading an existing version reports any exercise with a missing or invalid `maxPoints` value rather than silently assigning a score.
- Preview uses the normal page renderer in test-preview mode and writes no lesson progress or test attempts.

The existing exercise-type registry remains the source of truth. Scoring must not be inferred from whether `maxPoints` exists because that would hide invalid unscored exercises. The normal lesson builder does not display point controls, and lesson rendering ignores `maxPoints` if an exercise copied from a test happens to retain it.

## Teacher workflows

### Create a normal test

1. Create a `TestUnit` in the Tests admin section.
2. Create its first `TestVersion` using the lesson-like page builder.
3. Add more versions as needed.
4. Add the test to the shared lesson flow and choose its `liveOrder`.
5. When live, students receive one of its referenced published versions.

### Create a standalone mock test

1. Create one or more `TestVersion` documents from the Mock Tests section.
2. Create a `MockTest` referencing those versions.
3. The mock appears only in the Mock Tests dashboard category.
4. No `TestUnit` or normal-flow entry is required.

### Assign normal-test versions as a mock

1. Select one or more versions from a normal test.
2. Create a new `MockTest` or add them to an existing mock test.
3. The normal test and mock test keep separate IDs, visibility, and ordering.
4. Both containers reference the selected version documents.

### Use a mock version in the normal flow

The teacher can choose **Use in normal test** and then:

- add the version to an existing `TestUnit`;
- create a new `TestUnit` around the selected version or versions; or
- duplicate the version first when an independently editable copy is desired.

Removing a version from a normal test or mock test only removes that reference. It must not delete the reusable version while another container still references it.

Because there is no revision history, editing a shared version changes it everywhere it is referenced. The admin UI should show where a version is used and offer **Duplicate before editing** when independent evolution is desired.

## Normal-flow and Mock Tests UX

### Normal flow

- Lessons and normal tests share `isLive` and `liveOrder`.
- A shared organizer displays them together in their student-facing order.
- Each item is clearly labeled as a lesson or test.
- Teachers can add, remove, and reorder tests among lessons without deleting their content.
- The initial implementation may use move up/down controls; drag-and-drop can be added later without changing the schema.

### Mock Tests category

- The student dashboard has a separate Mock Tests category.
- Only live `MockTest` documents appear there.
- `mockOrder` controls ordering within that category.
- Mock tests never appear in the normal lesson flow.

## Random version selection and retakes

Version selection happens in a Next.js server route when an attempt starts, never solely in the browser.

For the relevant normal test or mock test:

1. Load its referenced published versions.
2. Load the student's prior attempts for that specific origin.
3. Find the least-used eligible versions.
4. Select randomly among those versions.
5. Prefer not to select the immediately previous version when another equally eligible option exists.
6. Create the in-progress attempt with the selected `versionId` and any temporary delivery state before returning content to the client.

Selecting among the least-used versions creates the required shuffle-cycle behavior without a separate placement or rotation document. Every version is used before versions with higher usage counts are selected again. Normal-test and mock-test histories remain separate, even when they reference the same version.

## Future test attempts

Attempt persistence is not required for the schema-refactor phase, but the intended lifecycle is:

```ts
interface TestAttemptBase {
  id: string;
  studentId: string;
  versionId: string;

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
  deliveryState?: Record<string, unknown>;
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
  submittedAt: string;
}

type TestAttempt = InProgressTestAttempt | SubmittedTestAttempt;
```

On submission, the server calculates and freezes `exerciseResults`, `score`, `maxScore`, and `percentage`, then removes `answers` and `deliveryState`. The student can use the retained statistics to review performance and decide whether to retake the test, but cannot reopen the historical questions or answers. Editing a test version later never changes a submitted attempt's stored statistics.

There is no `placementId` or revision number. The attempt's origin distinguishes normal-flow and mock usage. Preview attempts remain ephemeral and must never persist progress or attempt records.

## Storage and Next.js API direction

Keep the existing Firestore `lessons` collection for learning units during the initial refactor. This avoids a risky collection rename while application code adopts learning-unit terminology.

```text
lessons/{learningUnitId}       LessonUnit or TestUnit during migration
testVersions/{versionId}      Reusable version pages and scoring
mockTests/{mockTestId}         Mock Tests category containers
testAttempts/{attemptId}       Future phase
```

All server behavior uses Next.js API routes and shared server modules. The preferred API surface is:

```text
/api/admin/learning-units
/api/admin/test-versions
/api/admin/mock-tests
/api/test-attempts             Future phase
```

Existing lesson endpoints may remain as compatibility adapters until callers migrate. Admin routes must use the existing admin authorization rules. Validation and derived-score calculation should live in shared server modules so all routes apply identical rules.

## Compatibility and migration

- Existing lesson documents without `kind` are read as `kind: 'lesson'`.
- New and updated learning-unit documents persist an explicit `kind`.
- Existing lesson pages, `type`, progress behavior, URLs, `isLive`, and `liveOrder` remain unchanged.
- Existing lesson exercises do not need `maxPoints`; the field is optional in the shared exercise type and required only during test-version validation.
- Normal tests use the same `isLive` and `liveOrder` fields and can therefore be sorted together with lessons.
- Each current POC `TestDefinition` becomes one `TestUnit` plus one initial `TestVersion`.
- The initial version preserves all POC content and exercise order, moving each POC `maxPoints` value onto its corresponding exercise item.
- The current `tests` collection remains temporary and is retained until converted documents are verified.
- Migration tooling must be idempotent, support dry-run mode, and report validation errors before writing.

## Implementation plan

### Phase 1: Domain compatibility

- Add `LearningUnitBase`, `LessonUnit`, `TestUnit`, `LearningUnit`, `TestVersionReference`, `TestVersion`, and `MockTest` types.
- Add optional `maxPoints` to the shared `BaseExercise` type without changing lesson validation or behavior.
- Add normalizers that interpret missing `kind` as `lesson`.
- Preserve a temporary `Lesson` alias to avoid a flag-day caller migration.
- Add validators for both learning-unit variants, reusable versions, version references, and mock tests.
- Add unit tests for legacy lesson normalization and all new schemas.

### Phase 2: Shared test-version editor and player

- Generalize reusable lesson editor state where necessary without duplicating content-editor behavior.
- Make the test builder edit page-based `TestVersion` documents rather than a synthetic flat test.
- Support multiple pages, ordinary content, exercises, points, total points, and feedback mode.
- Set and edit `maxPoints` directly on exercise items; initialize new test exercises to `1` point.
- Use runtime mode `practice | test | preview` in the shared renderer.
- Remove the synthetic lesson adapter after the shared version editor is stable.

### Phase 3: Learning-unit API and POC migration

- Add Next.js learning-unit and test-version API routes.
- Backfill existing lessons with `kind: 'lesson'`.
- Convert every POC test into one `TestUnit` and one `TestVersion`.
- Produce dry-run counts and validation errors before writes.
- Verify converted IDs, references, exercise counts, content counts, and total points.
- Retain compatibility routes and redirects during rollout.

### Phase 4: Normal-flow integration

- Include normal tests in the same `isLive` and `liveOrder` sequence as lessons.
- Add a shared flow organizer for lessons and normal tests.
- Route lessons to practice behavior and tests to randomized version selection and assessment behavior.
- Ensure preview never writes lesson progress or attempts.

### Phase 5: Mock Tests

- Add Mock Tests admin management and the student dashboard category.
- Support manual standalone mock creation.
- Support assigning selected normal-test versions to a mock test.
- Support using mock versions in a new or existing normal test.
- Show shared-version usage and provide a duplicate-before-editing workflow.
- Keep `mockOrder` independent from normal `liveOrder`.

### Phase 6: Attempts and retakes

- Persist attempts separately from lesson progress.
- Select versions server-side using the least-used randomized cycle.
- Temporarily retain the answers and resolved delivery state required to resume an in-progress attempt consistently.
- On submission, freeze the attempt's score statistics and optional exercise-level results, then remove its exact questions, answers, and temporary delivery state.
- Retain every submitted attempt's frozen statistics for the student-facing attempt history and retake decision.
- Define progression and score-display policy before enabling scored student attempts.

### Phase 7: Cleanup

- Remove `TestDefinition`, the temporary `tests` API, and test-specific adapter state after migration verification.
- Archive or delete old `tests` documents only after an agreed retention period.
- Remove temporary aliases and compatibility adapters after all callers use the new model.

## Acceptance criteria

- Existing lessons load and behave the same before and after backfill.
- Legacy documents without `kind` continue to load during rollout.
- Normal, sentence-diagramming, and listening lessons retain their specialized behavior.
- Existing lesson exercises without `maxPoints` remain valid and behave exactly as before.
- Lessons and normal tests can be ordered together through `liveOrder`.
- Mock tests appear only in the Mock Tests category and use `mockOrder`.
- A test version can contain multiple pages, non-scored content, and scored exercises.
- Server validation rejects a version with a missing score or a score assigned to non-exercise content.
- Adding an exercise automatically assigns the default point value.
- Adding or editing non-exercise content does not change total points.
- Copying an exercise copies its inline `maxPoints`; deleting it requires no separate scoring cleanup.
- A normal test can reference multiple versions.
- A mock test can reference one or more versions from a normal test.
- A standalone mock version can later be used in a new or existing normal test.
- Random selection uses every eligible version before repeatedly favoring an already-used version.
- Refreshing an in-progress attempt does not change the selected version or resolved generated questions.
- Submitting an attempt removes its exact questions, answers, and temporary delivery state.
- Editing a test version does not change the frozen score statistics of previously submitted attempts.
- Students can view submitted attempt statistics and choose to retake without reopening historical questions or answers.
- Admin preview writes neither lesson progress nor test attempts.
- Migration dry runs are repeatable and do not duplicate or corrupt data.

## Risks and safeguards

- Test-version IDs and content-item IDs must be stable and unique.
- Copying an exercise must create a new item ID and retain its inline `maxPoints` value.
- Hard deletion of a test version must be blocked while a normal test or mock test references it.
- Editing a shared version affects every container that references it; show usage and provide a duplication workflow.
- Submitted attempts cannot be reviewed question-by-question or regraded after their exact questions and answers are removed; this is an intentional product limitation.
- In-progress delivery state must be removed only after the server has calculated and persisted the final score statistics successfully.
- Random selection must happen server-side and persist the chosen version before the client receives it.
- A flag-day `Lesson` to `LearningUnit` rename creates unnecessary regression risk; migrate callers incrementally.
- Moving the existing lesson collection immediately would complicate rollback and existing references.

## Open decisions

1. Must all versions referenced by the same normal test have the same total points, or is percentage normalization sufficient?
2. Should `feedbackMode` be configured per version only, or overridable per exercise?
3. When a shared version is edited, is a warning plus optional duplication sufficient, or should editing always require an explicit choice between shared edit and copy?
4. Should the admin management UI use one combined learning-unit list with filters or retain separate Lessons and Tests sections backed by shared APIs?
5. Should the shared normal-flow organizer be a dedicated screen or extend the existing lesson-management screen?
6. How should a teacher select the initial `liveOrder` when adding a normal test?
7. Should a test created from the flow be inserted automatically as a non-live draft or require an explicit add action after saving?
8. For normal-flow progression, should the first, latest, or best submitted attempt determine the displayed result?
9. How long should converted documents remain in the old `tests` collection before deletion?

## Decision log

| Date       | Decision                                                                 | Reason                                                                                 |
| ---------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 2026-07-13 | Use a shared `LearningUnit` model for lessons and normal tests.          | Allows both to participate in one lesson flow without duplicating lesson behavior.     |
| 2026-07-13 | Introduce `kind` and preserve the existing lesson `type` meaning.        | The fields describe different behavioral dimensions.                                   |
| 2026-07-13 | Keep the Firestore `lessons` collection during the initial refactor.     | Reduces migration and rollback risk.                                                   |
| 2026-07-13 | Require every exercise in a test version to have a positive point value. | Ensures complete and predictable scoring while allowing unscored ordinary content.     |
| 2026-07-13 | Determine scoring automatically from the existing content-type registry. | Keeps test creation aligned with lesson creation and removes manual classification.    |
| 2026-07-13 | Include normal tests in the same `liveOrder` sequence as lessons.        | Tests must integrate into the normal curriculum flow.                                  |
| 2026-07-13 | Keep mock tests in a separate Mock Tests category with `mockOrder`.      | Mock tests are never encountered in the normal lesson flow.                            |
| 2026-07-13 | Give normal tests and mock tests separate container IDs.                 | Each has independent visibility, ordering, and student context.                        |
| 2026-07-13 | Store test versions as reusable first-class documents.                   | Versions can move between or be shared by normal tests and mock tests.                 |
| 2026-07-13 | Do not introduce a generic `placementId`.                                | `testId`, `mockTestId`, and attempt origin cover the current delivery requirements.    |
| 2026-07-13 | Support random version selection using a least-used shuffle cycle.       | Students receive every eligible version before the system loops through them again.    |
| 2026-07-13 | Keep normal-test and mock-test rotation histories separate.              | They are distinct student contexts even when they share underlying versions.           |
| 2026-07-13 | Defer immutable revision history.                                        | Alternative test versions are required now; edit-history revisions are not.            |
| 2026-07-13 | Keep content definitions separate from future attempts.                  | Attempts require selected-version and grading data rather than lesson-progress fields. |
| 2026-07-14 | Store `maxPoints` directly on test exercise items.                       | Removes point-map synchronization while leaving existing lessons unchanged.            |
| 2026-07-14 | Retain only frozen statistics for submitted attempts.                    | Students need performance history and retakes, not access to historical questions.     |
| 2026-07-14 | Keep resumable question state only while an attempt is in progress.      | Preserves refresh consistency without permanently storing questions or answers.        |
