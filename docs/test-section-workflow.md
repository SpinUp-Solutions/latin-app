# Test section workflow

New normal and mock attempts receive the server-owned `flowVersion: 1`. An absent
version selects the original workflow, including its translation grading and
submission APIs. Unsupported versions fail closed. No existing attempts need a
migration; retakes naturally start with the new workflow.

## State and delivery

The frozen authored page order is the section order. Confirmed pages form a
contiguous prefix; the first unconfirmed page is active. Each page stores an
answer revision and an answering, review, confirming, or confirmed phase.
Confirmation timestamps are retained privately on submission.

Every in-progress student response projects only the active page, its sanitized
prompts, resolved generated questions, supporting resources, and answers. Progress
counts are aggregate metadata. Other pages, answer keys, private grades, leases,
and fingerprints never enter this contract. Submitted review uses the existing
private frozen review snapshot and scoring rules.

## Writes and recovery

- Answer saves include the active page ID, expected revision, and UUID mutation
  ID. Exact retries are idempotent throughout the editable section. Conflicting payloads, stale revisions,
  future pages, and locked pages are rejected. A successful save returns the new
  revision; the client serializes later writes against it. Private retry receipts
  are discarded once the section locks and remain subject to the document size
  safeguard while editable.
- `PATCH /api/test-attempts/:attemptId/sections/:pageId` persists answering or
  review with an expected revision. Browser refresh restores this phase.
- `POST /api/test-attempts/:attemptId/sections/:pageId/confirm` includes an expected
  revision, UUID request ID, and explicit acknowledgement of unanswered parts.
  It returns `202` while grading is pending, otherwise the next section or the
  submitted attempt. Final confirmation and submission share one transaction.
- `GET /api/test-attempts/:attemptId` refreshes authoritative state after a lost
  response or conflict. Stale-tab conflicts stop replay and retain unsaved text
  for recovery. Responses belonging to an obsolete client scope are ignored.

Review edits preserve other fields. Saving is flushed before phase changes,
confirmation, and explicit exit. Completing the page never navigates automatically:
the student presses `Review section` when ready, including after returning to a
completed page or resuming it. Content-only sections still need explicit
confirmation. Existing practice, authoring preview, and legacy attempts keep
their original exercise behavior.

Multiple-choice selections save as drafts immediately. `Submit Answer` marks the
exercise finished after the student has selected all intended options; there is
no additional per-answer confirmation. Saved selections remain editable on resume.

## Hidden translation grading

Confirmation reserves a fingerprint of the frozen page and its answers in a
transaction. Each request grades at most one nonblank, uncached translation
outside the transaction, using the existing test rubric and model policy. Provider
work is bounded to 90 seconds within a 120-second route, with SDK retries disabled
for these calls. Durable per-item request windows survive edits and failures.

A private checkpoint requires the same reservation token, fingerprint, and answer
revision. Concurrent callers join the active lease; expired leases are recoverable
and replaced tokens reject late responses. After a checkpoint, the next request
continues grading or confirms the page. Blank translations require no provider
call. Unchanged cached grades survive retries and only changed translations lose
their grades.

Failure releases only the caller's reservation and permits returning to review.
No feedback is exposed before submission. A response lost before its grade is
persisted can require another provider call. Duplicate final confirmation returns
the submitted result without repeating completion or mock-result writes.

## Verification

`testSectionWorkflow`, `testSectionRoutes`, `testSectionAnswerBuffer`,
`testSectionRecovery`, `testSectionReview`, and `testSectionAutoAdvance` cover the
new contracts, concurrency, failure recovery, private payloads, and student UI.
The buffer tests use a real RTK Query store. The emulator-backed assessment
journeys exercise normal and mock section flows, including mobile review,
refresh, locked writes, omissions, results, and browser navigation.
