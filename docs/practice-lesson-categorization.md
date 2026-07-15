# Practice Lesson Categorization Plan

Status: Implemented  
Last updated: 2026-07-14

## Purpose

Add an admin-defined tagging system for non-normal lessons before implementing the wider learning-unit and test refactor.

The eligible lesson types are:

- `vocab`
- `sentence-diagramming`
- `listening`

Normal lessons, normal tests, and mock tests are not eligible. Student-facing category navigation is deliberately outside this specification and will be designed separately.

## Settled product decisions

- Categories are created and managed by admins.
- Categories are type-specific. A vocabulary category cannot contain listening or sentence-diagramming lessons.
- A lesson may belong to zero, one, or many categories.
- A category is optional; publishing a non-normal lesson does not require one.
- Admins explicitly order categories within each lesson type.
- Admins explicitly order lessons independently inside each category.
- The category model is a generic tagging system. An admin may use it for authors, topics, difficulty groups, collections, or another organizational scheme without changing the schema.
- Student presentation and navigation are deferred. This phase stores and manages the taxonomy without changing the current Practice section.

## Current state

- Lesson documents live in the Firestore `lessons` collection.
- `Lesson.type` is `vocab | normal | sentence-diagramming | listening`.
- The dashboard fetches all live lessons, separates them by `type`, and displays vocabulary, diagramming, and listening as three flat grids inside the Practice section.
- Lesson Management and Manage Live Lessons also separate lessons only by `type`.
- `liveOrder` currently controls published ordering. It has no category meaning and must not be reused for category ordering.
- `vocabulary_pool` identifies a content source for a lesson. It is not a category and remains independent of this feature.
- There is no existing category, tag, taxonomy, or category-membership model to extend.

## Recommended architecture

Use separate category and membership documents instead of embedding category IDs or ordered category references in lesson documents.

This is the best fit because:

- one lesson can belong to several categories;
- the same lesson can have a different position in every category;
- category operations do not rewrite large lesson documents containing pages;
- deterministic membership identity prevents duplicate assignments;
- the later `LearningUnit = LessonUnit | TestUnit` refactor does not need to migrate category fields out of a shared base type;
- eligibility remains explicitly limited to lesson units with non-normal lesson types.

Do not duplicate `categoryIds` onto the lesson document during this phase. That would create two sources of truth without a demonstrated query need. API responses can join the small category and membership records where the admin UI needs them.

## Proposed schema

```ts
type PracticeLessonType = 'vocab' | 'sentence-diagramming' | 'listening';

interface PracticeCategory {
  id: string;
  lessonType: PracticeLessonType;

  name: string;
  normalizedName: string;
  description?: string;

  status: 'active' | 'archived';
  categoryOrder: number;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

interface PracticeCategoryMembership {
  id: string;
  categoryId: string;
  lessonId: string;

  lessonOrder: number;

  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
```

Firestore layout:

```text
practiceCategories/{categoryId}
practiceCategoryMemberships/{membershipId}
```

`membershipId` is a deterministic encoding of `(categoryId, lessonId)`. Retrying an assignment therefore updates or returns the same membership instead of creating a duplicate.

## Domain invariants

### Category rules

- `lessonType` must be one of the three eligible non-normal lesson types.
- A category belongs to exactly one lesson type and cannot change type after creation.
- `name` is required after trimming.
- `normalizedName` is derived server-side from the trimmed name for case-insensitive uniqueness checks; clients cannot supply it as authoritative data.
- Category names are unique case-insensitively across both active and archived categories within one lesson type. The same name may exist under a different lesson type.
- Archiving does not release a category name. An admin restores the original category instead of creating a second category with the same identity and a separate membership history.
- Renaming a category preserves its ID, memberships, and ordering.
- Archiving is the normal removal action. It preserves memberships and allows the category to be restored without rebuilding its lesson list.
- An archived category cannot receive new assignments or appear in the active ordering UI.
- Hard deletion is allowed only when a category has no memberships. It is cleanup, not the normal admin workflow.

### Membership rules

