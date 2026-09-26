# Student feedback operations

This feature replaces future Google Form submissions with authenticated in-app feedback. Historical Google Form responses are not imported. The external Google-owned form URL must be updated wherever it was distributed; changing application links cannot redirect that URL.

## Data and retention

Feedback, its upload sessions, activity and throttles are separate from lesson content and are not part of production-to-development content mirroring. Reports keep user/lesson IDs plus minimal historical identity/title/page snapshots. Renaming or deleting lesson content does not erase a submitted report or its attachments.

Submitted text and media do not automatically expire. Archiving only hides reports from the default admin queue. There is no student report history/edit endpoint or permanent deletion/privacy-removal UI in this release.

An account can submit ten reports per hour. A report accepts five files, up to 10 MiB per image, 100 MiB per video and 200 MiB overall. There is no daily byte quota. Operators should monitor storage/egress and submission volume; abandoned-upload cleanup does not cap retained submitted media.

New upload-session creation and cumulative cancelled reservations have no separate rate limit in this version. An authenticated caller can therefore accumulate bookkeeping records without submitting reports; the report limit does not prevent that. The security review identified separate session/reservation abuse controls as a product decision still awaiting confirmation.

## Before deployment

Use the intended Firebase project and bucket explicitly. This implementation task does not deploy rules, indexes, Functions or application code to a cloud environment.

1. Verify the application and cleanup Functions use the same intended bucket/project. Check bucket region compatibility with the Storage event trigger.
2. Inspect bucket IAM, object ACL/public-access settings and any existing lifecycle policies. Feedback's canonical namespace must not be publicly readable or subject to a blanket expiry policy that deletes submitted attachments. Security Rules cannot override public access granted through Cloud Storage IAM or legacy object ACLs.
3. Ensure the application's server identity and Functions service identity have the scoped permissions needed to read metadata, copy/create/delete feedback objects and access feedback Firestore records. The server must also be able to sign attachment URLs. Prefer existing service identity patterns; do not place service-account credentials in client variables.
4. Verify browser upload/CORS behavior against the actual application origins. Add only required origins/methods using the bucket's existing configuration workflow; do not replace unrelated CORS entries.
5. Deploy and wait for the feedback Firestore indexes to finish building before serving the admin filters.
6. Deploy Firestore rules with all feedback root collections excluded from the existing permissive fallback. Deploy Storage rules that allow only reserved owner staging uploads, never direct private reads/writes.
7. Enable the Storage rules' Firestore integration permissions if requested by Firebase during deployment. These checks read the owner session and reserved attachment documents.
8. Deploy scheduled abandoned-session cleanup and the retry-enabled Storage object-finalized guard before exposing uploads. Check scheduler/Eventarc permissions and retry configuration.
9. Deploy application code, including the restricted legacy audio signing/deletion paths. Do not expose uploads with an older unrestricted audio signer still serving traffic.

Use the project's normal review and deployment process. The steps above are deployment prerequisites, not evidence that the cloud environment has been inspected or changed.

## Media lifecycle

Browser uploads are resumable and write only to `student-feedback/staging/{uid}/{sessionId}/{attachmentId}`. A server reservation fixes the owner, accepted type and byte count before uploading. The backend inspects uploaded metadata/signatures and copies a specific source generation to `student-feedback/private/{sessionId}/{attachmentId}` before making it eligible for submission.

Canonical files must have no Firebase download-token metadata. Reports store object keys and generations, never bearer download URLs. Admin attachment links are short-lived, authorized for each request and use the stored generation. Treat a generated signed link as a temporary credential; do not put it in logs or support tickets.

Unfinished upload sessions expire after 24 hours. Cleanup and finalization coordinate through transactional session/attachment state and leases. Small expired-session tombstones are retained permanently, exceeding the agreed seven-day minimum, so an old session ID cannot be reused while a delayed upload event is still being handled. Late object-finalized events clean up uploads that arrive after cancellation or expiry. Submitted report references are retained and must win over cleanup. Failed staging deletions have a persistent retry marker, including when the report has already been submitted.

Cancelling an attachment while its server copy is running retains a cleanup marker for a further 24 hours. Both session cleanup and the due-time attachment sweep respect that hold, and a late finalizer renews the marker if its commit loses the cancellation race.

Supported media is PNG/JPEG/WebP and MP4/WebM/MOV. Format/signature validation is not antivirus scanning or a guarantee that a codec plays in every browser. MOV may need downloading and opening in a compatible player. The application does not transcode or record media.

## Post-deployment smoke checks

Run these with dedicated test accounts in a nonproduction environment first:

- Signed-out `/feedback` returns through login to the form; ordinary login redirects stay unchanged.
- A student can submit a text-only generic report and sees a stable reference. Retrying the same submission returns that reference once.
- A lesson report selects the correct lesson/page. Closing the dialog preserves the draft and player state; audio and auto-advance pause while it is open.
- Upload a valid small image and video. Verify progress, remove/retry, successful submission, admin preview/download and unsupported-video fallback.
- A different student cannot read another account's session, report, activity or attachments, or upload to its reservation. Direct private object requests fail.
- Legacy audio endpoints reject feedback object paths while ordinary lesson audio still works.
- Admin filters, cursor pages, unresolved badge, notes, resolve/reopen and archive/unarchive work and preserve history.
- Confirm canonical feedback objects lack Firebase download tokens, signed links use the expected generation, and links expire as intended.
- In a controlled nonproduction fixture, verify expiration/cleanup, late upload handling and cleanup-versus-submit behavior. Do not manually delete locks or production sessions to simulate this.

## Verification boundaries

Jest, rules tests and Playwright use local demo Firebase projects. They must not seed or mutate deployed content. Storage emulator tests check client authorization, and service tests exercise lifecycle races and preconditions. Emulators do not establish production bucket IAM, CORS, real GCS copy/signing semantics, Eventarc delivery or deployed scheduler behavior; the checks above remain necessary before rollout.

The shared schemas in `shared/student-feedback/index.ts` define persisted data and request validation. Record actual verification results in the PR; do not infer successful checks from this runbook.

## References

- [Firebase resumable uploads](https://firebase.google.com/docs/storage/web/upload-files)
- [Storage rule conditions and Firestore lookups](https://firebase.google.com/docs/storage/security/rules-conditions)
- [Cloud Storage request preconditions](https://cloud.google.com/storage/docs/request-preconditions)
