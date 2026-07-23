# Practice Category Tags Plan

Status: Proposed  
Last updated: 2026-07-22

## Purpose

Extend the implemented practice lesson categorization system with tags that are owned by an individual category.

The intended hierarchy is:

```text
Practice lesson type
└── Category
    ├── All
    └── Tags
```

Example:

```text
Vocabulary
└── Authors
    ├── All
    ├── Cicero
    ├── Caesar
    └── Virgil
```

Categories remain curated collections of lessons. Tags are optional filters inside a category; they are not global labels and do not replace category membership.

This plan builds on `docs/practice-lesson-categorization.md`, whose category and membership architecture is already implemented. That document remains the historical source for the base categorization feature. This document covers only the tag extension and its student/admin presentation.

## Settled product decisions

- Every tag belongs to exactly one practice category.
- There is no global or lesson-type-wide tag pool.
- Tags are simple names in v1. They do not have descriptions, colors, icons, or other presentation metadata.
- A category may have zero, one, or many tags.
- A lesson must be a member of a category before it can have tags from that category.
- A lesson may have zero, one, or many tags within the same category.
- A lesson assigned to several categories has an independent tag selection in every category.
- A membership with no tags still appears under **All** for that category.
- There is no **Untagged** student or admin filter.
- Selecting multiple tags uses match-any semantics: a lesson is included when it has at least one selected tag.
- Tags have an explicit admin-defined display order.
- Tags use archive/restore as their normal lifecycle.
- An archived tag may be permanently deleted only when no membership references it.
- Tag assignments are editable from both the category detail page and the lesson editor.
- The category detail page can also filter its lesson list by tags.
- Student lesson cards display their active tags while browsing a category.
- Active tags with no live matching lessons are hidden from students.
- Student tag filtering is added to the dashboard Practice section in v1.
- The in-lesson Practice sidebar is outside v1 and remains unchanged.

## Current architecture

The existing hierarchy is:

```text
Practice lesson type
└── PracticeCategory
    └── PracticeCategoryMembership
        └── Lesson
```

Firestore currently stores:

```text
practiceCategories/{categoryId}
practiceCategoryMemberships/{membershipId}
```

The membership is already the authoritative relationship between a lesson and a category. It also owns the lesson's independent `lessonOrder` within that category. Category IDs and joined category records used by the UI are response or mutation data and are never persisted on lesson documents.

Before Learning Unit Refactor Phase 5A, the student lessons endpoint loads live lessons, joins their category memberships, and returns category summaries plus placement metadata. Phase 5A replaces that full-content list with `GET /api/student-dashboard`, whose shared dashboard service returns lightweight normal-flow and practice summaries. `PracticeSection` continues to perform type, category, text, and tag filtering in the browser, but consumes the practice summary projection rather than full lesson documents.

The tag feature should extend these existing responsibilities rather than introduce a parallel taxonomy system.

## Relationship to Learning Unit Refactor Phase 5

The tag feature does not change Phase 5's placement architecture:

- Phase 5 changes the source of truth only for the normal Learning Path.
- Vocabulary, sentence-diagramming, and listening visibility remains type-scoped through `isLive` and `liveOrder`.
- `PracticeCategoryMembership.lessonOrder` remains authoritative inside a selected category.
- Tag definitions remain in `practiceCategories`.
- Membership tag IDs remain in `practiceCategoryMemberships`.
- `practiceCategorySelections` remains mutation-local.
- Categories, selections, placements, and tags are never persisted on `LessonUnit`, added to `LearningUnitBase`, or made available to `TestUnit`.
- Category and tag mutations continue to require normalized `kind === 'lesson'` and an eligible non-normal lesson `type`.
- The Learning Path migration, cutover, verification, and rollback do not read or write tags, categories, or category memberships.

Phase 5A is the required student read-path seam for this feature. Its initial delivery must remain a zero-behavior-change refactor, so student-visible tag filtering must ship as a separate change after Phase 5A. The tag domain, service, routes, and admin UI may be developed independently, but the student integration must target the post-5A dashboard summary API rather than the legacy `/api/lessons` list.

