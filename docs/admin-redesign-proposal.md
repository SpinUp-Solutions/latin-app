# Admin Dashboard Redesign Proposal

**Goal:** Keep the admin familiar — same routes, same features, same Roman branding — but make it more beautiful, with clearer hierarchy, a real navigation shell, and consistent page structure.

**Non-negotiables (do not change):**
- All existing routes and URL structure (`/admin/...`)
- `withAdminAuth` wrapping on every page
- All data fetching, mutations, and business logic
- Existing feature components (`VocabularyList`, `WordEditPanel`, `LessonManager`, editors, etc.) — this is a layout/ presentation redesign, not a feature rewrite
- The Roman design tokens (`roman-red`, `roman-gold`, `roman-parchment`, `roman-marble`, Trajan Pro serif headings)

---

## 1. Problems with the current design

1. **No shared shell.** `src/app/admin/layout.tsx` is a passthrough (`return children`). Across the **23 admin page routes**, pages hand-roll `<div className="min-h-screen bg-roman-marble">` (or full-height `h-screen` variants) plus a white header with a "Back to Admin" ghost button (11 duplicated instances). Headers are inconsistent: some have icon medallions, some don't; actions appear in different positions; back-links point to different places.
2. **Flat hierarchy on the landing page.** Seven equal-weight cards in a 3-column grid; every action is the same full-width outline button; nothing tells you what's primary, what's frequent, or what's dangerous.
3. **Off-palette rainbow icons.** Icon chips use `bg-blue-100`, `bg-indigo-100`, `bg-green-100`, `bg-purple-100`, `bg-rose-100`, `bg-amber-100` — none of these belong to the Roman palette, so the page feels like generic Tailwind rather than a branded tool.
4. **No way to move between admin sections** without returning to `/admin` first.
5. **Dead UI shipped in production.** The "User Management" card has only disabled buttons. The temporary "Data Migrations" card sits at the same visual weight as daily tools.
6. **Workbench pages are utilitarian.** Dense filter/list/edit layouts work, but lack a consistent toolbar pattern, status color system, empty states, and polished selected/hover states.

---

## 2. Design direction

**Concept:** "Roman reading room" — quiet parchment/marble surfaces, ink-like text, one strong accent (`roman-red`), gold used sparingly for highlights and badges. Serif (Trajan Pro) is reserved for page titles and section headers; everything functional is `Open Sans`.

### Refined usage rules

| Element | Rule |
|---|---|
| Accent | One accent only: `roman-red` (`#8B2635`). It is already the `--primary` token — use `bg-primary`, `text-primary` instead of hardcoding `bg-roman-red`. |
| Icon chips | **Delete the rainbow.** Every section icon uses the same treatment: `h-10 w-10 rounded-lg bg-roman-red/10 text-roman-red` (or `bg-primary/10 text-primary`). |
| Gold | `roman-gold` only for small highlights: badges, dividers, the active-nav indicator. Never large fills. |
| Type scale | Page title `text-2xl font-serif`; card/section title `text-base font-serif` or `text-lg font-serif`; body `text-sm`; labels/eyebrows `text-xs font-medium uppercase tracking-wider text-roman-stone`. |
| Surfaces | Page bg `bg-roman-marble`; cards `bg-white border border-border rounded-lg shadow-sm`; hover `shadow-md transition-shadow`; section header strips `bg-roman-parchment` (the existing `.roman-card-header` pattern). |
| Status colors | Define one semantic badge set and reuse it everywhere: draft = stone/gray, active/live = `roman-green`, pending = gold/amber, error/destructive = red. Do not invent per-page colors. |
| Density | Comfortable but not airy: card padding `p-5`, section gaps `gap-6`, page padding `py-8`. Inputs/buttons in toolbars use `h-9`. |

---

## 3. Phase 1 — Shared admin shell (the foundation)

This is the highest-leverage change: it deletes ~11 duplicated headers and gives every page consistent navigation, breadcrumbs, and title structure.

### 3.1 New components (new files)

Create under `src/components/admin/shell/`:

- **`AdminShell.tsx`** — the frame: a **persistent** sidebar (a full-height flex column, not `position: fixed`) + a content region.
  - Layout: `flex h-screen overflow-hidden bg-roman-marble`
  - Sidebar: `w-60 flex-shrink-0 border-r border-border bg-white` (desktop), hidden below `lg` — mobile opens it via the existing `Sheet` component triggered from the topbar.
  - Content region: `flex-1 min-w-0 min-h-0 flex flex-col` — deliberately **unopinionated**: no scroll, no padding. Scrolling is a per-page decision (see "Scroll contract" below).
