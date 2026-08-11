# Production content to development sync

This is a deliberately manual admin CLI. It mirrors the approved content subset from `latin-app-prod` into `latin-app-dev`; it is not exposed as a web-admin button or route.

## Non-negotiable boundary

- `latin-app-prod` is the hard-coded, read-only source. The command never calls a Firestore, Storage, Auth, IAM, bucket-policy, or project-configuration write against production.
- `latin-app-dev` is the only writable project. Project, bucket, database, and emulator overrides are rejected.
- Firebase Auth, `users`, `userProgress`, `attempts`, `requests`, migration records/snapshots, `words-latin-dev`, all preserved fixture collections, and Storage outside `lessons/**` are excluded from the write plan.
- The exact Storage object `lessons/` is accepted only as a zero-byte folder marker and is ignored during capture, hashing, planning, backup, apply, rollback, and verification. A non-zero `lessons/` object, a near-match such as `lessons`, or any other out-of-scope object presented as controlled content remains a hard validation failure.
- A dev-only lesson fixture whose pool/word ID collides with different production data is preserved through deterministic `dev-fixture-*` clones. The plan rewrites only the preserved lesson and cloned pool, records the remaps in the hashed audit, and backs up those writes normally. It never rewrites `practiceCategoryMemberships`, `testVersions`, or `testVersionDrafts`; a collision requiring a protected-collection edit remains a hard failure.
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

Current validation and recovery evidence (2026-08-04): the production repair was confirmed; production has no empty pool-reference strings and the formerly missing pool reference is no longer present at the previously reported paths. After ignoring only the confirmed zero-byte development `lessons/` marker and deterministically isolating one real fixture pool/word collision, the authenticated dry run completed with plan hash `9acb127ec745b7051bb24c711c84aec2221ba19ae813746304d525a4751b13d0`. The first explicitly authorized apply created the private development backup bucket and captured all 2,022 Firestore plus 24 Storage before-image entries, then Firestore rejected its first oversized transaction. The durable failed run is `20260804122903-b5209ea94c16`. A read-only recapture proved that no Firestore operation committed, the protected-data fingerprint was unchanged, and only the five planned source-identical Storage creates had committed. Transaction chunking was reduced to conservative limits with exact-error adaptive halving. The failed apply was not retried under the old authorization.

After a separately reviewed dry run and explicit authorization for replacement plan `456add3f45f635a6ee3166ac7744be45cc96a9d68cbc17eef91c807869aa4cb3`, run `20260804124727-7ec2067e25f5` applied and verified successfully. Its actual post-sync content fingerprint exactly matched the projected fingerprint `900cfa380b8c5dc4fbac89f42b48b712eec1a7160a29b10dfaf525279317dbc3`; production did not drift during the run. The independent verifier passed exact manifest/content, mirrored content, strict learning-path/reference graph, protected-data, Auth, controlled-Storage checksum, and source-readability checks with zero failures. A final read-only dry run reported zero Firestore and zero Storage mutations. The rollback token is retained only in approved local secret handling and is not present in this runbook or the durable run manifest.

## Apply — explicit authorization only

Do not apply as part of validation. Apply only after an authorized operator has reviewed the dry-run JSON and exact `planHash`:

```bash
node scripts/sync-prod-content-to-dev.mjs --apply --plan-hash <64-character-planHash>
```

Apply captures the source and target again and rejects a stale plan hash or any source/target drift. It creates before-images for every affected development document/object in the private backup bucket before opening the first mirror write. Firestore writes use conservative read-then-transaction chunks of at most 100 writes and 1.5 MiB of canonical document payload, with exact existence/update-time preconditions and full document replacement. If Firestore still reports that a transaction is too large because of server-side/index overhead, only that exact size error causes the chunk to be halved and retried. Storage before-images record metadata/content hashes and a deterministic byte hash; rollback validates those plus the Firestore `dataHash` before restoring anything.

Write order is:

1. source `lessons/**` Storage creates/updates;
2. `vocabulary_words_v5` creates/updates;
3. `vocabulary_pools` creates/updates;
4. lesson/test overlay creates/updates;
5. stale mirrored Firestore and Storage deletions;
6. `learningPaths` last.

Immediately after the private hash-only run manifest is durable—and before the first content mutation—the apply command emits a `sync-rollback-authority` JSON event on stderr containing the `runId` and one-time `rollbackToken`. Capture that event and store the token in the operator’s approved secret handling system before allowing the command to continue unattended. The final result does not repeat the token. It is never stored in the run manifest; only its hash is stored.

The primary sync lock has a 24-hour crash lease while it is still explicitly marked `manifestDurable: false`. After that lease expires, create and review a fresh dry-run plan; its explicitly authorized apply may atomically reclaim only that expired, provably pre-mutation lock and then revalidates mirrored development state while holding the new lock. Once the rollback-authority event is emitted, the lock is armed with `manifestDurable: true` before the first mutation and is never automatically reclaimed; use the emitted token and the supported rollback-recovery command instead.