- A lesson may have no memberships.
- A lesson may have several memberships, but at most one membership in the same category.
- The referenced category and lesson must both exist.
- The referenced lesson must be a lesson, not a test, and its `type` must equal the category's `lessonType`.
- `type: 'normal'` lessons are never eligible.
- Draft and live lessons may both be categorized. Publishing remains independent from tagging.
- Removing a membership removes only that tag; it never deletes or unpublishes the lesson.
- Archiving a category does not alter its lessons or their publication state.
- Hard-deleting a lesson cascades to all of that lesson's category memberships in the same server-side delete operation. The categories and their other memberships remain unchanged.

### Ordering rules

- `categoryOrder` is scoped to active categories of one `lessonType`.
- `lessonOrder` is scoped to one category.
- A lesson assigned to several categories has one independent `lessonOrder` in each category.
- New categories and memberships append to the end of their respective scope.
- Reorder operations write dense zero-based order values in a Firestore batch or transaction.
- Reads sort by order and use a stable ID tie-breaker so temporarily duplicated or missing order values remain deterministic.
- Existing `liveOrder` remains untouched. Category ordering is an additional organizational order, not a replacement for publishing order.
- Uncategorized lessons have no membership record and require no synthetic **Uncategorized** category document.

## Compatibility with the test refactor

This feature is intentionally implemented first, but its server checks must already understand the future learning-unit boundary.

- Treat a current lesson document with no `kind` as `kind: 'lesson'`.
- When `kind` becomes persisted later, category mutations require `kind === 'lesson'`.
- Never infer eligibility from `type` alone. The future `TestUnit` also has `type: 'normal'`, so the check is conceptually `kind === 'lesson' && isPracticeLessonType(type)`.
- Keep `PracticeCategoryMembership.lessonId` explicit rather than introducing a generic `learningUnitId`; tests are intentionally ineligible.
- Do not add category fields to `LearningUnitBase`, `TestUnit`, `TestVersion`, or `MockTest` during the later refactor.
- The category and membership collections remain valid when lesson consumers adopt the `LessonUnit | TestUnit` union because lesson document IDs do not change.
- The test refactor's kind-aware lesson queries must preserve the admin category pages' ability to load only lesson summaries.

No migration is required for existing lessons. They simply begin with zero memberships.

## Next.js API direction

Use Next.js API routes, the Firebase Admin SDK, shared Zod schemas, and existing admin authorization. No Firebase Function is needed.

Suggested surface:

```text
POST   /api/admin/lessons
PUT    /api/admin/lessons
DELETE /api/admin/lessons/{lessonId}

GET    /api/admin/practice-categories
POST   /api/admin/practice-categories
PATCH  /api/admin/practice-categories/{categoryId}
POST   /api/admin/practice-categories/reorder

GET    /api/admin/practice-categories/{categoryId}/lessons
POST   /api/admin/practice-categories/{categoryId}/lessons
DELETE /api/admin/practice-categories/{categoryId}/lessons/{lessonId}
POST   /api/admin/practice-categories/{categoryId}/lessons/reorder

GET    /api/admin/lessons/{lessonId}/practice-categories
PUT    /api/admin/lessons/{lessonId}/practice-categories
```

The existing lesson create and update routes accept lesson content plus the complete desired category-ID set and commit both atomically. The lesson-specific practice-categories `PUT` performs tag-only reconciliation for management tools that are not editing lesson content. The existing lesson `DELETE` cascades membership cleanup. The category-centric routes support the category management screen. Every path uses the same domain service so type validation, ordering, archival, cleanup, and idempotency cannot drift.

Mutation behavior:

- Create, rename, archive, restore, assign, unassign, and reorder operations validate on the server.
- Lesson create and update requests carry the desired category IDs as mutation input. The server writes lesson content and reconciles memberships atomically, but never persists that ID array on the lesson document.
- Assigning a tag transactionally reads the lesson and category before writing the deterministic membership.
- Assigning an existing membership is idempotent.
- Reordering validates that every supplied ID belongs to the requested scope before writing.
- Removing a membership compacts the remaining category order.
- Archiving a category leaves its memberships intact.
- Restoring a category appends it to the end of the active category order unless the admin subsequently reorders it.

The two new collections should be denied to direct clients in Firestore security rules; admin access flows through the API routes.

### Firestore indexes

Required composite indexes are declared in the repository's `firestore.indexes.json` as part of this plan, not left for runtime discovery:

| Collection                    | Fields                                              | Query supported                                                                                        |
| ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `practiceCategories`          | `lessonType ASC`, `status ASC`, `categoryOrder ASC` | List active or archived categories for one lesson type in admin order.                                 |
| `practiceCategories`          | `lessonType ASC`, `normalizedName ASC`              | Enforce case-insensitive name uniqueness across active and archived categories within one lesson type. |
| `practiceCategoryMemberships` | `categoryId ASC`, `lessonOrder ASC`                 | List a category's lessons in its independently managed lesson order.                                   |

Looking up memberships by `lessonId` alone uses Firestore's automatic single-field index and does not require a composite declaration. Student-facing indexes are deferred with student UX because their query shape has not been designed. If implementation changes one of the admin queries, the matching index change and this table must ship in the same change.

Implementation note: scoped reads intentionally apply the final `categoryOrder`/`lessonOrder` plus ID sort in the domain service instead of relying exclusively on Firestore `orderBy`. Firestore excludes documents that are missing an ordered field; reading the complete equality-filtered scope lets the service keep those records visible at the end with a stable ID tie-breaker and heal dense order values on the next create, add, remove, restore, or explicit reorder mutation. The declared composite indexes remain available for normalized ordered query shapes.

## Admin UI/UX implementation contract

These behaviors are required deliverables, not optional polish. The first implementation must cover the complete interaction states below rather than stopping after CRUD controls exist.

### Navigation and screen structure

- Add a visible **Manage Practice Categories** entry to the main admin panel alongside lesson-management tools.
- The category list route is `/admin/practice-categories`.
- The category detail route is `/admin/practice-categories/{categoryId}`.
- The list header contains **Back to Admin**, the title **Manage Practice Categories**, a short explanation that one lesson may have several tags, and a primary **Create category** button.
- Use top-level tabs for **Vocabulary**, **Sentence Diagramming**, and **Listening**. The selected tab scopes every category, count, search result, and create action on the page.
- Preserve the selected lesson-type tab and Active/Archived view in URL query parameters so refresh, Back, and copied links do not unexpectedly reset the admin's context.
- Default to the Vocabulary tab and Active view only when the URL has no valid state.
- Never combine categories from different lesson types in one ordering list.

### Category list

- Below the type tabs, show an **Active / Archived** segmented control, category-name search, the number of matching categories, and the ordered list.
- Search is case-insensitive and matches category name and description. Clearing search restores the complete ordered list.
- Category rows show a drag handle, name, optional two-line description, total assigned lesson count, live/draft count breakdown, and an action menu.
- The row body opens category detail. Edit/archive controls remain separate buttons so activating them does not also navigate.
- Active row actions are **Edit** and **Archive**. Archived row actions are **Restore** and, only when membership count is zero, **Delete permanently**.
- Do not show or enable permanent deletion while memberships remain. Explain that lessons must first be removed from the category.
- Category reordering is disabled while search is active or while viewing archived categories because the visible subset is not a safe complete ordering scope.

### Create and edit category dialog

- **Create category** opens a modal with lesson type, name, optional description, **Cancel**, and **Create category**.
- Lesson type defaults to the current tab. It may be changed during creation, but changing it updates the destination tab after success.
- Edit uses the same modal, labels the primary action **Save changes**, and displays lesson type as read-only.
- Name is required, trimmed on submission, and validated inline. The primary action remains disabled for an empty name or while submission is pending.
- A case-insensitive name conflict returns an inline field error such as **A Vocabulary category with this name already exists**. Do not rely on a generic toast for a field-level conflict.
- The dialog remains open when saving fails and preserves the entered values. On success it closes, refreshes the affected list, focuses the created or edited row, and shows a concise success toast.
- Closing a dialog with edited unsaved values asks for confirmation before discarding them.

### Category ordering behavior

