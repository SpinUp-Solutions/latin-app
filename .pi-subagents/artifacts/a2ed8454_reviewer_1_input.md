# Task for reviewer

[Read from: /Users/harry/Documents/dev/chris/latin-app/plan.md, /Users/harry/Documents/dev/chris/latin-app/progress.md]

Adversarial code review. Angle: AUTH, SECURITY BOUNDARIES, DESTRUCTIVE ADMIN OPERATIONS, INFRA.

Inspect the repository directly (run `git diff`, read files). Do NOT rely on any conversation summary. Current uncommitted diff on branch `misc` plus new untracked files is the review target.

Focus files:
- src/lib/verifyRequestAuth.ts (new)
- src/app/api/admin/progress/migrate-stable-ids/route.ts (new — admin backfill migration)
- src/app/api/admin/lessons/route.ts (added progression validation on PUT)
- src/app/api/admin/lessons/update-publish-status/route.ts (added progression validation)
- firestore.indexes.json (new category indexes added)
- firestore.rules (read it to check for new-collection rules)
- docs/practice-lesson-categorization.md (the plan)

Investigate specifically:
1. verifyRequestAuth now returns `null` on bad/missing token instead of throwing. Audit EVERY caller (progress GET/POST, complete route, any others). Does any caller forget the `!currentUser` null check and proceed to use currentUser.uid (crash/500)? Compare to the old verifyAuth that threw — are there other routes still using a throwing pattern inconsistently? Is returning null + generic 401 leaking whether a token was present vs invalid (timing/enum)?
2. Migration route (migrate-stable-ids): This is a destructive, full-collection admin operation. Check: dryRun default (`body.dryRun !== false` → defaults true only if key absent; if explicitly false it writes). confirmWrite gating. BATCH_SIZE logic: `pendingWrites >= BATCH_SIZE * 2` with `pendingWrites += 2` per doc — is the batching correct? Can the final `pendingWrites > 0` flush + the in-loop flush double-commit or miss a flush? Does it scan ALL userProgress AND ALL lessons on every call (cost/DoS)? Is the backup write to userProgressMigrationV2Backups unconditional and unbounded? Re-run safety/idempotency: a second run skips progressSchemaVersion===2 docs — but what about the backup collection growing unbounded? Is there any auth check that the caller is actually an admin (verifyAdminAccess) and is AdminAccessError handled at the right status code?
3. update-publish-status/route.ts: the new validation `if (isLive) { ... return 400 }` is INSIDE the `for (lessonId of lessonIds)` loop. Does returning mid-loop leave earlier lessons in the batch already published and later ones not (partial/inconsistent publish state)? Is this atomic? Same question for the admin PUT route validation.
4. firestore.indexes.json: three new composite indexes for `practiceCategories` and `practiceCategoryMemberships` were added, but per docs/practice-lesson-categorization.md the feature is ONLY a plan (Phase 0, no schema/code/rules implemented yet). Are these premature indexes? Does firestore.rules actually deny direct client access to these collections as the plan requires, or are they currently exposed/permissive? Flag the mismatch.
5. Does firestore.rules need new rules for the two new collections (plan says they must be server-only / denied to clients)? Read the current rules and report whether the new collections are protected or open.
6. Any PII / data exposure in the migration summary response (returns counts only — confirm no user data leaked)?

Return concise, evidence-backed findings with file:line references and suggested fixes. Prioritize by severity. This is review feedback, NOT a context summary. Do NOT edit any files.

---
**Output:**
Write your findings to exactly this path: /Users/harry/Documents/dev/chris/latin-app/.pi-subagents/artifacts/outputs/a2ed8454/review-security-infra.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.

## Acceptance Contract
Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```