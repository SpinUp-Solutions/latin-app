# Dashboard Loading Performance Report - Outstanding Issues

## Client-Side Issues

### C1 — Auth chain is fully serial before fetch can start
- `onAuthStateChanged` resolves from IndexedDB/token refresh
- Firestore `users/{uid}` snapshot must resolve before `setUser` is dispatched
- No persistent cache configured → hits network on every fresh load
- **Impact**: One full Firestore round trip on critical path for no data reason

### C2 — Monolithic blocking request + full-screen spinner
- Learning path (above the fold) held hostage by practice categories, mock tests, and score trends (below the fold)
- Page blocks all rendering on `loading || !user || lessonsLoading`
- **Impact**: Users perceive total sum of all loading phases

### C3 — No cross-load caching
- RTK Query cache is in-memory only
- Every fresh page load starts empty
- No stale-while-revalidate or prefetching after login
- **Impact**: Cold start every time user navigates to dashboard

### C4 — Eager getMessaging() / getAnalytics() on every page load
- Firebase SDK eagerly initialized at import time (src/services/firebase.ts:36-37)
- Adds script/network work to critical path for no dashboard benefit
- **Impact**: Unnecessary network/work on every load

## Server-Side Issues

### S1 — Sequential phases that could be parallel
- `getDashboard` (student-dashboard-service.ts:542-567) has strict sequential awaiting after initial `Promise.all`
- Phases 2-4 (attempt summaries, practice enrichment, mock listing) are independent but run one-after-another
- **Impact**: 4-7 avoidable sequential round trips per load

### S2 — N+1 patterns
- `getAttemptSummary` per test = 4 Firestore RPCs each (count, best, latest, session doc)
- `listStudentLiveMocks` calls `getVersionSummaries([mock.versionId])` per mock with single ID instead of batched `getAll`
- ~6 RPCs/mock for version lookups
- `getRelatedLiveMocks` fetches versions per mock just to validate

### S3 — Global, cacheable data refetched per student
- Learning path doc, all placed unit summaries (`getAll + versions getAll`), live lesson summaries
- Identical for every student but read from Firestore on every dashboard load
- No in-memory caching

### S4 — Unbounded progress read
- `getProgressByLessonId` fetches all of a student's progress docs with no field mask
- Includes full `exerciseProgress` arrays embedded into every lesson summary
- Grows with student activity

### S5 — Cold starts
- Each cold instance pays: firebase-admin init + service-account token exchange, verifyIdToken cert fetch, gRPC connection setup
- Serial waterfall in S1 amplifies this

## Recommendations to Implement

1. **Parallelize phases in getDashboard**: Run attempt summaries, practice enrichment, and mock listing in one `Promise.all`
2. **Batch mock version lookups**: Single `getAll` instead of per-mock `getVersionSummaries`; drop validation-only fetch in `getRelatedLiveMocks`
3. **Start dashboard query as soon as uid is known**: From auth state, not after user-doc snapshot
4. **Split endpoint or render progressively**: Learning path first (fast), practice/mocks below the fold in parallel with skeletons
5. **Cache learning path + unit summaries server-side**: They're global; add field mask to progress query
6. **Denormalized per-student/per-test attempt-summary doc**: Written at submit time, replacing 4-query `getAttemptSummary` fan-out
7. **Lazy-load Firebase Messaging/Analytics**: Dynamic import after idle
8. **Persist/rehydrate RTK Query cache**: Or prefetch dashboard right after login for instant paint with background revalidation

## Suggested First Step
Add lightweight timing around the phases in `getDashboard` (and check hosting cold-start behavior) to confirm how the ~10-14 round trips split between auth, queries, and cold start.