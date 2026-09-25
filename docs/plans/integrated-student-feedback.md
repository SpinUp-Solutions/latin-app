# Integrated student feedback: approved implementation plan

## Authority and execution

The user approved implementation after PDF/repository discovery and product questions. This document records those decisions; important uncovered product decisions must be surfaced, not silently chosen.

- Primary agent: orchestrator, integration, verification, coordination and review.
- Implementation workers: **GPT-6 Sol, high reasoning**.
- Discovery and simple investigations: **GPT-6 Luna, xhigh reasoning**.
- **All Git/GitHub operations, including final commit: GPT-6 Luna, xhigh reasoning**.
- Parallel independent correctness/regression and security/privacy reviews after integration; address findings before delivery.
- Start from latest `origin/edge`; feature branch `harry/integrated-student-feedback`. Refetch/reconcile before final delivery. PR base is `edge`.
- Preserve unrelated `firepit-log.txt`. No production mutations, migrations or cloud deployment. Delivery is a tested committed/pushed PR.

Execution update: the user subsequently instructed the primary agent to finish directly, stop spawning subagents and stop Playwright runs. That later instruction supersedes the delegation and browser-verification steps below for the remaining delivery work. Preserve completed review and test evidence; do not launch further browser checks.

## Accepted product decisions

### Access and entry points

1. Authenticated accounts of every role may submit. No guest/anonymous feedback.
2. Standalone `/feedback`; change existing dashboard banner/footer links from Google Forms to this route.
3. A modest permanent labeled Feedback button in the real student lesson player's header opens an in-place dialog, fullscreen on small viewports. Do not expose it in admin preview or tests.
4. Keep the lesson player mounted and preserve page, answers and progress. Pause audio on opening and suspend auto-advance; do not resume audio automatically.
5. Login may return specifically to `/feedback`, using a narrow allowlist. Preserve existing default redirects and reject arbitrary return URLs.
6. Future reports only. No historical Google Form import. Existing distributed Google-owned links cannot be redirected through application code.

### Original form and validation

The attached four-page PDF contains these seven questions (pages three/four have no additional fields):

- Required feedback type: Bug report, Feature suggestion, General feedback.
- Bug reports only: required severity, Blocking (cannot continue), Major (broken with workaround), Minor (visual/usability).
- Required multi-select area: Lessons / lesson content; Exercises (multiple choice, translation, drag & drop, etc.); Vocabulary viewer / dictionary; Dashboard / progress tracking; Account / login; Performance / loading speed; Other.
- Required issue/suggestion description.
- Optional screenshot or screen recording.
- Optional overall experience, integer 1–5 (the original has no endpoint labels).
- Optional anything else/comments.

Implementation adds required plain-text Other explanation when selected, optional lesson and approved media. Description maximum 10,000 characters, comments maximum 5,000, short bounded Other explanation. Trim outside whitespace, preserve line breaks, show counters. No preselected type, severity, rating or areas. Clear irrelevant severity/Other data when controls become inapplicable. Feedback is escaped plain text; authored lesson titles use existing rich-display components.

### Lesson association and identity

- Optional lesson, explicit “Not about a specific lesson.” Generic selector searches lessons currently accessible to the account: unlocked normal lessons and live practice lessons; exclude tests, unpublished/inaccessible lessons and `_deletionPending`.
- Lesson entry preselects the real lesson ID and records current page ID/index plus revision. The student may change or clear the lesson; changing clears page context.
- Revalidate access/existence/revision in the final submission transaction. Use the existing transaction-aware progression access helper rather than reproduce access logic.
- On stale/deleted/inaccessible context retain the draft and offer refreshed context, another lesson, or no lesson.
- Preserve minimal historical title/page snapshots alongside IDs for later renames/deletion. Show current title when available; admin Preview/Edit links, disabled with explanation for missing content. No historical content replay or exercise-specific targeting.
- Derive UID and available name/email snapshot on the server. Missing optional profile data must not block an authenticated submission. Explain to students that admins see this information.
- Diagnostics are limited to entry point, app version, browser, viewport and relevant route. Never capture answers, authentication tokens, full query strings, DOB or automatic screenshots.

### Attachments, drafts and success

- Up to **5 files/report**, **10 MiB/image**, **100 MiB/video**, **200 MiB/report**. UI states consistent units.
- Images: PNG, JPEG, WebP. Video: MP4, WebM, MOV. No daily upload byte quota.
- No HEIC/GIF/PDF/audio/office/archive/executable/HTML/SVG; no recording/transcoding/antivirus service. Signature checks do not constitute malware scanning. Unsupported MOV playback offers download.
- File picker, drag/drop, pasted images. Per-file progress, processing, retry and remove. Do not silently submit without failed uploads; only ready or explicitly removed files.
- Draft stays in memory across closing/reopening the lesson dialog and request failures; warn before discarding on navigation. No reload persistence.
- Idempotent submission and sessions recover after lost responses. Ten successful reports/account/hour; replay does not consume another slot. This report-rate limit is distinct from the explicitly rejected daily byte quota.
- Success shows receipt/reference and Return to lesson / Back to dashboard; standalone also Submit another. No automatic redirects, email, promised response time, student history/status portal or editing submitted reports.