Phases 5B and 5C do not block category tags. They affect the normal Learning Path aggregate and leave practice persistence and presentation inputs unchanged.

## Recommended architecture

Embed tag definitions in their owning category document and store selected tag IDs on the existing category membership document.

```ts
type PracticeTagStatus = 'active' | 'archived';

interface PracticeTag {
  id: string;
  name: string;
  normalizedName: string;
  status: PracticeTagStatus;
  tagOrder: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

interface PracticeCategory {
  // Existing fields remain unchanged.
  tags: PracticeTag[];
}

interface PracticeCategoryMembership {
  // Existing fields remain unchanged.
  tagIds: string[];
}
```

Example persisted documents:

```ts
const authorsCategory = {
  id: 'authors',
  lessonType: 'vocab',
  name: 'Authors',
  // Existing category metadata omitted.
  tags: [
    {
      id: 'tag-cicero',
      name: 'Cicero',
      normalizedName: 'cicero',
      status: 'active',
      tagOrder: 0,
      // Audit metadata omitted.
    },
    {
      id: 'tag-virgil',
      name: 'Virgil',
      normalizedName: 'virgil',
      status: 'active',
      tagOrder: 1,
      // Audit metadata omitted.
    },
  ],
};

const membership = {
  categoryId: 'authors',
  lessonId: 'vocabulary-lesson-12',
  lessonOrder: 4,
  tagIds: ['tag-cicero'],
  // Existing audit metadata omitted.
};
```

This is preferred over separate `practiceTags` and `practiceTagAssignments` collections because:

- ownership is structurally clear: a tag cannot exist outside its category;
- the existing category membership is the natural place for category-specific lesson metadata;
- assigning or removing a category automatically creates or removes its tag-selection boundary;
- tag definitions arrive with the category data already needed by the UI;
- tag selection does not add another join to admin or student lesson reads;
- deleting a membership cannot leave orphaned tag-assignment documents;
- the expected number of short tag definitions is comfortably within a Firestore document;
- the implementation requires no new Firestore collection or composite index.

Do not embed tag IDs on lesson documents. A tag ID is meaningful only together with its category membership, and lesson documents must not become a second source of truth.

## Domain invariants

### Tag definition rules

- A tag is scoped to its containing category and cannot move to another category.
- `id` is stable, opaque, and generated server-side. Renaming a tag preserves its ID and assignments.
- `name` is required after trimming.
- `normalizedName` is derived server-side using the same normalization policy as category names.
- Tag names are unique case-insensitively across active and archived tags inside one category.
- The same normalized tag name may exist in another category, including another category of the same lesson type.
- Archiving does not release the name. An admin restores the original tag rather than creating a second tag with the same identity.
- New tags are active and append to the end of the category's active tag order.
- `tagOrder` is scoped to active tags within one category.
- Reads sort active tags by `tagOrder`, then stable tag ID as a tie-breaker.
- Archiving compacts the remaining active order.
- Restoring appends the tag to the end of the active order.
- Reordering validates the complete active tag scope and writes dense zero-based values.
- Archived tags retain their last metadata and assignments but are excluded from active ordering.
- Permanent deletion requires the tag to be archived and absent from every membership in the category.
- Hard-deleting an eligible category deletes its embedded tag definitions with the category document. Existing category deletion rules already require the category to have no memberships.

### Tag assignment rules

- `PracticeCategoryMembership.tagIds` is the authoritative tag selection for that lesson in that category.
- Missing `tagIds` on an existing membership is interpreted as `[]`.
- Tag IDs behave as a set: duplicates are invalid and their input order has no display meaning.
- Every referenced tag must exist in the membership's category.
- New assignments may reference only active tags.
- Existing archived tag assignments may be retained or explicitly removed, but an archived tag cannot be newly assigned.
- Removing a category membership removes all of its tag selections automatically.
- Adding a lesson to a category creates a membership with `tagIds: []`.
- Archiving a tag does not rewrite category memberships.
- Restoring a tag makes its retained assignments active again.
- Renaming or reordering a tag does not rewrite category memberships.
- Archiving a category hides the category and all its tags from students without altering tag status or membership data.
- Category and tag assignment mutations must continue rejecting normal lessons, tests, and lesson types that do not match the category.

