# Sign-in diagnostics

Production sends events to Sentry project **latin-app-prod**. The repository's
build/source-map project setting names **latin-app**, so use the production DSN's
destination when investigating a student report.

After deploying this change, search the production Issues view for
`surface:authentication`. Narrow with `authStage:<stage>` and the student's
Firebase user ID (`user.id:<uid>`) when credentials have been accepted. No email,
password, token, profile contents, storage contents, or original Firebase error
objects are added to these diagnostics.

| Stage                       | Meaning                                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth_state_timeout`        | Firebase's initial auth observer has not responded after 15 seconds.                                                                                                                                            |
| `sign_in_request_timeout`   | The password sign-in promise has not settled after 15 seconds.                                                                                                                                                  |
| `sign_in_failed`            | An unexpected sign-in error, including network/storage failures. Ordinary credential errors are breadcrumbs only.                                                                                               |
| `profile_timeout`           | The profile has not loaded after 15 seconds. `snapshotReceived` distinguishes no callback from an empty snapshot.                                                                                               |
| `profile_unavailable`       | The existing 10-second missing-profile grace period expired. Check `fromCache` before concluding that the server document is missing.                                                                           |
| `profile_setup_error`       | Dashboard cache seeding or profile subscription threw synchronously; `step` identifies which.                                                                                                                   |
| `profile_listener_error`    | Firestore delivered an explicit listener error.                                                                                                                                                                 |
| `profile_snapshot_error`    | Processing a profile snapshot failed.                                                                                                                                                                           |
| `profile_invalid`           | The existing profile schema rejected data. Compatibility defaults remain in place; only the issue count is recorded.                                                                                            |
| `sign_in_not_completed`     | Credentials were accepted, but the login page remained mounted for another 15 seconds. Check `profileLoaded`, `profileMatchesAuthUser`, and `redirectRequested` to distinguish profile loading from navigation. |
| `auth_state_listener_error` | Registering the auth observer or its error callback failed.                                                                                                                                                     |

The `auth` breadcrumbs show sign-in start, accepted credentials, auth-state
changes, profile subscription, snapshot metadata, profile readiness, and requested
navigation. Events include the Firebase SDK version, online status, cookie support,
page visibility, and whether access to the localStorage and IndexedDB APIs throws.
These availability flags do **not** prove that an IndexedDB database is healthy or
that the browser can reach Firebase.

Each watchdog reports once. It is cancelled on completion, replacement, sign-out,
or unmount as applicable; retrying sign-in starts a fresh login watchdog even when
Firebase keeps the same user and emits no new auth-state callback. Existing Sentry
browser/OS/release metadata and replay settings continue to apply. Successful
flows only add breadcrumbs; logging does not repair a broken browser cache.

Client-side logging requires the browser to reach Sentry's existing monitoring
tunnel. A completely disconnected or blocked browser may not deliver an event.
