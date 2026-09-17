# Edge → production QA handoff — 17 September 2026

Test the deployed `edge` revision containing **fix(vocabulary): paginate live word-count sorting beyond 500 pools**. The production comparison base is `613baa58a12f86e5a1ebacd3bfd55d25341c8937`; the edge revision reviewed before this fix was `4d5373b3ec25c4c75ab74a65d292fe53d29a5995`. Record the deployed commit and URL in the QA report.

## Scope and environment

The fix removes the 500-pool catalog limit for word-count sorting. It scans summaries in batches of 200, retains the requested page plus one lookahead item, and computes linked pools' current unique word counts. Each linked pool still has its own 500-node graph limit. Responses and client cache contracts stay the same.

Use an isolated development/emulator dataset and an admin account for authoring. Use a student account for playback and access checks. Do not seed, modify, or clean up production data. Firestore rules are outside this review. No migration, index change, or environment-variable change is required by this fix.

Live word-count sorting still scans the catalog on each request; capture response times for the large-catalog cases. This change bounds batch size, concurrency, and retained summaries, but does not introduce stored aggregate counts. Check pagination on a stable dataset; after editing membership, refresh from page one before assessing the new ordering.

## Automated regression checks

Run from the checked-out edge revision:

```sh
npm test -- --runInBand tests/vocabularyLinkedPools.test.ts tests/vocabularyPoolPendingBoundaries.test.ts
npm test -- --runInBand tests/vocabularyPoolFromPoolsCache.test.ts tests/vocabularyPoolDuplicateCache.test.ts tests/vocabularyPoolUnlink.test.tsx tests/vocabularyPoolsPage.test.tsx tests/authDiagnostics.test.tsx
npx tsc --noEmit
git diff --check
```

The linked-pool suite creates its own in-memory database; it needs no Firebase credentials and writes no external data. It covers 505-pool catalogs in both directions, every page and tied counts, filters and empty results, hidden pending records, more than 500 independent linked pools, live nested membership, independent graphs on name-sorted pages, a genuinely oversized graph, stale cursors, authorization, and exact scan boundaries.

`npm run lint` currently reports two pre-existing `@typescript-eslint/no-require-imports` errors at `next.config.js:1-2`; report any additional errors separately.

## Priority 1: word-count sorting regression

Open `/admin/vocabulary-pools`. Use at least **505 visible ordinary pools**, with counts from 0 through 4 and many ties; include pools that have been edited and saved with no source links (`sourcePoolIds: []`). Give subsets different difficulty, active/inactive status, and tags. Where feasible, also exercise the endpoint directly with authenticated requests:

`GET /api/admin/vocabulary-pools?sortBy=wordCount&sortOrder=asc&limit=20`

Pass the response's `data.lastPoolId` as `lastPoolId` for the next request. The UI requests pages of 20. Disable name search for these cases because name search retains its existing separate ordering behavior.

| Case                                                                    | Expected result                                                                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Word count ascending, then descending                                   | HTTP 200; counts globally ordered, including pools whose document IDs fall after the first 500 scanned records.                                 |
| Load every page of the unchanged catalog                                | Every visible pool appears exactly once; no duplicates or omissions at tied counts; ID breaks ties in the same direction as the count sort.     |
| Last page and request after the last cursor                             | Last page has `hasMore: false`; requesting after its final cursor returns `pools: []`, `hasMore: false`, `lastPoolId: null`.                    |
| Difficulty, active/inactive, and tag filters, individually and combined | Only matching pools appear, in count order. Multiple tags match any supplied tag. A filter matching nothing returns HTTP 200 and an empty page. |
| Pending creation or pending deletion records                            | These never appear or consume visible result slots.                                                                                             |
| Missing, deleted, pending, or now-filtered-out cursor pool              | HTTP 409 with `VOCABULARY_POOL_CURSOR_STALE`; refreshing from page one works.                                                                   |
| More than 500 independent linked pools                                  | Loads successfully; independent pools do not share one graph-size budget.                                                                       |
| Name sort and created-at sort                                           | Continue to load and paginate normally. Include a name-sorted page whose separate linked graphs total over 500 nodes.                           |
| Anonymous or student call to the admin list endpoint                    | Access denied before pool data is returned.                                                                                                     |

For pending/corrupt records and oversized graphs, use the automated test fixtures or an isolated emulator. Do not corrupt shared environment data to reproduce these cases. An individual graph over 500 nodes must still fail closed with `VOCABULARY_POOL_GRAPH_TOO_LARGE`; missing sources and cycles must also continue to be rejected.

## Priority 1: linked-pool behavior in this release

Create source **A** with words `{a, b}`, source **B** with `{b, c}`, and combined pool **C** linked to A and B with direct words `{a, d}`. Create **D** linked to C. Use real existing vocabulary IDs for these labels.

1. C and D show four unique words `{a, b, c, d}` in the list, editor, and student lesson playback. Pool creation, duplicate, and editing remain usable with the large catalog.
2. Add `e` to A. C and D show five words after refresh and move to the correct position in word-count sorting. Remove `b` from A: B still supplies it, so C and D remain at five.
3. Unlink A from C, save, leave the page, and reopen it. The link stays removed, inherited-only `e` disappears, and explicitly direct `a` remains. C and D show `{a, b, c, d}`.
4. Unlink B as well. C and D contain only `{a, d}`. Empty `sourcePoolIds` must not cause a catalog-size error.
5. Attempt to remove an inherited word individually and attempt a cycle (for example, link A to C while C still links to A). The operation fails with a useful message and no partial saved change.
6. While C references A, deleting A is blocked. The card shows persistent failure feedback and its delete spinner stops. Once all dependencies/assignments are removed, the normal confirmation and deletion flow works.
7. While a second list page is still loading, create or edit a pool. After requests settle, the list refreshes from page one with current ordering and no duplicated rows. Repeat under a filter.

## Priority 2: sign-in smoke test

On the same edge build, sign in as admin and student, refresh, sign out, and sign in again. Confirm correct redirects and dashboard/profile loading. Wrong credentials show normal feedback; successful sign-ins do not produce timeout events. If a controllable stalled profile/network test is available, verify the documented diagnostic event in the Sentry project configured for that deployment, without logging credentials. See `docs/operations/auth-diagnostics.md` for stages and expected timing.

## Report format

Return the deployed commit/URL, dataset pool count, account roles, pass/fail for each priority-1 case, automated-check results, and observed large-catalog response times. For failures include exact steps, pool IDs, HTTP status/code, and a screenshot or sanitized response. State explicitly whether the edge release is ready for production; do not merge to production as part of QA.
