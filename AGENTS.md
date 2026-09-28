# Latin App Architecture & Engineering Guidelines

## Repository Architecture

- This is a Next.js App Router application.
- Application routes and pages live under `src/app`.
- Reusable business logic belongs under `src/lib`; API routes should primarily authenticate, validate, call a service, and map the result.
- Browser/server shared contracts and constants belong under `shared`.
- Files named `*.server.ts` are server-only. Never import Firebase Admin, Node-only modules, or secrets into client components.
- Use the `@/` import alias instead of deep relative imports.
- In Next.js dynamic routes, route `params` are promises and must be awaited.

## Authentication and Authorization

- Every `/api/admin/**` handler must call `verifyAdminAccess(request)` before accessing protected data.
- Student routes use `verifyRequestAuth(request)` and must enforce resource ownership; authentication alone is insufficient.
- `withAdminAuth` is a client-side UX guard, not a security boundary.
- Never trust client-supplied actor IDs. Derive `createdBy`, `updatedBy`, and ownership fields from the verified token.
- Use `createAuthenticatedBaseQuery()` for authenticated RTK Query APIs.

Authoritative examples:
- `src/lib/verifyAdminAccess.ts`
- `src/lib/verifyRequestAuth.ts`
- `src/store/api/baseQuery.ts`

## Firestore and Persisted Data

- Import collection names from `shared/constants/firestore.ts` or an existing domain constant. Do not duplicate collection-name strings.
- The active vocabulary collection is `VOCABULARY_WORDS_COLLECTION` (`vocabulary_words_v5`). Legacy collections are migration inputs only.
- Firestore transactions must perform all reads before any writes.
- Validate foreign document references inside the transaction that writes the relationship.
- Reject missing documents and documents marked `_deletionPending`.
- When relationship changes participate in deletion safety, update the corresponding revision marker in the same transaction.
- Keep Firestore documents below the repository’s safety margin, not merely below the provider’s hard 1 MiB limit.
- Respect Firestore query operand limits and chunk `in`, `array-contains-any`, and high-cardinality reads using existing local constants.
- Bounded Transactions: Provider transaction limits (e.g. Firestore 500-write limit) must never be breached. Partition large mutations into batches of at most 200 writes under an exclusive lock (`runVocabularyContentExclusiveMutation`).

## Vocabulary Content Synchronization

- Mutations touching vocabulary words, vocabulary pools, or content that references pools must participate in the production-content synchronization lock.
- `verifyAdminAccess` performs an early lock check, but this does not prevent a race. The actual write must still use `runVocabularyContentMutation`.
- Use `runVocabularyContentExclusiveMutation` only for operations that genuinely require multiple transactions or cross-service writes.
- Nested transactions under an exclusive mutation must pass `{ lockOwnerId }`.
- Never reuse, overwrite, or manually delete a lock owned by another operation.
- Multi-transaction operations are not atomic. Make each step idempotent or retry-safe and consider failure after every completed batch.

Authoritative examples:
- `src/lib/vocabulary-pools/sync-lock.server.ts`
- `src/lib/vocabulary-pools/word-membership.server.ts`
- `src/lib/vocabulary-pools/content-revision.server.ts`

## Validation and Domain Errors

- Treat API request bodies, route IDs, external responses, and Firestore documents as `unknown` until validated.
- Prefer the domain’s existing Zod schemas rather than TypeScript casts.
- Invalid persisted data should normally fail closed with a specific `409` domain error; do not silently invent defaults unless an existing compatibility normalizer explicitly permits it.
- Preserve deliberate legacy compatibility behavior. Do not “clean up” legacy defaults without tests showing migration safety.
- For new domain-style routes, use `createRouteErrorResponse` and structured errors with stable `code` and `status` fields.
- Follow the response shape of neighboring routes; this repository contains both legacy `{ success, data }` envelopes and newer direct domain responses.

Authoritative examples:
- `src/lib/route-error-response.ts`
- `src/lib/learning-units/domain.ts`
- `src/lib/tests/schemas.ts`

## Cross-Document Integrity and Deletion

- Do not directly delete entities that may be referenced elsewhere.
- Use the domain’s existing usage scan, confirmation challenge, revision/fingerprint, archive, and tombstone workflow.
- Re-check invariants in the final transaction; a preflight read alone is not sufficient.
- Reordering APIs must validate the exact current scope so stale clients cannot silently drop or duplicate records.
- Cross-document updates should be transactional unless an exclusive, retry-safe multi-transaction workflow is explicitly required.

## RTK Query and Pagination

