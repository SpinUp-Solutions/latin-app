Lesson Save Guard Streamlining Report
Date: 2026-01-30

Scope
- Admin lesson create/edit flows: unsaved guard, saving behavior, lesson state initialization.

Findings and Streamlining Opportunities
1) Redundant lesson initialization
   - Both pages and LessonBuilder initialize lesson state.
     - Create page sets lesson in useEffect.
     - Edit page sets lesson + tooltips in useEffect.
     - LessonBuilder also dispatches setLesson and loadTooltips on mount.
   - Impact: duplicate work and risk of re-initializing state (can clear dirty state or overwrite edits).
   - Recommendation: centralize initialization in the pages only, and remove the initialization effect from LessonBuilder.
   - Files: src/app/admin/lessons/create/page.tsx, src/app/admin/lessons/edit/[id]/page.tsx, src/components/ui/admin/LessonBuilder.tsx

2) Potentially unused slice saving state
   - lessonEditorSlice has saving + setSaving but the UI now uses RTK Query isLoading from mutations.
   - If rg confirms no remaining usages of setSaving/saving (outside the slice), this is dead code.
   - Recommendation: remove saving from the slice and rely solely on RTK Query loading state.
   - File: src/store/slices/lessonEditorSlice.ts

3) Duplicated unsaved-changes dialog logic
   - Create and edit pages each keep dialog state and navigation guard logic with similar branching.
   - Recommendation: extract a shared hook (e.g., useLessonUnsavedGuard) that handles:
     - beforeunload + popstate wiring
     - modal state + callbacks (Save & Exit / Discard / Stay)
   - Files: src/app/admin/lessons/create/page.tsx, src/app/admin/lessons/edit/[id]/page.tsx, src/hooks/useLessonDraft.ts

4) Guard condition consistency
   - Create uses shouldBlockNavigation = dirty || saving || hasDraft; edit uses dirty || saving.
   - With the new dirty flag, hasDraft may be redundant if dirty reliably reflects unsaved edits.
   - Recommendation: decide desired UX (block if any draft exists vs only if dirty) and standardize.
   - Files: src/app/admin/lessons/create/page.tsx, src/app/admin/lessons/edit/[id]/page.tsx

5) Navigation interception coverage
   - Current guard covers tab close/refresh (beforeunload) and browser back (popstate).
   - It does not automatically intercept programmatic Next.js navigations initiated elsewhere.
   - Recommendation: if broader coverage is needed, add a shared guard at the admin lesson route level or a central navigation blocker.
   - Files: src/hooks/useLessonDraft.ts, admin pages

Dead Code Candidates (confirm with rg before removal)
- lessonEditorSlice.saving + setSaving (if unused).
- LessonBuilder initialization effect (if pages always set lesson state).

Risks / Notes
- Removing LessonBuilder initialization requires pages to always set lesson state before builder renders.
- If tooltips are only loaded in LessonBuilder today, ensure equivalent loading remains in the page (edit flow already does).

Next Steps
- Run rg to confirm usages of setSaving/saving.
- Decide the single source of truth for lesson initialization (pages vs LessonBuilder).
- Extract a shared guard hook to reduce duplication and unify behavior.
