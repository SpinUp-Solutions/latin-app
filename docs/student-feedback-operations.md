# Student feedback operations

In-app feedback replaces the Google Form for new submissions. Historical Google Form responses are not imported, and the old form URL must be retired wherever it was shared.

## How it works

- Students write feedback at `/feedback` or from the **Feedback** button in a lesson. Closing the lesson panel keeps the draft.
- Attachments upload straight from the browser to `student-feedback/uploads/{uid}/{draftId}/{fileId}`. Storage rules allow only the signed-in owner to create files there, only PNG, JPEG, WebP, MP4, WebM or MOV, up to 10 MB per image and 100 MB per video. Nobody can read, overwrite or delete them from a client.
- On submit, `POST /api/feedback` checks each upload's size, type and leading bytes, copies it to the server-only `student-feedback/reports/{feedbackId}/` folder without a download token, writes the report and deletes the uploads. The draft ID is the report ID, so a retried submit returns the original receipt.
- Admins review reports at `/admin/feedback`. Attachments open through 15-minute signed links. Treat a signed link as a temporary credential and keep it out of logs and tickets.

Limits: 10 reports per student per rolling hour; 5 files and 200 MB per report. Reports, attachments and activity do not expire. Archiving only hides a report from the default queue.

## Before deployment

Use the intended Firebase project and bucket. Nothing in this repository deploys these for you.

1. Deploy `firestore.indexes.json` and wait for the feedback indexes to finish building.
2. Deploy `firestore.rules` and `storage.rules`.
3. Add a lifecycle rule to the Storage bucket that deletes abandoned uploads. Scope it to the uploads prefix only; a broader rule would delete submitted attachments.

   ```json
   {
     "rule": [
       {
         "action": { "type": "Delete" },
         "condition": { "age": 1, "matchesPrefix": ["student-feedback/uploads/"] }
       }
     ]
   }
   ```

   Merge this with any existing lifecycle rules rather than replacing them (for example with `gcloud storage buckets describe` first, then `gcloud storage buckets update --lifecycle-file=...`).
4. Confirm the app's server identity can read, copy and delete objects under `student-feedback/` and can sign URLs, as it already does for lesson audio.
5. Deploy the application, including the lesson audio signing and deletion routes, which now only accept lesson audio paths.

## Smoke checks

Run these with test accounts outside production first.

- Signed out, `/feedback` returns through login to the form.
- A text-only report and a report with an image and a video both succeed and show a reference. Re-sending the same draft does not create a duplicate.
- In a lesson, the panel captures the lesson and page, pauses audio, and keeps the draft after closing.
- Admin filters, paging, the unresolved badge, notes, resolve/reopen and archive/unarchive work and appear in the activity log.
- Admin previews and downloads load; direct client requests for `student-feedback/reports/...` fail.
- The audio signing and deletion endpoints reject feedback object paths while lesson audio still plays.

Local emulator tests cover the rules, the upload/submit/copy flow and admin review. They do not cover production IAM, URL signing or the lifecycle rule.