### Filtering rules

- **All** is a UI state represented by an empty selected-tag set. It is not a stored tag.
- With no selected tags, every lesson membership in the category matches, including `tagIds: []`.
- With one selected tag, a membership matches when its `tagIds` contains that tag.
- With several selected tags, a membership matches when the intersection between assigned and selected IDs is non-empty.
- Text search is combined with the tag result using AND logic.
- Filtering never changes the category's curated `lessonOrder`.
- Archived tags never participate in student matching, even though their IDs may remain on memberships.
- Student tag counts use live lessons in the selected category and ignore text search and other selected tags.
- Active tags with a count of zero are omitted from the student filter.

## Public types and transport shapes

Introduce a canonical category selection shape for lesson editing and mutation:

```ts
interface PracticeCategorySelection {
  categoryId: string;
  tagIds: string[];
}
```

Use this as the complete desired category/tag set submitted with lesson create and update operations:

```ts
interface LessonMutationCategoryData {
  practiceCategorySelections: PracticeCategorySelection[];
}
```

Response-facing types should expose:

```ts
interface PracticeCategorySummary {
  // Existing fields.
  tags: PracticeTagSummary[];
}

interface PracticeCategoryPlacement {
  categoryId: string;
  lessonOrder: number;
  tagIds: string[];
}

type PracticeCategoryLesson = LessonSummary & {
  membershipId: string;
  lessonOrder: number;
  tagIds: string[];
};
```

The Phase 5A student dashboard's purpose-built practice lesson summary must include the same lightweight category data without including lesson pages:

```ts
interface PracticeDashboardCategoryPlacement {
  categoryId: string;
  lessonOrder: number;
  tagIds: string[];
}

interface PracticeDashboardLessonSummary {
  // Existing Phase 5A card and progress summary fields.
  practiceCategories: PracticeCategorySummary[];
  practiceCategoryPlacements: PracticeDashboardCategoryPlacement[];
}
```

The final concrete summary type should extend the Phase 5A type already used by `PracticeSection`; do not create a parallel dashboard DTO or restore the full `LessonWithProgress` list response.

Compatibility behavior:

- `practiceCategorySelections` becomes the canonical local and mutation representation.
- Existing `practiceCategoryIds` remains accepted as a legacy request fallback during this feature rollout.
- If a lesson update supplies only legacy category IDs, retained memberships preserve their current `tagIds`; newly created memberships receive `[]`.
- Old recovery records containing only category IDs therefore cannot accidentally erase newer tag assignments on retained memberships.
- New clients submit `practiceCategorySelections` and replace the complete category/tag selection atomically.
- Joined categories, placements, selections, and legacy IDs are stripped before writing a lesson document.
- Student responses include only active tag definitions; admin responses include active and archived tags where management requires them.
- The student dashboard response contains tag definitions and placement tag IDs only in its practice lesson summaries. Normal lessons and tests do not receive practice-category fields.

## Service and API design

All category and tag mutations continue through the existing server-side practice category service and Firebase Admin SDK. Direct client access to the category and membership collections remains denied.

Add these admin routes:

```text
POST   /api/admin/practice-categories/{categoryId}/tags
PATCH  /api/admin/practice-categories/{categoryId}/tags/{tagId}
DELETE /api/admin/practice-categories/{categoryId}/tags/{tagId}
POST   /api/admin/practice-categories/{categoryId}/tags/reorder
PUT    /api/admin/practice-categories/{categoryId}/lessons/{lessonId}/tags
```

Suggested request bodies:

```ts
// Create
{ name: string }

// Rename, archive, or restore
{ name?: string; status?: 'active' | 'archived' }

// Reorder the complete active scope
{ orderedTagIds: string[] }

// Replace the complete tag selection for one membership
{ tagIds: string[] }
```

Service behavior:

