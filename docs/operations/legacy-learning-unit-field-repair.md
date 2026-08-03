# Legacy learning-unit field repair runbook

This is a one-time production repair for three known lesson documents. The endpoint is intentionally restricted to `latin-app-prod` and accepts only a short-lived OAuth access token from a Google identity that already has these IAM permissions on that project:

- `datastore.entities.get`
- `datastore.entities.list`
- `datastore.entities.update`

The operation can delete only `published`, `introduction`, `introduction_backup`, `exercises`, and `exercises_backup` from the three hard-coded targets. It does not replace lesson content.

## Prerequisites

- Deploy the PR to the production application.
- Install and authenticate `gcloud`, `curl`, and `jq` on the operator machine.
- Set `PROD_BASE_URL` to the production application's origin, without a trailing slash.
- Confirm `gcloud auth list --filter=status:ACTIVE` shows the intended operator.

No static migration secret or Firebase password is needed. Each request uses a short-lived token from `gcloud auth print-access-token`; the endpoint independently checks the token identity and its production IAM permissions.

## 1. Dry run

```bash
PROD_BASE_URL='https://replace-with-production-origin.example'
access_token="$(gcloud auth print-access-token)"
dry_run="$(curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${access_token}" \
  --header 'Content-Type: application/json' \
  --data '{"mode":"dry-run"}' \
  "${PROD_BASE_URL}/api/admin/lessons/repair-legacy-fields")"

printf '%s\n' "${dry_run}" | jq .
printf '%s\n' "${dry_run}" | jq --exit-status '
  .mode == "dry-run"
  and (.planHash | test("^[a-f0-9]{64}$"))
  and (.targets | length == 3)
  and ([.targets[].status] | all(. == "repair-required" or . == "clean"))
  and (.projectedVerification.allUnitCount == .projectedVerification.validUnitCount)
  and (.projectedVerification.pathUnitCount == .projectedVerification.validPathUnitCount)
'
```

Review every target ID, update time, status, and removed-field list. A dry run projects the field deletions in memory and then validates every learning-unit document and every active Learning Path unit with the production application schema. It performs no write and creates no backup.

## 2. Apply the reviewed plan

The apply call requires the exact `planHash` returned by the dry run. Any target update between the two calls changes the hash and aborts the migration. Apply also creates a durable before-image in the protected production Storage bucket before opening the Firestore transaction.

```bash
plan_hash="$(printf '%s\n' "${dry_run}" | jq --exit-status --raw-output '.planHash')"
access_token="$(gcloud auth print-access-token)"
apply_result="$(curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${access_token}" \
  --header 'Content-Type: application/json' \
  --data "$(jq --null-input --compact-output \
    --arg planHash "${plan_hash}" \
    '{mode:"apply", planHash:$planHash, confirmation:"APPLY_LEGACY_LEARNING_UNIT_FIELD_REPAIR"}')" \
  "${PROD_BASE_URL}/api/admin/lessons/repair-legacy-fields")"

printf '%s\n' "${apply_result}" | jq .
printf '%s\n' "${apply_result}" | jq --exit-status '
  .mode == "apply"
  and (.applied == true or .reason == "All target documents were already clean")
  and (.verification.allUnitCount == .verification.validUnitCount)
  and (.verification.pathUnitCount == .verification.validPathUnitCount)
'
```

Record the returned snapshot path and the complete JSON response in the incident or deployment record.

## 3. Verify through the application

This call is read-only. It returns HTTP 409 while any target still needs repair, so `curl --fail-with-body` also makes it useful in an automated check.

```bash
access_token="$(gcloud auth print-access-token)"
verify_result="$(curl --fail-with-body --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${access_token}" \
  --header 'Content-Type: application/json' \
  --data '{"mode":"verify"}' \
  "${PROD_BASE_URL}/api/admin/lessons/repair-legacy-fields")"

printf '%s\n' "${verify_result}" | jq .
printf '%s\n' "${verify_result}" | jq --exit-status '
  .verified == true
  and ([.targets[].status] | all(. == "clean"))
  and (.verification.allUnitCount == .verification.validUnitCount)
  and (.verification.pathUnitCount == .verification.validPathUnitCount)
'
```

## 4. Verify the production database independently

This does not use the application endpoint or its Firebase Admin credentials. `gcloud` supplies the current operator's OAuth token directly to the Firestore REST API. The field mask requests only the five retired fields; the final `jq` command fails if any lesson still contains one of them or if the response was paginated.

```bash
gcloud firestore databases describe \
  --project=latin-app-prod \
  --database='(default)' \
  --format='yaml(name,locationId,type)'

access_token="$(gcloud auth print-access-token)"
legacy_scan="$(curl --fail-with-body --silent --show-error \
  --header "Authorization: Bearer ${access_token}" \
  'https://firestore.googleapis.com/v1/projects/latin-app-prod/databases/(default)/documents/lessons?pageSize=300&mask.fieldPaths=published&mask.fieldPaths=introduction&mask.fieldPaths=introduction_backup&mask.fieldPaths=exercises&mask.fieldPaths=exercises_backup')"

printf '%s\n' "${legacy_scan}" | jq '{
  documentsScanned: (.documents | length),
  documentsWithLegacyFields: [
    .documents[]
    | select((.fields // {} | length) > 0)
    | {id: (.name | split("/") | last), legacyFields: (.fields | keys), updateTime}
  ]
}'

printf '%s\n' "${legacy_scan}" | jq --exit-status '
  (has("nextPageToken") | not)
  and ([.documents[] | select((.fields // {} | length) > 0)] | length == 0)
'
```

The current collection has fewer than 300 documents. If it grows beyond that before execution, replace the single list call with a paginated check rather than weakening the `nextPageToken` assertion.

## Cleanup plan

1. Save the dry-run, apply, application verification, and independent Firestore verification outputs with the deployment record. Keep the returned Storage snapshot path.
2. Exercise a normal Learning Path save and one edit of a formerly affected lesson.
3. Immediately after those checks and successful verification, open and deploy a cleanup PR that removes:
   - `/api/admin/lessons/repair-legacy-fields`;
   - `verifyGcloudProjectAccess.ts` if no other operation adopted it;
   - `legacy-field-repair-operation.ts` and its route/auth tests;
   - the local `repair:legacy-learning-units` command, its script, the migration-only planner/test, the `.prod-repair-backups` ignore entry, and `tsx` if it has no other consumer.
4. Keep the canonical learning-unit write boundary and its authoring/recovery/snapshot regression tests. Those are the permanent persistence fix. Monitor server errors for one business day after the migration and cleanup deployment.
5. Retain the protected before-image for 30 days. After a second independent Firestore verification and confirmation that no rollback investigation is open, delete that one explicit Storage object or retain it under the project's normal incident-retention policy.
6. Close the migration record with the cleanup deployment SHA, verification output, snapshot disposition, and confirmation that no long-lived migration secret was created.