- Active categories use drag-and-drop ordering with a visible handle; the entire row is not draggable.
- Dragging changes local order and reveals a persistent **Save order** and **Discard changes** bar. Reordering does not write on every pointer movement.
- **Save order** sends the complete ordered ID list for the selected lesson type. Disable both actions while the request is pending.
- A successful save clears the dirty state and shows **Category order saved**. A failed save restores the last server-confirmed order and provides a retry action.
- Changing type tabs, changing Active/Archived view, navigating away, or refreshing with unsaved order opens a discard confirmation.
- Keyboard users must be able to reorder through the drag library's keyboard sensor or explicit Move up/Move down actions. Every handle has an accessible label containing the category name and current position.

### Archive, restore, and permanent delete

- Archive opens a confirmation that includes the category name and assigned lesson count and states: lessons will not be deleted or unpublished, existing assignments will be retained, and the category will no longer be offered for new assignments.
- Confirming archive moves the category to Archived without changing lessons or memberships.
- Restore is available directly from the archived row and category detail. It returns the category to Active at the end of that type's active order and preserves its previous lesson membership order.
- Permanent deletion requires a second explicit confirmation, is available only with zero memberships, and states that the operation cannot be undone.
- Archived category detail remains viewable. Its membership list is visible and individual memberships may be removed, but adding and reordering lessons are disabled until the category is restored.

### Category detail and lesson membership

- The detail header has a breadcrumb back to the originating type/status list, category name, lesson-type badge, Active/Archived badge, description, assigned count, and **Edit**.
- For an active category, show **Add lessons** as the primary action above the membership list.
- Membership rows show a drag handle, lesson title, optional description preview, explicit **Live** or **Draft** badge, and **Remove** action.
- Clicking the lesson title opens its existing lesson editor. Dragging and row actions do not trigger that navigation.
- Active membership ordering follows the same local dirty-state contract as category ordering: **Save order**, **Discard changes**, navigation protection, server rollback, and keyboard support.
- Empty active category copy is **No lessons in this category yet** with an **Add lessons** action. Empty archived category copy explains that it can be restored or permanently deleted.

### Add lessons dialog

- **Add lessons** opens a searchable multi-select dialog containing only lessons whose type matches the category.
- Show both live and draft lessons with explicit status badges; categorization is independent of publication.
- Lessons already assigned to the category are excluded from selectable results. The dialog may show an informational assigned count, but must not allow duplicate membership creation.
- Search matches title and description case-insensitively.
- Each selectable lesson has a checkbox, and the footer states the number selected.
- The primary action is **Add selected lessons** and is disabled with zero selections or while saving.
- One confirmation adds all selected lessons in a single server operation and appends them in their displayed selection order after current memberships.
- Success closes the dialog, refreshes the list, focuses the first newly added lesson, and announces how many lessons were added. Failure leaves the dialog and selections intact for retry.

### Remove lesson from category

- **Remove** opens a confirmation naming both the lesson and category.
- The confirmation explicitly says that only this category assignment will be removed; the lesson, its publication status, and its assignments to other categories are unchanged.
- Confirming removes the membership immediately, compacts the remaining category order, and shows an Undo-free success toast. Undo is not offered because restoration is available through the normal Add lessons flow.
- While removal is pending, disable only that row's destructive action rather than blocking unrelated reading.

### Lesson editor category selector

For vocabulary, sentence-diagramming, and listening lessons, add **Categories** directly below the immutable lesson Type control in Lesson Information.

- Use a searchable multi-select popover with checkboxes rather than a single-select dropdown.
- The closed control shows up to three selected category chips followed by **+N more**. A summary beneath it reads **No categories assigned** when empty.
- The option list contains active categories for the lesson's type in `categoryOrder`, with selected values pinned visibly without changing the underlying admin order.
- Existing archived assignments appear as muted chips labelled **Archived**. They remain part of the desired saved set until the admin explicitly removes them, but archived categories cannot be newly selected.
- Include a **Manage Practice Categories** link that opens the category manager for the current lesson type. Do not implement inline category creation in this phase.
- Category changes participate in the editor's normal dirty-state and draft-recovery behavior.
- The normal lesson Save action submits lesson content and desired category IDs together. While saving, disable duplicate submission and show the existing save progress treatment.
- If category validation or any lesson write fails, neither lesson content nor memberships change. Keep the editor dirty, preserve selections, and show an actionable error.
- For a new unsaved lesson, changing type after selecting categories opens a confirmation explaining that incompatible category selections will be cleared. Existing saved lessons keep type immutable.
- Normal lesson and future test editors do not render this control at all.