- Tag creation, rename, archive, restore, delete, and reorder run in a transaction that reads the latest category document.
- Tag reorder rejects missing, duplicate, archived, foreign, or extra IDs with a stale-order `409` response.
- Permanent deletion transactionally verifies that the tag is archived and no category membership references it.
- Membership tag replacement transactionally reads the category and membership, validates additions against active tags, and updates membership audit metadata.
- Lesson creation and update reconcile lesson content, memberships, and `tagIds` in the same existing transaction.
- Category detail reads return tag usage counts derived from the already-loaded category memberships.
- Existing category lesson addition creates empty tag sets; administrators can assign tags immediately afterward from the lesson row.
- Existing category removal, lesson deletion, category archive, category delete, and recovery flows are extended to preserve the new invariants.
- Tag definition and membership mutations invalidate the shared `StudentLearningPath` dashboard projection in addition to the relevant practice-category admin cache tags. They must not rely only on the legacy `StudentLesson` cache tag.

Add explicit domain errors for:

- tag not found;
- tag name conflict;
- tag archived;
- tag not archived;
- tag still in use;
- tag/category mismatch or invalid assignment;
- stale tag order;
- stale or invalid tag data.

No Firestore index or security-rule expansion is required because tags stay in the existing protected documents and current queries still load by category ID or lesson ID.

## Admin implementation

### Category detail

Add a **Tags** management section above **Lessons in this category**.

The section provides:

- active and archived views;
- a visible count of matching tags;
- tag-name search for administration only;
- **Create tag** action;
- tag usage count showing how many category memberships reference it;
- drag, keyboard, and move-button ordering for the complete active unfiltered list;
- rename and archive actions for active tags;
- restore action for archived tags;
- permanent delete action only for archived tags with zero usage;
- clear explanations when ordering or deletion is unavailable;
- the same unsaved-order navigation protection used by categories and lessons.

Tag create/edit behavior follows the existing category form conventions:

- trim and validate the name inline;
- disable submission for an empty name or pending request;
- keep the dialog open and preserve values on failure;
- show a field-level case-insensitive name conflict;
- confirm before discarding edited values;
- focus the created or edited tag after success;
- show a concise success toast.

Archived categories preserve their tag definitions and assignments. The category must be restored before creating or reordering tags or adding new tag assignments. Existing tag assignments remain visible and removable while archived.

### Category lesson list

Add an active tag multiselect to every lesson membership row.

- Active tags are available for selection.
- Existing archived assignments remain visible as muted chips and can be removed.
- Archived tags cannot be newly selected.
- Saving replaces the membership's complete tag ID set.
- A lesson with no selected tags remains a valid member and appears under **All**.
- Tag editing is disabled while lesson-order changes are unsaved.
- Failed updates preserve the current UI selection and provide retry feedback.

Add a lesson-list filter above the rows:

- **All** is selected when no tag filters are active.
- Active and archived tags are available to admins, with archived tags clearly labeled.
- Multiple selections use match-any behavior.
- Search and tag filtering combine with AND logic.
- Reordering is disabled whenever search or tag filtering hides part of the membership list.
- Clearing all tag selections returns to **All**.
- No **Untagged** option is displayed.

Adding lessons remains a separate action. Newly added lessons receive no tags, enter the end of the category lesson order, and are immediately visible under **All** so tags can be assigned inline.

### Lesson editor

Replace the current flat category-only selection state with category selections containing `categoryId` and `tagIds`.

- Selecting a category reveals its active tags beneath that category.
- Tags use a searchable multi-select suitable for categories with more than a few tags.
- Selected categories remain summarized as category chips in the closed control.
- Selected tags are summarized within their owning category and never presented as global lesson tags.
- Existing archived category or tag assignments remain visible, muted, and removable.
- An archived category or tag cannot be newly assigned.
- Removing a category removes that selection and all of its tag IDs in one local update.
- The existing lesson-type change confirmation clears all category and tag selections together.
- Lesson save submits one complete `practiceCategorySelections` array and reconciles it atomically with lesson content.

## UI/UX design track

Status: Settled. The visual and interaction decisions below are approved for implementation.