### Admin workflow

- Add `/admin/feedback` and `/admin/feedback/[feedbackId]` to the existing admin shell as a top-level Feedback area.
- Default unresolved, newest first, archived excluded. Server filters: status, type, severity, area, lesson, date. Exact submitter email/UID and direct feedback-ID lookup; no full-text search.
- Sort newest/oldest; stable cursor pagination, 25/page. Server applies filtering across the collection, never only loaded rows.
- List identity, lesson, timestamp, status, attachment count and excerpt. Include loading/error/retry/empty/no-results states and preserve filters when returning from detail.
- Detail shows full immutable report, identity, context, diagnostics, attachments and paginated activity; Preview/Edit lesson links where available.
- Every admin may resolve/reopen with optional reason, archive/unarchive independently, and add append-only private attributed timestamped notes. Keep status/archive history.
- Unresolved nonarchived navigation badge refreshes on focus/manual refresh/mutations; no background polling or notification delivery.
- Defer full-text, assignees, separate priority, editable categories, bulk actions, student replies, notifications and permanent deletion UI/privacy removal tooling.
- Submitted reports and media have **no automatic expiry**. Archive changes visibility only.

## Architecture and contracts

- Shared browser/server enums, Zod schemas, limits, API contracts and collection constants. Domain services in `src/lib/student-feedback`; thin authenticated validated Next routes, awaited dynamic params and `createRouteErrorResponse`.
- No new database, search service, design system or unrelated refactor. Follow root `AGENTS.md`.
- Firestore roots: `studentFeedback`, `studentFeedbackSessions`, `studentFeedbackThrottles`; session attachment subcollection and feedback activity subcollection.
- Report: schemaVersion/id, submitter UID and identity snapshot, original form fields, optional lesson ID/title/page/revision snapshot, verified attachment descriptors, diagnostics, server creation/update timestamp, unresolved/resolved state, resolution actor/time/reason, independent archive metadata and admin state revision.
- Attachment descriptor: ID, original name, canonical storage key, verified MIME, size, object generation. Never persist signed/download URLs.
- Session: owner-bound idempotent upload/submission state, expiry, selected reservations and final receipt relationship; no persistent draft feedback text.
- Attachment intents track exact reserved size/type, lifecycle, lease and canonical metadata. Activity is append-only documents, not a growing array on a report. Enforce the existing 900 KiB document safety margin.
- Use minimal snapshots deliberately for historical context, not full copies of users/lessons.

### API surface

- `GET /api/feedback/lessons` accessible lesson options/context.
- `POST /api/feedback/sessions` idempotent session allocation.
- `GET /api/feedback/sessions/[sessionId]` owner-bound state/receipt.
- Reserve/finalize/remove attachment routes below a session.
- `POST /api/feedback` transactionally submit and return receipt.
- `GET /api/admin/feedback` -> `{ items, nextCursor }`.
- `GET /api/admin/feedback/count`.
- `GET /api/admin/feedback/[feedbackId]` -> `{ feedback, currentLesson }`, with the current lesson title/reference separate from the immutable submission snapshot.
- Paginated activity, expected-revision state mutation, idempotent private-note and authorized attachment-access routes.
- Students can read unfinished own sessions and receipt only. No student final-detail/media-read route. Admin endpoints always use `verifyAdminAccess`; student endpoints verify token and ownership.
- Never accept client actor ID, canonical object key, resolution timestamp or initial admin state.

### Atomic submission and admin changes

All transaction reads precede writes. Submission reads owner/session first, returns an existing receipt on replay, verifies open/unexpired state and all selected attachments ready/owned, loads identity/quota, and validates lesson access/existence/deletion flag plus page/revision from the same transaction snapshot. Reuse `getLessonProgressAccessInTransaction` in `src/lib/learning-units/progression-access.ts`, including persisted progress and deliberate legacy normalizers. Create report and initial activity, consume quota and mark session submitted atomically.

Historical feedback relationships must not block lesson deletion or mutate lesson content. Fail closed on invalid persisted data with stable 409 codes. Other stable codes cover stale context, expired session, unfinished uploads, invalid media, report quota and admin revision conflict.

List ordering is creation timestamp plus document ID; cursors bind to filter/order. Use normalized exact-email/UID fields and indexed boolean area membership. Check in needed equality/composite/count/cleanup indexes; no all-document scan for admin filtering.

Admin state changes compare expected revision and return 409 on conflict. Notes use idempotency keys and are independent of report text/state revision.

RTK uses authenticated base query, first-page replacement and cursor append/deduplication. After mutations find affected list queries, await any running pagination request and explicitly refresh page one. Do not optimistically insert/reorder partially loaded lists. Reset feedback API/drafts on authentication/account changes.

## Storage protocol and security

Use the existing bucket with separate namespaces outside lesson content synchronization:

```
student-feedback/staging/{uid}/{sessionId}/{attachmentId}
student-feedback/private/{sessionId}/{attachmentId}
```

1. Backend transaction reserves exact MIME/bytes and enforces per-report count/total.
2. Browser uploads directly using Firebase `uploadBytesResumable` into staging; do not buffer videos in a Next route.
3. Finalize obtains a lease, inspects actual metadata/signature/size/generation, copies a generation-pinned source to a create-only canonical private object, strips/replaces Firebase download-token metadata, and records ready only if the session/lease still permits it.
4. Submission uses only verified ready descriptors. Retry/copy conflicts recover safely without overwrites. Stale workers cannot commit. Staging removal is retry-safe.
5. Authorized admin attachment access resolves report/attachment IDs using DB data and returns a short-lived generation-pinned URL with safe content disposition; response is private/no-store. Never call `getDownloadURL` for feedback.

Firestore rules explicitly deny direct feedback/session/throttle/activity/reservation access and exclude these root names from the existing permissive catchall. Storage permits only authenticated owner create-only staging writes (`resource == null`), open/unexpired session, and exact reserved MIME/size. At most two Firestore rule lookups: session plus attachment intent. No client staging reads/update/delete or direct canonical read/write; backend handles removals.

Constrain both legacy audio signing and deletion to canonical decoded `lessons/{lessonId}/content_audio/{basename}` paths, preserving existing audio extensions while rejecting traversal and other prefixes; otherwise the broad legacy signer would expose private feedback.

Sessions expire after 24 hours. Scheduled bounded cleanup transactionally claims abandoned sessions, respects/reclaims leases and cannot race a report commit. Delete known object generations retry-safely and keep tombstones at least seven days. Storage object-finalized guard removes late staging/canonical objects for missing/expired/cancelled intents while preserving committed report references; enable retries. No submitted media expiry.

Logs may contain operation IDs/stages/error codes, never report text/PII/signed URLs/credentials. Retain the existing admin maintenance-lock guard behavior without adding feedback to vocabulary-content synchronization.

## Implementation ownership and sequence

1. Foundation worker owns shared feedback contracts/constants/schema tests. Freeze contracts before parallel implementation.
2. Backend worker owns persistence/domain except attachment lifecycle, student/admin routes except attachment endpoints, Firestore rules/indexes and backend/rule tests.
3. Attachment worker owns lifecycle services/routes, upload hook, Storage rules, Functions cleanup/finalized guard, legacy audio restrictions, emulator configuration/package scripts and upload/storage tests.
4. UI worker owns standalone/dialog forms and lesson integration, login-return, admin navigation/list/detail/badge, RTK/store/auth reset and UI/cache/Playwright tests.
5. Each worker has explicit file ownership, preserves others' edits and coordinates shared changes through the orchestrator. Root handles plan/runbook and integration coordination. No worker performs Git operations.
6. Integration verification, parallel independent correctness/regression and security/privacy reviews, fixes and reruns of affected checks.

## Verification and delivery

- Schema/form conditional required fields, Other, boundaries, unicode, escaped HTML-looking text, keyboard/mobile and long text.
- Lesson access/stale/deleted contexts, association changes, player state/audio/auto-advance, login return, failed/lost-response submission replay.
- Backend 401/403, cross-owner/spoofing, missing/pending/locked/unpublished references, concurrent access changes, identity/timestamps/quota/idempotency, state conflicts, note replay, historical deletion.
- Upload count/type/size/aggregate/signature mismatch, retry/cancel/remove, direct access/overwrite/metadata/forged intent denial, lease/copy/crash replay, cleanup-versus-submit and late-upload races, token stripping/generation pinning and legacy audio bypass tests.
- Real RTK stores: first page, accumulated cursor, filtered and oldest lists, ties, in-flight pagination plus mutation, badge refresh/account reset.
- Local demo Firebase emulators only for test writes. Storage emulator cannot establish real GCS IAM/CORS/generation-copy/signed-URL behavior; mock unsupported service operations and document deployment verification explicitly.
- Run `npx tsc --noEmit`, targeted Jest then `npm test -- --runInBand`, `npm run lint`, `npm run build`, `npm run test:firestore-rules`, new Storage rules/integration tests, Functions TypeScript build, feedback Playwright plus assessment regressions, and Luna-run `git diff --check`.
- Runbook covers bucket IAM/public-access/region/CORS checks, rules/indexes, cleanup/trigger retries, deployment sequence with audio fixes, private upload/admin-download/cleanup smoke checks, costs and known limitations. No cloud deployment in this task.
- Luna xhigh refetches latest edge, reconciles changes and obtains rerun checks where needed, commits, pushes and opens PR against `edge`. Attach PR to this task and inspect CI.
- PR describes implementation, student/admin flows, model/API changes, Firebase/Storage/rules/lifecycle changes, major decisions, actual checks, screenshots, deployment prerequisites and limitations.

Done means all agreed student/admin flows and permissions work, relevant checks pass, independent review findings are addressed, and a PR targeting the latest `edge` is created. Do not claim completion from implementation alone.