Assignments made from Manage Practice Categories save through the same membership domain service. The shared service remains the only writer regardless of which admin screen initiated the change.

### Lesson Management

- On saved vocabulary, diagramming, and listening lesson cards, display up to three category chips followed by **+N more**. The overflow control exposes the complete category list through accessible text or a popover.
- Archived assigned categories use muted styling and an explicit **Archived** label rather than disappearing silently.
- Inside each non-normal lesson-type tab, add one single-select filter with **All categories**, every active category in admin order, and derived **Uncategorized**.
- Selecting one category shows lessons assigned to that category. **Uncategorized** shows lessons with zero memberships, including zero archived memberships.
- The category filter combines with title/description search using AND semantics. Switching lesson-type tabs resets an invalid category filter to **All categories**.
- Normal Lessons has no category filter and no category chips from this system.

### Manage Live Lessons

Publishing and categories remain independent.

- Show up to two category chips plus **+N more** on non-normal lesson rows for context.
- Category chips are informational on this screen; category assignment is edited in the lesson editor or category manager.
- Do not make category selection a publishing requirement.
- Do not add category grouping or filtering to Manage Live Lessons in this phase.
- Do not replace or reinterpret `liveOrder`. Category and per-category lesson ordering remain in Manage Practice Categories.

### Loading, empty, error, and stale-state behavior

- Initial list/detail loads use layout-stable skeleton rows rather than a blank page or full-page spinner.
- Distinguish **no data** from **no search results**. No-data states offer the relevant create/add action; search-empty states offer **Clear search**.
- A failed initial query shows an inline error panel with **Retry** while retaining the admin shell and navigation.
- Mutations disable only the affected controls where practical and expose visible progress text or a spinner.
- Do not remove or reorder server-backed items optimistically for create, archive, restore, add, or remove. Update after success so failed mutations leave the visible state trustworthy.
- If the server reports stale ordering or invalid membership state, refetch the affected scope, explain that the list changed elsewhere, and preserve unrelated editor input.
- Use toasts for successful operations and non-field failures; use inline errors for validation that the admin can correct in place.

### Accessibility and responsive behavior

- Tabs, segmented controls, dialogs, menus, checkboxes, badges, and popovers must expose names, selected state, and disabled state to assistive technology.
- Live/Draft, Active/Archived, and selected/unselected states cannot rely on color alone; pair color with text or iconography.
- Dialogs trap focus, focus the first invalid field after validation failure, restore focus to their trigger after close, and close with Escape unless a submission is pending.
- Every destructive confirmation names the affected object and describes what will and will not be deleted.
- Drag-and-drop has a keyboard-equivalent workflow and screen-reader announcements for movement and final position.
- At narrow widths, action bars wrap without covering content, dialogs fit the viewport, and list rows stack metadata while keeping the primary action and overflow menu reachable.

## Student UX boundary

This phase does not change the student dashboard or Practice section.

The current flat Vocabulary, Diagramming, and Listening grids remain in place. A later specification will decide whether categories become filters, sections, landing cards, or another navigation model. The stored schema already supports each of those options without another content migration.

## Implementation plan

### Phase 1: Domain model and persistence

- Add `PracticeLessonType`, `PracticeCategory`, and `PracticeCategoryMembership` types.
- Add Zod document and mutation schemas.
- Add a forward-compatible `isCategorisableLesson` helper that normalizes missing `kind` to `lesson` and rejects normal lessons and future tests.
- Add shared category and membership domain services.
- Add Firestore security rules for the two server-only collections and verify the already-declared composite indexes against the implemented query shapes.
- Add API tests for authorization, validation, cross-type rejection, test rejection, duplicate assignment idempotency, and optional categorization.

### Phase 2: Category administration

- Add the Manage Practice Categories admin entry and page.
- Implement URL-backed type/status tabs, category search, create/edit dialogs, archive/restore/permanent-delete confirmations, and category drag ordering with explicit Save/Discard behavior.
- Implement category detail, searchable multi-add, guarded removal, live/draft indicators, archived read-only behavior, and per-category lesson ordering with the same Save/Discard contract.
- Implement the specified loading skeletons, empty/search-empty states, inline errors, mutation progress, focus restoration, and stale-state refetch behavior.
- Add component or integration tests for dialog validation, archive/restore, ordering rollback, navigation protection, multi-add, membership removal, and type scoping.
- Verify that one lesson can be independently ordered in multiple categories.