This track refines component composition, density, responsive behavior, wording, and visual hierarchy without changing the domain model above.

The guiding principle is deliberate asymmetry between audiences:

- Students need discovery with few, glanceable choices: visible filter pills.
- Administrators need density and fast cleanup across many tags: compact rows, dropdowns, and popovers.
- A shared tag picker popover component serves the category lesson rows and the lesson editor so assignment behavior is identical on both admin surfaces.

### Student dashboard: settled interaction model

The existing three-level navigation becomes:

```text
Practice type tabs
→ Category/collection selection
→ All or one/more category-owned tag filters
→ Lesson cards
```

Required interaction behavior:

- The existing practice type tabs remain the first navigation level.
- The existing category list/select remains the second level.
- Tag controls appear only after a specific category is selected.
- The top-level **All Practice** view does not combine or expose tags from different categories.
- **All** is the default tag state for each selected category.
- Clicking **All** clears every selected tag.
- Selecting a tag removes the active visual state from **All**.
- Multiple tags may remain selected simultaneously.
- Selected tags use match-any behavior.
- Changing category or practice type resets tags to **All** and clears the existing text search, matching current navigation behavior.
- Tag filtering and text search update the lesson grid immediately without navigation or a server request.
- Empty results explain whether the current tag/search combination has no matches and provide a clear reset action.
- No **Untagged** filter or wording appears anywhere.

### Student dashboard: tag filter shelf

The tag filter is a full-width row of pill buttons (the tag shelf) placed between the selected category description block and the lesson grid. The search input stays anchored in the collection header row so its position never moves when tags appear or disappear.

Pill behavior and presentation:

- **All** is always first and never moves. It shows the selected state whenever no tags are selected and acts as the reset; clicking it is idempotent.
- Tags follow in `tagOrder`. Selected tags keep their position instead of moving to the front; selection is communicated by a theme-tinted fill, a check icon, and `aria-pressed`, never by reordering.
- Every pill shows its lesson count using the same count treatment as the practice type tabs and collection rows (`tabular-nums`).
- Pills are visually subordinate to the practice type tabs and category controls: smaller height and text, and a lighter fill than the tab active surface.
- Unselected pills use a neutral outline; hover applies a faint theme tint; the focus ring matches the existing page-wide focus treatment.
- The selected state is theme-tinted per practice type (amber, sky, violet) and includes a check icon, so color is not the only indicator.
- On desktop the shelf wraps. On mobile it scrolls horizontally as a full-bleed row with a faded right edge to signal overflow, keeping the lesson grid's vertical position stable while switching categories.
- The shelf collapses entirely when the selected category has no visible tags; no empty stub or placeholder is rendered.
- Zero-count tags are hidden, not disabled.

Filter clearing and result feedback:

- **All** clears every selected tag.
- A contextual **Clear filters** text action appears at the end of the shelf only while tags are selected or the search box is non-empty. It clears tags and search together and disappears when nothing is filtered. No persistent third control is shown.
- The existing lesson-count line under the collection title reads "N lessons" when unfiltered and "N of M lessons" while filtered. This line owns the `aria-live="polite"` result announcement.
- Filtering updates the grid immediately in the browser; no loading state is shown.

Empty results:

- A tag-only selection cannot produce zero results by construction: zero-count tags are hidden and match-any only unions results. No tag-only empty copy is needed.
- The tag-plus-search empty state names the query and the selected tags (for example, "Nothing in Authors matches this search with the selected tags.") and offers **Clear search** and **Clear tags and search** actions.
- A generic fallback ("No lessons match the selected tags." with a **Show all lessons** action) is retained defensively.

### Lesson card tags: settled behavior