If apply fails after the first possible cross-service mutation, it emits the one-time token in the structured `APPLY_RECOVERY_REQUIRED` error, marks the durable run `recovery-required`, and retains its owner-identified development lock. If persisting that failure transition also fails, the durable run may still say `backed-up`; the same exact rollback token plus the retained run owner lock authorizes the same hash-validated recovery path. The rollback dry-run accepts either state only when every affected document/object still matches either its recorded pre-operation hash or planned post-operation content hash. Use the normal token-authorized rollback apply to restore it. Unrelated progress, Auth, and excluded-data drift is preserved and reported observationally; unrelated drift in an affected resource fails closed.

The run manifest is durable at `runs/<runId>/run-manifest.json` in the backup bucket. It records the plan, source/target fingerprints, protected-data fingerprints, backup entries, source drift observation, and verification state without copying raw production data into a Firestore collection.

## Verification

```bash
node scripts/sync-prod-content-to-dev.mjs --verify --run-id <runId>
```

Verification is read-only and reports machine-readable `checks`, `failures`, and a human-readable status through the JSON fields. It verifies:

- the recorded mirrored-content fingerprint (mirrored Firestore plus controlled lesson Storage);
- strict learning-path fields, IDs, and cross-document references;
- Storage checksums for controlled objects;
- excluded development Firestore/Storage drift as an observation;
- Firebase Auth drift as an observation;
- source readability and source drift since apply.

Source drift after the run is reported as best-effort observation and does not rewrite production or development.

## Rollback — dry-run by default

First inspect the rollback plan:

```bash
node scripts/sync-prod-content-to-dev.mjs --rollback --run-id <runId>
```

Rollback validates every affected resource against its recorded pre-operation or planned post-operation hash. Unrelated progress, Auth, excluded data, and unaffected authoring drift do not prevent recovery and are not overwritten. To authorize the live restore, provide both the explicit apply flag and the token printed by the original apply:

```bash
node scripts/sync-prod-content-to-dev.mjs --rollback \
  --run-id <runId> \
  --apply \
  --rollback-token <rollbackToken>
```

Rollback restores only the selected run’s before-images, with current-generation/update-time preconditions. It never reads production and never touches Auth or excluded collections. The command verifies every affected resource against its exact before-image hash before marking the run `rolled-back`; a full pre-sync fingerprint match is reported separately.

If rollback itself stops after a mutation, it records `rollback-recovery-required` and retains a stable run-bound recovery lock. Re-run the same rollback dry-run and token-authorized apply; already restored resources are accepted only at their recorded pre-operation hashes, while remaining resources must still match their planned post-operation hashes. The run lock contains one exclusive attempt lease, so concurrent retries fail closed; a caught failure releases only its own attempt, and an abandoned process can be reclaimed after the lease expires. A retry can therefore recover the same stable owner even when a prior cross-service manifest update failed after the lock transaction. Each retry still uses a distinct revision operation ID. Legacy schema-v3 Storage audits are upgraded and durably journaled with same-domain content hashes before the first rollback write. Local pool/word concurrency counters are excluded from business-content comparisons and rebased from the development target on sync writes, while exact before-image hashes retain them for rollback integrity. Final unlock is owner-checked and idempotent across an ambiguous Firestore response. The lock is released only after affected resources are restored and the rolled-back manifest is durable.

## Audit artifact schema

The dry-run audit and durable run manifest use these stable top-level concepts:

```text
schemaVersion       integer format version
tool                sync-prod-content-to-dev
mode                dry-run | apply | verify | rollback-dry-run | rollback-apply
source              hard-coded project, bucket, manifestHash, contentFingerprint
target              hard-coded project, bucket, pre/post fingerprints, expected projected-content fingerprint, Auth/exclusion fingerprints
fixtureClosure      preserved IDs/prefixes plus deterministic remaps and affected mutable fixture lessons
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
3. confirm that any `lessons/` object is exactly zero bytes before it can be treated as the non-content folder marker; stop on any other scope violation;
4. run the default dry-run and save the JSON audit;
5. review validation, closure, fixture remaps, affected lesson IDs, protected-scope, and storage summaries;
6. ask for explicit user authorization before `--apply`;
7. retain the returned `planHash`, `runId`, and rollback token securely;
8. run `--verify` after apply and preserve the artifact for audit;
9. use rollback dry-run first and require both token and post-sync fingerprint match for rollback apply;
10. never call an Auth write, production write, migration/snapshot write, or unrelated Storage operation.

## Cleanup and retention plan

After the migration has been accepted in development and the edge workflow no longer needs the mirror:

1. retain successful run manifests and before-images for at least 30 days, or the organization’s longer audit-retention requirement;
2. require a named owner to confirm no rollback or audit investigation remains open;
3. export the final audit summaries (not secrets or raw Auth data) to the approved change record;
4. remove the CLI and local skill only after the production-content migration is formally closed and the cleanup change is reviewed;
5. delete the dedicated backup bucket only after the retention period and rollback hold have expired, using an explicit separately reviewed operation;
6. if the bucket remains, its 7-day soft-delete and 30-day lifecycle policy must remain enforced and periodically checked.

The CLI itself does not automatically delete the bucket or any audit artifact.