### Phase 3: Lesson-management integration

- Add the category multi-select to non-normal lesson editors.
- Extend lesson create and update mutations to carry desired category IDs and atomically save lesson content plus membership reconciliation.
- Preserve pending category IDs in local lesson drafts and recovery items without adding them to persisted lesson documents.
- Preserve existing archived memberships in the editor until explicitly removed and prevent selecting new archived categories.
- Add bounded category chips and the single-select active-category/Uncategorized filter to Lesson Management with the documented AND search semantics.
- Show bounded category-chip context in Manage Live Lessons without altering publishing behavior or `liveOrder`.
- Add integration tests for atomic lesson/tag save failure, draft recovery, archived-tag retention, Uncategorized filtering, and hiding the selector from normal lessons.
- Ensure draft recovery and lesson-save flows never erase category memberships, which live in their own collection.

### Phase 4: Hardening and handoff to the test refactor

- Audit every category mutation for forward-compatible `kind` discrimination.
- Verify existing uncategorized lessons require no backfill and behave unchanged.
- Verify normal lessons cannot be assigned even through direct API calls.
- Verify a synthetic or persisted future `TestUnit` cannot be assigned even though it shares the `lessons` collection.
- Update lesson deletion to remove every membership referencing the deleted lesson in the same server-side operation without changing any category.
- Run keyboard-only and narrow-viewport passes over category list, detail, dialogs, popovers, confirmations, and ordering controls.
- Verify that every required UI state in the Admin UI/UX implementation contract is represented in automated tests where practical or in a documented manual QA checklist.
- Document the two category collections in the learning-unit refactor's compatibility checklist when implementation begins.
- Leave student category rendering disabled until its separate UX specification is settled.

## Acceptance criteria

- An admin can create, rename, archive, restore, and reorder categories independently for vocabulary, diagramming, and listening.
- The category list preserves lesson-type and Active/Archived state in the URL and never mixes ordering scopes between types.
- Category search matches name and description, distinguishes no-data from no-results, and disables ordering while a filtered subset is visible.
- Create/edit dialogs preserve input on failure, show name conflicts inline, protect edited values from accidental dismissal, and restore focus after close.
- A category cannot change lesson type after creation.
- Category names are unique across active and archived categories within a lesson type under case-insensitive comparison; archiving a category does not make its name reusable.
- A category from one type cannot be assigned to a lesson of another type.
- Normal lessons and tests cannot receive practice categories.
- A non-normal lesson with zero categories remains valid, editable, and publishable.
- A lesson can belong to several categories.
- Retrying an assignment does not create a duplicate membership.
- Removing a category assignment does not delete, unpublish, or otherwise modify the lesson.
- Deleting a lesson removes all of its membership records without deleting or modifying its categories.
- Archiving a category preserves its memberships and lesson ordering for restoration.
- Archive confirmation explains that lessons and memberships are retained; permanent delete is unavailable until membership count is zero.
- Categories have an admin-defined order within their lesson type.
- Lessons have an independent admin-defined order inside every category.
- Category and membership reordering use explicit Save/Discard controls, guard navigation while dirty, support keyboard operation, and restore server-confirmed order after failure.
- Reordering a lesson in one category does not change its order in another category or its existing `liveOrder`.
- The Add lessons dialog includes only same-type live/draft lessons, prevents duplicate selection, preserves selections after failure, and appends successful additions in displayed selection order.
- Removing a membership requires an explicit confirmation that the lesson and its other assignments remain unchanged.
- Existing lessons need no migration or default category.
- Saving a lesson and its desired category assignments is atomic: a validation or write failure leaves both the lesson and its previous memberships unchanged.
- Recovering a local lesson draft preserves its pending category selections without persisting a redundant category-ID array on the lesson document.
- The lesson editor uses a searchable multi-select, shows bounded chips with overflow, retains archived assignments as removable muted chips, and clears incompatible new-lesson selections only after confirmation.
- Lesson Management uses a single category filter with All Categories and derived Uncategorized options; category filtering and text search combine with AND semantics.
- Manage Live Lessons displays informational bounded chips without adding category editing, grouping, or publishing requirements.
- Category mutations use Next.js admin routes and cannot be performed through direct client Firestore writes.
- Every implemented compound query for categories or memberships has its corresponding declaration in `firestore.indexes.json` and documentation in this plan.
- Lesson and category management can filter to uncategorized lessons without storing a fake category.
- Loading, empty, search-empty, failed-query, mutation-pending, validation-error, and stale-order states follow the defined behavior rather than collapsing into a generic spinner or toast.
- All category interactions are keyboard reachable, expose non-color state labels, manage dialog focus correctly, and remain usable at narrow viewport widths.
- The student dashboard remains unchanged in this phase.