- In a selected category, tag chips render in the same slot currently used by category chips (above the title). Card anatomy and height stay identical between the two scopes.
- In **All Practice**, cards keep the existing category chips; tags are never shown and the two scopes never mix.
- At most two tag chips are visible, followed by a `+N` overflow indicator, matching the existing category chip budget.
- Chip order is: tags matching the active filter selection first (in `tagOrder`), then the remaining tags in `tagOrder`, so the reason a card matched is always visible.
- When tag filters are active, matching chips use the practice theme fill; the lesson's other chips keep the neutral slate treatment.
- Chips remain compact and visually secondary to title, progress, and the primary action.
- The lesson card is a single button element, so chips and the overflow indicator must remain non-interactive spans. Hidden tag names are disclosed through a `title` attribute for hover and an `aria-label` on the overflow indicator listing the hidden names (for example, "2 more tags: Caesar, Ovid").
- Lessons with `tagIds: []` render no chips and no placeholder, and still appear under **All**.

### Admin UI: settled layout direction

Tag management and lesson membership remain two clearly separated sections on category detail, with tag definitions above the lesson list because the tag vocabulary controls the lesson-row selectors below it.

Tags management section:

- Tags use compact single-line rows that mirror the visual grammar of the lesson list below (drag grip, keyboard move buttons, name, metadata, actions) at a denser height. Neither a table nor a chip organizer is used.
- The section header carries the **Create tag** action, an Active/Archived segmented toggle with counts, and an administration-only tag search.
- While the tag search is active, ordering controls are disabled with the explanation "Clear the search to reorder tags."
- Each tag row shows its usage count as a subtle action (for example, "7 lessons"). Activating it filters the lesson list below by that tag, turning the tags section into the entry point for cleanup work. Unused tags read "Not used".
- Rename uses a dialog following the existing category form conventions: inline trim and validation, field-level case-insensitive conflict, keep-open on failure, discard confirmation, focus the row after save, and a success toast. Inline row editing is not introduced.
- Archive, restore, and permanent delete reuse the category confirmation dialog pattern. Delete is offered only for archived tags with zero usage; when unavailable, the control explains why (for example, "Cicero is used by 4 lessons. Remove it from those lessons before deleting.").
- Restore copy notes that the tag is appended to the end of the active order.
- Tag ordering reuses the existing drag, keyboard move, announcements, and sticky unsaved-order bar, scoped to tags ("Save the new tag order? This changes only the filter order inside Authors.").
- The two unsaved-order states (lessons and tags) are mutually exclusive: while one is dirty, the other section's ordering controls are disabled with the existing "Save or discard … first" explanation, so only one sticky bar can appear. Tag metadata edits (create, rename, archive, restore, delete) are independent of both orders and remain enabled.

Category lesson list:

- Every membership row shows its assigned tags as chips in a dedicated line under the description, plus an **Add tags** action when empty. No separate **Edit tags** mode exists.
- Clicking a chip or **Add tags** opens a shared tag picker popover containing a checkbox list of the category's active tags in `tagOrder`, a search input when the category has more than eight active tags, and a muted archived-assignments group whose entries are removable but not re-selectable.
- The popover saves on close: it tracks a dirty flag and issues a single membership tag replacement with the complete ID set. Failures keep the current selection, reopen the popover, and offer retry.
- Archived assignments render as muted chips with an archived label and a remove action.
- Tag editing is disabled while lesson-order changes are unsaved, with the established explanation.

Lesson list filter toolbar:

- A persistent single-row toolbar above the rows holds the lesson search, a **Filter by tag** dropdown with a checkbox menu (active tags; archived tags listed and labeled), and a contextual **Clear filters** action.
- The dropdown trigger summarizes the selection (for example, "Tags: Cicero +2").
- Multiple selections use match-any behavior and combine with search using AND logic.
- Reordering is disabled whenever search or tag filtering hides part of the membership list, with the established explanation. The toolbar is also the state set by the tag usage-count cross-links.

Lesson editor:

- The category combobox remains category-only; tag checklists are not nested inside it. Nesting them inside the search-filtered combobox was rejected because tag search would need to synthesize parent group rows and selecting a tag whose category is not selected is invalid.
- Each selected category renders a compact assignment block below the control: the category name, its selected tag chips, and an **Add tags** action that opens the same shared tag picker popover used on category detail.
- Empty tag selections read "No tags selected" with a note that the lesson appears under **All**, so the **All** behavior is taught at the point of assignment.
- Archived categories keep the existing muted treatment with their tags shown muted and removable.
- The closed control's summary line extends to "N categories assigned · M tags selected" so tag state is visible without opening anything.
- Removing a category removes its block and tag IDs in one local update; the lesson-type change confirmation clears categories and tags together.

