# Production content to development sync

This is a deliberately manual admin CLI. It mirrors the approved content subset from `latin-app-prod` into `latin-app-dev`; it is not exposed as a web-admin button or route.

## Non-negotiable boundary

- `latin-app-prod` is the hard-coded, read-only source. The command never calls a Firestore, Storage, Auth, IAM, bucket-policy, or project-configuration write against production.
- `latin-app-dev` is the only writable project. Project, bucket, database, and emulator overrides are rejected.
- Firebase Auth, `users`, `userProgress`, `attempts`, `requests`, migration records/snapshots, `words-latin-dev`, all preserved fixture collections, and Storage outside `lessons/**` are excluded from the write plan.
- No credentials, raw Auth users, or raw source records are printed or placed in audit manifests. Apply intentionally emits a one-time `rollbackToken`; handle it as a secret and only its hash is stored in the run manifest. Auth is represented by a one-way fingerprint only.

## Prerequisites

Use an operator identity with:

1. read access to the production and development Firestore default databases and Storage buckets;
2. Auth user-list read access in both projects;
3. write access only to the development mirrored collections and the private backup bucket when applying;
4. permission to create/update the explicitly named development backup bucket when using `--setup-backup` or `--apply`.

Use Application Default Credentials, for example:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project latin-app-dev
```

The ADC quota project, if present, must be `latin-app-prod` or `latin-app-dev`. The command also verifies that both Firestore default databases are in `nam5`. Do not set emulator endpoints, project overrides, or a production ADC quota project that is not approved for this operation.

The private backup bucket is fixed as:

`latin-app-dev-prod-content-sync-122256273781`

It must be in `US`, use uniform bucket-level access, enforce public access prevention, retain soft-deleted objects for 7 days, and delete objects after 30 days. `--setup-backup` is the explicit provisioning command; dry-run never provisions or writes this bucket.

## Read-only inspection and dry-run

From the repository root:

```bash
npm ci
node scripts/sync-prod-content-to-dev.mjs > /tmp/prod-content-sync-plan.json
```

The default command is read-only. It captures stable source and target manifests, validates schemas and references, computes the fixture dependency closure, and emits one machine-readable JSON audit object. `planHash` is the approval/precondition token for the exact source and target state inspected.

Inspect the result without exposing document contents:

```bash
node -e "const p=require('/tmp/prod-content-sync-plan.json'); console.log(JSON.stringify({planHash:p.planHash,source:p.source,target:p.target,fixtureClosure:p.fixtureClosure,firestore:p.firestore.summary,storage:p.storage.summary},null,2))"
```

The plan shows `create`, `update`, `delete`, and `preserve` operations. `preserve` includes unchanged production content and dev fixture content retained by the closure. A missing or ambiguous fixture dependency, invalid learning path, missing checksum, source reference failure, or protected-scope violation exits non-zero and produces a structured error.

Current read-only validation evidence (2026-08-03): the authenticated inspection saw production counts of 93 lessons, 1 learning path, 88 pools, 1,765 words, and 5 `lessons/**` Storage objects; development had 38 lessons, 1 learning path, 11 pools, 1,170 words, 13 practice memberships, 3 test versions, 1 test-version draft, and 20 `lessons/**` objects. The plan stopped before producing a `planHash` because `lessons/lesson-1763487236530` references missing production pool `nQ7R0Z772t1hPo05J9cK` inside a nested generator configuration. This is an intentional fail-closed result; no apply, setup, or other live write was run.

## Apply — explicit authorization only

Do not apply as part of validation. Apply only after an authorized operator has reviewed the dry-run JSON and exact `planHash`:

```bash
node scripts/sync-prod-content-to-dev.mjs --apply --plan-hash <64-character-planHash>
```

Apply captures the source and target again and rejects a stale plan hash or any source/target drift. It creates before-images for every affected development document/object in the private backup bucket before opening the first mirror write. Firestore writes use read-then-transaction chunks of at most 399 writes and 7.5 MiB, with exact existence/update-time preconditions and full document replacement. Storage before-images record metadata/content hashes and a deterministic byte hash; rollback validates those plus the Firestore `dataHash` before restoring anything.

Write order is:

1. source `lessons/**` Storage creates/updates;
2. `vocabulary_words_v5` creates/updates;
3. `vocabulary_pools` creates/updates;
4. lesson/test overlay creates/updates;
5. stale mirrored Firestore and Storage deletions;
6. `learningPaths` last.

The result contains a `runId`, the post-sync fingerprint, and a one-time `rollbackToken`. Store that token in the operator’s approved secret handling system. It is not stored in the run manifest; only its hash is stored.

The run manifest is durable at `runs/<runId>/run-manifest.json` in the backup bucket. It records the plan, source/target fingerprints, protected-data fingerprints, backup entries, source drift observation, and verification state without copying raw production data into a Firestore collection.

## Verification

```bash
node scripts/sync-prod-content-to-dev.mjs --verify --run-id <runId>
```

Verification is read-only and reports machine-readable `checks`, `failures`, and a human-readable status through the JSON fields. It verifies:

- the recorded post-sync manifest and content fingerprints;
- strict learning-path fields, IDs, and cross-document references;
- Storage checksums for controlled objects;
- unchanged excluded development Firestore/Storage fingerprints;
- unchanged Firebase Auth fingerprint;
- source readability and source drift since apply.

Source drift after the run is reported as best-effort observation and does not rewrite production or development.

## Rollback — dry-run by default

First inspect the rollback plan:

```bash
node scripts/sync-prod-content-to-dev.mjs --rollback --run-id <runId>
```

Rollback refuses to proceed unless current development exactly matches that run’s recorded post-sync manifest. To authorize the live restore, provide both the explicit apply flag and the token printed by the original apply:

```bash
node scripts/sync-prod-content-to-dev.mjs --rollback \
  --run-id <runId> \
  --apply \
  --rollback-token <rollbackToken>
```

Rollback restores only the selected run’s before-images, with current-generation/update-time preconditions. It never reads production and never touches Auth or excluded collections. The command verifies the restored development content fingerprint before marking the run `rolled-back`.

## Audit artifact schema

The dry-run audit and durable run manifest use these stable top-level concepts:

```text
schemaVersion       integer format version
tool                sync-prod-content-to-dev
mode                dry-run | apply | verify | rollback-dry-run | rollback-apply
source              hard-coded project, bucket, manifestHash, contentFingerprint
target              hard-coded project, bucket, pre/post fingerprints, expected projected-content fingerprint, Auth/exclusion fingerprints
fixtureClosure      preserved lesson/pool/word IDs and storage lesson prefixes
validation          projected counts and pass/fail result
firestore           operation list + create/update/delete/preserve summary
storage             operation list + create/update/delete/preserve summary
planHash            SHA-256 precondition over canonical source/target/closure/operations
runId               apply-run identifier (durable manifest only)
beforeImages        backup entries, original IDs/names, hashed artifact paths, generations/update times, data/content/byte hashes (durable manifest only)
sourceDriftAfterRun best-effort source before/after manifest comparison
```

Raw Firestore data is stored only in encoded before-image artifacts needed for rollback. Artifact path segments are SHA-256 keys; original document/object paths remain in the manifest and artifact metadata for audit. Hashes are canonical SHA-256 values, with Storage byte hashes computed over the exact downloaded bytes; object keys are sorted and arrays preserve semantic order.

## AI-agent checklist

Before proposing or running this task, an agent must:

1. read this runbook and inspect the current branch/package scripts;
2. confirm the source/target constants and reject all project overrides;
3. run the default dry-run and save the JSON audit;
4. review validation, closure, protected-scope, and storage summaries;
5. ask for explicit user authorization before `--apply`;
6. retain the returned `planHash`, `runId`, and rollback token securely;
7. run `--verify` after apply and preserve the artifact for audit;
8. use rollback dry-run first and require both token and post-sync fingerprint match for rollback apply;
9. never call an Auth write, production write, migration/snapshot write, or unrelated Storage operation.

## Cleanup and retention plan

After the migration has been accepted in development and the edge workflow no longer needs the mirror:

1. retain successful run manifests and before-images for at least 30 days, or the organization’s longer audit-retention requirement;
2. require a named owner to confirm no rollback or audit investigation remains open;
3. export the final audit summaries (not secrets or raw Auth data) to the approved change record;
4. remove the CLI and local skill only after the production-content migration is formally closed and the cleanup change is reviewed;
5. delete the dedicated backup bucket only after the retention period and rollback hold have expired, using an explicit separately reviewed operation;
6. if the bucket remains, its 7-day soft-delete and 30-day lifecycle policy must remain enforced and periodically checked.

The CLI itself does not automatically delete the bucket or any audit artifact.