- Server responses are authoritative for filtered, searched, and sorted lists.
- Do not reproduce Firestore search, collation, filtering, or pagination rules in cache-update code.
- Before changing cache behavior, inspect `serializeQueryArgs`, `merge`, and `forceRefetch` together.
- If pages share one cache key, a first-page response must replace the cache; cursor responses may append and deduplicate.
- Do not insert an item into a partially loaded sorted cache unless its position relative to unloaded records is guaranteed.
- If forcing a refresh while the same cache key may be pending, await `util.getRunningQueryThunk(...)` before dispatching the replacement request.
- When mutating paginated lists, avoid synchronous tag invalidation races; use `util.selectInvalidatedBy(getState(), [{ type: 'EntityList', id: 'LIST' }])` and explicitly dispatch `endpoints.getList.initiate({ ...originalArgs, lastId: null }, { subscribe: false, forceRefetch: true })`.
- Cache tests should cover:
  - first page;
  - an accumulated cursor page;
  - filtered variants;
  - non-default sorting;
  - an already-running pagination request.

## React Compiler

- `reactCompiler: true` in `next.config.js` memoizes client components and hooks at build time. Do not add `useMemo`, `useCallback`, or `React.memo` in new code only to avoid re-renders. Keep existing ones unless profiling shows they are unnecessary.
- The compiler silently skips any component or hook that breaks the Rules of React, such as mutating props or state, reading `ref.current` during render, or disabling a `react-hooks` lint rule. Fix the code instead of adding `eslint-disable` comments for React hooks rules.
- Pass the latest callback to an effect with `useEffectEvent`, not a ref assigned during render.
- Jest runs components through the compiler (`tests/helpers/reactCompilerJestTransformer.cjs`), so component tests cover the code that ships.
- If a component misbehaves only when compiled, add the `'use no memo'` directive as the first statement of that component, with a comment explaining the bug, and fix the underlying rule violation in a follow-up.

## UI and Content Rendering

- Reuse the existing admin shell and UI primitives (`AdminPage`, `AdminPageHeader`, `RomanCard`, shared buttons and dialogs).
- User-authored labels and descriptions may contain rich text. Render them through `SimpleRichDisplay`; do not display HTML as plain text or introduce raw `dangerouslySetInnerHTML`.
- Use `getApiErrorMessage` for RTK Query errors and `sonner` for user-facing mutation feedback.
- Model in-flight card/row actions using `Set<string>` or keyed maps rather than single scalar IDs to ensure concurrency safety.
- When duplicating authored lesson/page/exercise content, use the ID regeneration utilities in `src/utils/idUtils.ts`. IDs and references must be regenerated together.
- Do not regenerate canonical IDs such as sentence-diagram token/span identities unless the domain utility explicitly does so.

## React Effects, Render Loops, and Navigation

- An effect that sets state, dispatches, navigates, or writes browser history must not re-run on every render. Keep per-render callbacks and inline objects or arrays out of its dependency array.
- Custom hooks that accept callbacks must read them through `useEffectEvent`, never list them as effect dependencies. `react-hooks/exhaustive-deps` cannot see a per-render callback passed through a custom hook.
- In the Next.js App Router, a native `window.history.pushState` or `replaceState` triggers a router update that re-renders the page. An effect that pushes history on every render is an infinite loop that freezes the tab. It throws nothing and never reaches Sentry.
- History and navigation guards must be idempotent: push one guard entry per dirty period and check before writing again. Use `useUnsavedNavigationGuard` for new editors.
- Render-phase state updates (`if (changed) setState(...)` during render) must settle after one extra render.
- Regression tests for navigation guards must model the router re-render on `pushState`; jsdom has no App Router, so a plain render cannot reproduce these loops.

Authoritative examples:
- `src/hooks/useUnsavedNavigationGuard.ts`
- `src/hooks/useLessonDraft.ts`
- `tests/useBeforeUnload.test.tsx`

## Testing and Verification

- Add regression tests for the actual failure mode, not only isolated helper functions.
- Backend mutation tests should cover:
  - unauthorized access;
  - missing and deletion-pending references;
  - transaction/write limits;
  - partial or stale state;
  - concurrency or lock behavior.
- Frontend cache tests should use a real RTK Query store when the bug involves invalidation, merging, or request timing.
- Run proportionate verification:
  - `npx tsc --noEmit`
  - targeted Jest tests with `npm test -- --runInBand tests/<file>.test.ts`
  - `npm run lint`
  - `git diff --check`
  - the full test suite for cross-cutting changes
  - `npm run test:firestore-rules` when Firestore rules change
  - after a Next.js or React upgrade, a real-browser smoke test of lesson create/edit and the test editors: make an edit and confirm the tab stays responsive and the history length stays stable
- Preserve unrelated uncommitted work and avoid opportunistic refactors.

## Production Content Safety

- Production content is read-only to the production-to-development synchronization workflow.
- Never run an apply, rollback, migration, or destructive maintenance command unless the user explicitly authorizes that exact operation.
- Prefer dry-run, inspect the plan, apply only with authorization, and verify afterward.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