### Accessibility and responsive requirements

- Every tag filter and assignment control must expose selected state programmatically.
- Multi-select filters use checkbox-style semantics, not radio semantics. Student filter pills are toggle buttons with `aria-pressed` inside a labeled group.
- **All** acts as a clear/reset control and must have an unambiguous accessible label ("Show all {category} lessons").
- Result-count changes are announced through the `aria-live` lesson-count line under the collection title.
- Card tag chips are non-interactive spans because the card itself is a button; hidden names are disclosed through the overflow indicator's `aria-label` and `title`.
- Drag ordering retains keyboard move controls and announcements.
- Dialog focus restoration, error focus, and discard confirmation follow existing admin behavior.
- Color is not the only indication of selected, archived, or unavailable state; selected pills include a check icon and archived items carry an explicit label.
- Chip overflow must not hide tag names from screen readers.
- Mobile controls must remain usable without requiring precision horizontal dragging.

## Student data flow

After Learning Unit Refactor Phase 5A, the authenticated dashboard summary endpoint remains the only initial data request for the dashboard. Tag filtering must not restore the legacy full-content lesson fetch.

```text
Firestore category + membership documents
→ PracticeCategoryService joins lesson assignments
→ shared student-dashboard service queries lightweight live practice summaries
→ dashboard projection removes archived category/tag definitions
→ practice summaries include categories and placements with tagIds
→ PracticeSection derives category/tag counts
→ browser filters and preserves membership lessonOrder
```

`GET /api/student-dashboard` should return tag definitions through joined category summaries and tag IDs through each practice lesson's placement. The projection must contain the card, progress, category, and placement fields required by `PracticeSection`, but never lesson pages. The UI should derive:

- active tags for the selected category;
- live lesson count per tag;
- selected-tag match-any results;
- tag chips for each visible lesson.

`GET /api/lessons/[lessonId]` remains the separate full lesson-detail request made after navigation and does not become a tag-filter data source. Server-side student tag queries, URL-backed filter state, pagination, and a dedicated taxonomy endpoint are deliberately deferred until lesson volume or navigation requirements demonstrate a need.

## Failure and concurrency behavior

- A missing or malformed persisted tag array is treated as stale category data when it cannot be safely normalized.
- Missing `tags` or membership `tagIds` fields from pre-feature records safely normalize to empty arrays.
- A tag mutation based on a changed category document reloads the latest state and reports a conflict rather than overwriting concurrent edits.
- Reorder requests must contain the exact active tag scope.
- Assigning a missing, foreign, or newly archived tag rejects the whole membership or lesson transaction.
- Lesson content is not written when category/tag reconciliation fails.
- Archived assignments already present on a membership are not silently discarded by unrelated lesson edits.
- Category detail refreshes after a stale membership or ordering conflict.
- Student enrichment retains the existing graceful failure boundary: category/tag enrichment failure must not prevent live lessons from loading, but the error is logged.

## Migration and rollout

No data migration is required.

- Category documents without `tags` behave as `tags: []`.
- Membership documents without `tagIds` behave as `tagIds: []`.
- The first successful mutation of an older document writes the normalized fields.
- Existing categories continue to display **All** and function exactly as they do now until tags are created.
- Existing memberships remain in their current order and appear under **All**.
- Existing lesson recovery items using only category IDs use the compatibility reconciliation rules and cannot clear retained tag assignments.
- No new Firestore collections, indexes, or client security permissions are introduced.

Recommended delivery sequence:

1. Add backward-compatible types, schemas, persisted parsing, and service tests.
2. Add tag lifecycle and membership tag mutation routes.
3. Move lesson mutations to canonical category selections while retaining legacy fallback parsing.
4. Extend category detail and lesson editor admin workflows.
5. Implement the settled UI/UX design track for the admin surfaces.
6. Complete and verify Learning Unit Refactor Phase 5A's zero-behavior-change dashboard summary cutover if it has not already shipped.
7. Extend the Phase 5A practice summary projection and its `StudentLearningPath` cache contract with active category tags and membership `tagIds`.
8. Add student dashboard filters and lesson-card tag presentation as a separate post-5A behavior change.
9. Run focused category/dashboard tests, full Jest, lint, production build, and targeted Playwright coverage.

## Test plan

### Domain and schema tests

- Parse legacy categories and memberships with empty tag defaults.
- Reject empty, duplicate, and case-insensitively conflicting tag names.
- Permit the same tag name in different categories.
- Generate stable IDs and preserve assignments across rename.
- Append, compact, restore, and reorder active tags correctly.
- Reject stale reorder scopes.
- Reject permanent deletion of active or referenced tags.
- Permit deletion of archived unused tags.
- Reject duplicate, missing, foreign, or archived new tag assignments.
- Preserve existing archived assignments during unrelated reconciliation.
- Verify match-any helpers and the absence of an untagged branch.

### Service and route tests

- Require admin authorization on every new route.
- Validate strict request payloads before calling the service.
- Create, rename, archive, restore, reorder, and delete embedded tags transactionally.
- Replace membership tags without changing `lessonOrder`.
- Add category lessons with empty `tagIds`.
- Remove memberships without separate tag cleanup writes.
- Atomically reconcile lesson content, categories, and tag IDs.
- Confirm legacy category-ID updates preserve retained tag IDs.
- Confirm old recovery retries preserve retained tag IDs.
- Return tag usage counts and membership tag IDs in category detail.
- Extend the Phase 5A student-dashboard practice summary without returning lesson pages or creating a second dashboard DTO.
- Return only active tag definitions and membership `tagIds` in student practice summaries.
- Invalidate the `StudentLearningPath` dashboard projection after tag definition or membership changes.

### Admin component tests

- Manage active and archived tags and show correct usage/deletion states.
- Disable tag ordering under partial-list filters.
- Preserve dialog values and focus conflict errors.
- Assign several tags from a category lesson row.
- Filter admin lessons using match-any behavior.
- Keep untagged lessons under **All** without offering an **Untagged** filter.
- Select categories and their tags from the lesson editor.
- Preserve and remove archived assignments explicitly.
- Clear tag selections when their category or lesson type is removed.
- Protect unsaved lesson ordering from conflicting tag mutations.

### Student component tests

- Default a selected category to **All**.
- Include both tagged and untagged category members under **All**.
- Match one selected tag.
- Match any of several selected tags.
- Combine tag filtering with text search.
- Reset tag and search state on category or practice-type change.
- Hide archived and zero-live-result tags.
- Preserve curated category lesson order after filtering.
- Render active category-owned tag chips with bounded overflow.
- Keep top-level **All Practice** cards category-oriented rather than mixing tag scopes.
- Render a useful empty state and reset control when filters produce no lessons.
- Verify the tag UI consumes the Phase 5A practice summary hook and does not reintroduce `useGetStudentLessonsQuery` or a full-content list fetch.

### Verification

- Run the focused practice category and PracticeSection Jest suites.
- Run the complete Jest suite.
- Run ESLint.
- Run the production Next.js build.
- Add a Playwright flow covering tag creation, assignment, publication visibility, student filtering, archive, and restore.

## Out of scope for v1

- Global tags shared across categories.
- Tags directly persisted on lesson documents.
- A separate tag-assignment collection.
- Nested tags or more than one tag level.
- Tag descriptions, colors, icons, aliases, or translations.
- An **Untagged** filter.
- AND matching between selected tags.
- Server-side student filtering or pagination.
- URL-persisted tag selections.
- Tag filtering in the in-lesson Practice sidebar.
- Tag analytics or recommendations.
- Bulk tag assignment across multiple lesson rows (revisit if initial tagging of large categories proves painful).
- A "More filters" expander on the student tag shelf for categories with very many tags (the wrap/scroll behavior is sufficient until a real category needs it).