## Risks and safeguards

- Multiple category membership means ordering cannot live as one field on the lesson. Keep `lessonOrder` on the membership document.
- Category IDs embedded on lessons would introduce redundant state. Keep membership as the single source of truth until a measured query requirement justifies denormalization.
- Category archival must not silently unpublish lessons or erase membership history.
- Lesson deletion must cascade membership cleanup; otherwise deterministic membership documents would retain dangling lesson references.
- Reorder endpoints must validate scope; otherwise a malformed request could rewrite another type's category or another category's lessons.
- Current documents lack `kind`, while future tests share the `lessons` collection. Centralize the compatibility check instead of scattering raw `type` comparisons.
- The existing permissive Firestore client rules must not expose the new admin-only collections.
- Student UX is deferred, so do not prematurely shape the schema around one presentation such as nested folders or dashboard cards.

## Deferred decisions

These do not block the admin tagging system:

1. How students browse or filter categories inside the Practice section.
2. Whether archived categories with historical student-facing use need any special presentation later.
3. Whether categories eventually need visual metadata such as an image, icon, or color.

## Implementation progress history

| Date       | Milestone                     | Progress                                                                                                                                                                                                                                          |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-14 | Domain and persistence        | Added canonical category/membership types, strict Zod boundary schemas, normalized-name handling, future-kind eligibility checks, deterministic membership IDs, stable fallback ordering, and Firestore constants.                                |
| 2026-07-14 | Transaction service and APIs  | Implemented category lifecycle, category and lesson ordering, bulk assignment, removal, tag-only reconciliation, joined admin reads, atomic lesson create/update saves, recovery retry, and lesson-delete cascade.                                |
| 2026-07-14 | Category administration UI    | Added the admin entry, URL-backed list and detail routes, search/count states, dialogs and confirmations, archive/restore/delete, multi-add/removal, DnD plus keyboard ordering, stale rollback, and navigation guards.                           |
| 2026-07-14 | Lesson-management integration | Added the eligible-lesson category selector, archived assignment retention, local draft/recovery support, bounded chips, Lesson Management category filtering, and informational Manage Live Lessons chips.                                       |
| 2026-07-14 | Hardening and compatibility   | Denied direct category access and lesson writes, preserved `liveOrder` and student UX, documented learning-unit compatibility, protected snapshot/recovery paths, flushed draft exits, invalidated lesson caches, and hardened focus restoration. |
| 2026-07-14 | Automated verification        | Full Jest suite (24 suites, 91 tests), TypeScript, ESLint, whitespace validation, and the production Next.js build were run successfully. No deployment or external data mutation was performed.                                                  |

## Final implementation details

### Persistence and invariants

- `practiceCategories` and `practiceCategoryMemberships` are the only persisted sources of category and assignment state. Lesson documents never store category IDs or joined category objects.
- Category names are trimmed, Unicode-normalized, and compared case-insensitively within a lesson type across active and archived records.
- Membership IDs are deterministic SHA-256 encodings of the category/lesson pair, making retries idempotent without delimiter collisions.
- All eligibility checks normalize a missing lesson `kind` to `lesson`, require an eligible practice lesson type, and reject future `kind: 'test'` units even if they present a superficially compatible type.
- Reads sort by explicit order then stable ID. Missing order fields remain visible at the end; mutations rewrite affected scopes to dense zero-based values.
- Archiving preserves assignments and lesson order. Restoration appends to active category order. Permanent deletion requires an archived, empty category.