- **Scroll contract — expressed via page-level wrappers, not a shell prop.** App Router layouts receive no per-page props, so each page chooses its scroll behavior by what it renders at its root:
  - **Standard pages** wrap everything in **`<AdminPage>`** (new component): `flex-1 min-h-0 overflow-y-auto` around an inner `container max-w-7xl mx-auto px-4 py-8`. This wrapper is the only page-level scroll container.
  - **Full-height workbenches/editors** render their own root instead: `flex-1 min-h-0 flex flex-col overflow-hidden` (a drop-in replacement for today's `h-screen flex flex-col overflow-hidden`), managing internal pane scrolling exactly as they do now. No `AdminPage`, no page-level scroll — this avoids double scrollbars and broken nested scroll.
- **`AdminSidebar.tsx`** — brand block at top (Wake Forest logo + "Administration" in serif), then grouped nav inside a `<nav aria-label="Admin">`, then a footer link "Back to Dashboard" (`/dashboard`).
  - Nav groups (labels in `text-xs uppercase tracking-wider text-roman-stone`, items `text-sm`):
    - **Overview** → `/admin`
    - **Content** → Manage Lessons `/admin/lessons/manage`, Create Lesson `/admin/lessons/create`, Live Lessons `/admin/lessons/live`, Practice Categories `/admin/practice-categories`
    - **Assessment** → Tests `/admin/tests/manage`, Mock Tests `/admin/mock-tests`
    - **Vocabulary** → All Words `/admin/vocabulary`, Advanced Filters `/admin/vocabulary/advanced`, Pending Review `/admin/vocabulary/pending`, Vocabulary Pools `/admin/vocabulary-pools`
    - **System** → Diagramming Attempts `/admin/diagramming-attempts`
  - Active item: `bg-roman-red/10 text-roman-red font-medium` with a 2px `bg-roman-red` left indicator (or `border-l-2`); inactive: `text-foreground/70 hover:bg-roman-parchment`. The active link gets `aria-current="page"`.
  - Active detection: `usePathname()`; **`/admin` (Overview) matches exactly only**. All other items match on a segment boundary (`pathname === href || pathname.startsWith(href + '/')` — the boundary check prevents `/admin/vocabulary` matching `/admin/vocabulary-pools`). When several items match (e.g. `/admin/vocabulary` and `/admin/vocabulary/pending` both prefix the pending URL), only the **longest matching href** is active.
- **`AdminTopbar.tsx`** — `h-14 border-b border-border bg-white/80 backdrop-blur sticky top-0 z-10`, contains the mobile menu button (left, with an accessible label) and breadcrumbs (see 3.2).
- **`AdminPageHeader.tsx`** — the standard page intro every page renders at the top of its content:
  ```tsx
  <AdminPageHeader
    title="Manage Lessons"                 // serif, text-2xl
    description="View and edit existing lessons"  // text-sm text-roman-stone
    actions={<Button>…</Button>}           // optional right-aligned slot
  />
  ```
  Renders title left, actions right, with `mb-6`. No back buttons — navigation lives in the shell now. (Full-height editors that already have an internal toolbar header may keep it and skip this component.)

### 3.2 Breadcrumbs

Derive from `usePathname()`, but be **route-aware, not segment-shape-aware** — a dynamic segment can't be reliably labeled from its shape (`[id]` vs `[categoryId]` vs `[mockId]` mean different things on different routes). Use an ordered list of route templates in a `breadcrumb-utils.ts`; first match wins:

```ts
const BREADCRUMB_ROUTES: { template: string; crumbs: string[] }[] = [
  { template: 'lessons/manage', crumbs: ['Lessons', 'Manage'] },
  { template: 'lessons/create', crumbs: ['Lessons', 'Create Lesson'] },
  { template: 'lessons/edit/$id', crumbs: ['Lessons', 'Edit Lesson'] },
  { template: 'lessons/live', crumbs: ['Lessons', 'Live Lessons'] },
  { template: 'tests/edit/$id', crumbs: ['Tests', 'Edit Test'] },
  { template: 'tests/edit/$id/versions/create', crumbs: ['Tests', 'Edit Test', 'New Version'] },
  { template: 'tests/edit/$id/versions/$versionId/edit', crumbs: ['Tests', 'Edit Test', 'Edit Version'] },
  { template: 'vocabulary-pools/$poolId/edit', crumbs: ['Vocabulary Pools', 'Edit Pool'] },
  // …one entry per route…
];
```

Matching is per-segment (`$name` matches exactly one dynamic segment). Fallback for unmatched routes: label known static segments from a small map (`vocabulary-pools` → "Vocabulary Pools", `practice-categories` → "Practice Categories", etc.) and render any unmatched dynamic segment as **"Details"**. Render in the topbar: `Admin / Vocabulary / All Words`.

### 3.3 Route groups and page classification

App Router layouts apply to **all** children, so the one route that must keep its own chrome — the lesson preview, which renders the student-facing `LessonPlayer` — is opted out with a **route group** (file paths change, URLs do not):

- `src/app/admin/layout.tsx` — stays a server component, keeps `metadata`, renders `children` only.
- `src/app/admin/(shell)/layout.tsx` — renders `<AdminShell>{children}</AdminShell>`. All admin pages move under `(shell)` except the preview.
- `src/app/admin/(standalone)/lessons/preview/[id]/page.tsx` — keeps its own full-bleed layout and "Admin Preview Mode" banner; only restyle the banner to the new palette.

**Classification of all 23 routes** (drives scroll mode and migration order):

| Route | Class | Scroll mode |
|---|---|---|
| `/admin` | Landing | `AdminPage` |
| `/admin/lessons/manage`, `/admin/lessons/live`, `/admin/practice-categories`, `/admin/practice-categories/[categoryId]`, `/admin/tests/manage`, `/admin/tests/edit/[id]`, `/admin/mock-tests`, `/admin/mock-tests/[mockId]`, `/admin/vocabulary-pools`, `/admin/vocabulary-pools/create`, `/admin/vocabulary-pools/[poolId]/edit`, `/admin/diagramming-attempts` | Standard (12) | `AdminPage` |
| `/admin/vocabulary`, `/admin/vocabulary/advanced`, `/admin/vocabulary/pending` | Full-height workbench (3) | Self-managed (`flex-1 min-h-0 overflow-hidden`) |
| `/admin/lessons/create`, `/admin/lessons/edit/[id]`, `/admin/tests/create`, `/admin/tests/edit/[id]/versions/create`, `/admin/tests/edit/[id]/versions/[versionId]/edit`, `/admin/mock-tests/create` | Full-height editor (6) | Self-managed |
| `/admin/lessons/preview/[id]` | Standalone preview (1) | Full-bleed, no shell |

### 3.4 Page migration

- One page at a time: delete the hand-rolled `<header>` (back button, icon medallion, title) and the outer `min-h-screen bg-roman-marble` / `h-screen` wrapper.
- Standard pages render `<AdminPage><AdminPageHeader … />{existing content}</AdminPage>`. Full-height pages render their self-managed root with `AdminPageHeader` (or their internal toolbar) at the top.
- **Acceptance criterion:** no migrated page renders its own back-button header or duplicated shell chrome — navigation comes from the shell alone. Do **not** chase "zero matches for `min-h-screen`/`bg-roman-marble`": loading/error states and the standalone preview legitimately keep full-viewport classes.

---

## 4. Phase 2 — Dashboard landing page (`/admin`)

Replace the flat card grid with a grouped, hierarchical overview.

### Structure

1. **Page header:** `AdminPageHeader` with title "Administration", description "Manage lessons, vocabulary, tests and content." No card around it — let it breathe.
2. **Stat strip — deferred.** Do not build it in this redesign. Dashboard stats create pressure to add new queries/endpoints; revisit later only if existing hooks make it essentially free.
3. **Grouped sections**, each with an eyebrow label (`text-xs uppercase tracking-wider text-roman-stone mb-3`):
   - **Content** — Lesson Management card (Create / Manage / Live / Practice Categories)
   - **Assessment** — Tests card (Create / Manage) + Mock Tests card
   - **Vocabulary** — Vocabulary card (All Words / Advanced Filters / Pending Review / Pools)
   - **System** — Diagramming Audit card, Data Migrations card
4. **Card redesign** (applies to all cards on this page):
   - Header row: unified icon chip (`h-10 w-10 rounded-lg bg-primary/10 text-primary`), serif title, one-line description.
   - Actions: **link rows, not button stacks.** Each action is a full-width row (`flex items-center justify-between px-3 py-2 -mx-3 rounded-md text-sm hover:bg-roman-parchment`) with the label left and a `ChevronRight h-4 w-4 text-roman-stone` right. The single most important action per card (e.g. "Create New Lesson") may be a solid primary `Button size="sm"` above the link rows.
   - Whole card keeps `hover:shadow-md transition-shadow`.
5. **Data Migrations card** — keep functionality identical, but visually demote it: place in the System group with description "Temporary backfill tools". The real "Run" buttons get destructive styling, **and** the existing native `confirm()` guard (already present in `runMigration`) is upgraded to the shared `ConfirmationDialog` (`@/src/components/ui/core/ConfirmationDialog`) with explicit copy, e.g. "This will mutate production data. Run a dry run first if you haven't." Red styling communicates risk; the dialog prevents the accidental click. Keep the result `<pre>` output, styled `bg-roman-marble rounded-md border text-xs`.
6. **Delete the "User Management" card** (both buttons are disabled). Re-add when the feature exists.

---

## 5. Phase 3 — Workbench page polish

Apply these patterns page-by-page after the shell lands. No logic changes.

1. **Every page** gets `AdminPageHeader` with title, description, and its primary action(s) in the `actions` slot (e.g. "Create New Lesson" moves out of the old header into this slot).
2. **Filter/toolbar bars** (vocabulary, pools, lessons, tests): wrap filters in a single white card (`bg-white border rounded-lg p-3 mb-4`) with unified control heights (`h-9`) and consistent gaps. Search input first, then selects, reset action last (`variant="ghost"`).
3. **Lists:**
   - Row hover: `hover:bg-roman-parchment/60`.
   - Selected row (vocabulary split view): `bg-roman-red/5` + `border-l-2 border-roman-red` (replaces or augments whatever current selected styling exists — keep it subtle).
   - Part-of-speech / status chips: use the shared badge set from §2 — neutral `outline` badges, or `bg-roman-parchment text-foreground` — not a color per word type.
4. **Edit panels:** section dividers use the existing parchment header pattern (`.roman-card-header`); if a panel has a save action, make it a sticky footer bar (`sticky bottom-0 bg-white border-t p-3`) so Save is always visible.
5. **Empty states:** one shared pattern — centered icon (`h-10 w-10 text-roman-stone/50`), serif title, `text-sm text-roman-stone` description, optional primary CTA. Apply wherever lists can be empty.
6. **Loading:** use the existing `Skeleton` component for list rows/cards instead of spinners where easy; keep `AdminLoadingPage` for full-page loads.
7. **Focus states:** ensure interactive rows are real `<button>`/`<Link>` elements with `focus-visible:ring-2 focus-visible:ring-ring` (already the shadcn default — just don't break it with `div onClick`).

---

## 6. Implementation plan

| Phase | Scope | Acceptance criteria |
|---|---|---|
| **1. Shell** | New `src/components/admin/shell/*`, `(shell)`/`(standalone)` route groups, migrate all 23 admin routes per the §3.3 table | App builds; every `/admin/*` route except the lesson preview renders inside the shell with sidebar + breadcrumbs; no migrated page renders its own back-button header; active nav is longest-match with `/admin` exact-only; full-height pages keep their internal scrolling with no double scrollbars; all existing tests pass |
| **2. Landing** | Rewrite `src/app/admin/page.tsx` per §4 | Grouped sections, unified icon chips, link-row actions, User Management card removed, migrations demoted to System with destructive-styled Run buttons guarded by `ConfirmationDialog`; migration dry-run/run still works |
| **3. Workbench polish** | Apply §5 patterns to: vocabulary (`/admin/vocabulary`, `/advanced`, `/pending`), lessons (`/manage`, `/live`, `/create`, `/edit/[id]`), tests, mock-tests, vocabulary-pools, practice-categories, diagramming-attempts | Consistent headers/toolbars/empty states; no functional regressions; existing Playwright/Jest tests pass (update selectors only where markup changed) |

**Cross-cutting acceptance criteria (all phases):**

- Sidebar is a `<nav aria-label="Admin">`; the active link has `aria-current="page"`; every nav item and card link row is keyboard-reachable with a visible focus ring.
- Mobile (`< lg`): sidebar opens via the existing `Sheet`; focus is trapped while open and restored to the trigger on close (Radix provides this by default — verify, don't rebuild); the menu button has an accessible label.
- Responsive check at 320px, 375px and 768px widths: no horizontal page scroll; standard pages stack cleanly; full-height workbenches remain usable (split panes may stack or keep a minimum pane width — decide per page and note the choice in the PR).

**Suggested order within phases:** shell first in one PR; landing page in a second; workbench pages in small batches (vocabulary, then lessons, then the rest) so reviews stay small.

**Testing:** run `npm run build`, the existing Jest suite, and relevant Playwright specs after each phase. The redesign must not change any Firestore queries, API calls, or Redux logic.

---

## 7. Explicitly out of scope

- Dark mode for admin (tokens exist but admin usage doesn't justify the work now)
- Dashboard stat strip (deferred — see §4)
- New features, new endpoints, or dashboard analytics
- Touching the student-facing app (`/dashboard`, lesson player, etc.) — the shell changes are confined to `src/app/admin` and `src/components/admin/shell`
- Replacing shadcn/ui or the Tailwind setup