### Server routes and transaction boundaries

- Added the complete `/api/admin/practice-categories` category- and membership-centric route surface plus `/api/admin/lessons/{id}/practice-categories` for tag-only reconciliation.
- Admin lesson list/detail responses join both `practiceCategoryIds` and `practiceCategories`, including archived assignments, without persisting either field on lesson documents.
- Lesson POST/PUT strips response/local-only category fields and writes lesson content plus the desired membership set in one Firestore transaction. An omitted ID array preserves existing assignments; an explicit empty array removes all eligible assignments.
- Recovery retry uses the same transaction service, preserves pending category IDs, rejects replay once an item leaves `pending`, strips category fields from the restored lesson document, and marks recovery complete atomically with the lesson/membership write.
- Hard lesson deletion removes every membership and compacts each affected category in the same server transaction. Snapshot restore strips category fields, validates retained memberships before replacing lesson content, uses bounded transaction concurrency, and reports exact partial progress if a later group fails.
- Category mutations use the existing admin authorization boundary and typed validation/domain errors. Firestore rules deny all direct client access to both new collections and deny direct lesson writes, ensuring lesson mutation and membership cleanup stay on server routes.

### Admin and lesson-management UX

- `/admin/practice-categories` preserves lesson type and Active/Archived context in the URL, separates all ordering scopes, and supplies search, counts, skeletons, retry panels, no-data/no-results states, and guarded order editing.
- `/admin/practice-categories/{categoryId}` supports live/draft membership context, same-type searchable multi-add, per-row guarded removal, archived read-only ordering, and independent per-category lesson order.
- Pointer DnD, keyboard sensors, explicit move buttons, screen-reader announcements, visible text badges, responsive action wrapping, discard guards, and explicit dialog focus return cover the accessibility contract.
- Eligible lesson editors show the searchable multi-select directly under Type, keep archived assignments removable, preserve category state in drafts/recovery, and require confirmation before a new lesson type clears incompatible selections.
- **Save as Draft & Exit** now waits for the current lesson, including pending category IDs, to reach session storage before resetting editor state. Category-manager mutations invalidate joined lesson caches so a reopened editor cannot resubmit stale assignments.
- Lesson Management shows bounded chips and combines text search with All categories, an active category, or derived Uncategorized using AND semantics. Manage Live Lessons shows informational chips only and leaves publishing and `liveOrder` unchanged.
- The student dashboard and Practice section remain unchanged.

### Automated verification

- Domain/service tests cover normalization, validation, future-test and explicit-null-kind rejection, cross-type rejection, archived retention, deterministic IDs, idempotency, missing-order fallback, stale reorder rejection, and delete cascade compaction.
- Route tests cover authorization, validation, atomic lesson/category failure behavior, recovery stripping/reconciliation, and recovery replay rejection.
- Client tests cover draft preservation, mutation payload stripping, rich-text-safe AND filtering, archived chips, selector removal, type-scoped category loading, inline conflict focus, unsaved-form discard confirmation, response/count helpers, URL defaults, and typed conflict errors.
- Final commands and results:
  - `npm test -- --runInBand` — 24 suites and 91 tests passed.
  - `npx tsc --noEmit --pretty false` — passed.
  - `npm run lint` — passed with five pre-existing warnings and zero errors.
  - `npm run build` — passed.
  - `git diff --check` — passed.

### Connected-environment manual QA checklist

No deployment or live Firestore mutation was performed for this implementation. The following interaction checks remain for a signed-in local/admin environment:

- Verify Radix focus trapping/return and unsaved-dialog discard behavior with keyboard-only navigation.
- Exercise pointer and keyboard reorder announcements, Save/Discard, failed-save rollback, and browser Back/refresh guards.
- Run create, rename, archive, restore, and permanent-delete against an emulator or disposable admin dataset, including a duplicate-name conflict.
- Verify multi-add selection retention after a forced failure, first-added-row focus, and per-row removal pending state.
- Confirm category and lesson action bars remain reachable and do not cover content at narrow viewport widths.
- Verify one lesson can be ordered differently in two categories and that neither operation changes `liveOrder`.
