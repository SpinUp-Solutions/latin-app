# Orchestrator brief

You run the vocabulary audit described in `scripts/vocab-audit/README.md` from start to finish, on this machine, for a human who is in this chat. The word-by-word review is done by Codex sessions that `run-codex.mjs` starts. Your job is to run the steps in order, keep the run going, check the agents' work, and hand the human a result they can approve.

Read `scripts/vocab-audit/README.md` first. Work from the repository root.

## Hard rules

- **Never write to Firestore yourself.** Don't run `apply.mjs --yes` or `restore.mjs --yes`. When the review is finished and checked, give the human the exact command and let them run it.
- Never read `.env*` files, print the gcloud token, deploy anything, or touch Firestore other than through these scripts.
- Never delete `scripts/vocab-audit/out/` or anything in `~/latin-app-vocab-backups/`. Never use `plan.mjs --force` while reviewed words exist: it throws the progress away.
- Don't edit the scripts or `REVIEW_BRIEF.md` unless the human agrees. If a rule or the brief makes agents do something wrong, stop, show the human the evidence and propose the change.
- Git: commit only on the human's say-so, on branch `claude/vocab-audit-codex-pipeline` or a branch from it. Never push to `edge`, `main` or `production`.

## 0. Check the machine

Run each of these and stop with a clear message if one fails:

- `node -v`: 22 or later.
- `npm ci` has been run (the scripts load the app's schemas with `jiti`).
- `gcloud auth print-access-token > /dev/null && echo ok`: gcloud is signed in with an account that can read `latin-app-prod`.
- `codex login status`: the Codex CLI is signed in. `run-codex.mjs` uses `$CODEX_BIN`, then the copy in ChatGPT.app on a Mac, then `codex` on the PATH.

## 1. Fresh run or continuation

- If `scripts/vocab-audit/out/batches.json` exists, run `node scripts/vocab-audit/status.mjs`. Words already reviewed stay reviewed: go to step 3 and continue. Don't fetch or plan again.
- Otherwise start fresh: `node scripts/vocab-audit/fetch.mjs` (takes a backup, prints its path), then `node scripts/vocab-audit/plan.mjs`. Tell the human the backup path and the word count.

## 2. Pilot

Run one verb batch: `node scripts/vocab-audit/run-codex.mjs --pos verb --limit 1`. It takes a few minutes. Then check it:

- In the newest `scripts/vocab-audit/out/runs/batch-<n>.*.jsonl`, the agent made web lookups (items of type `web_search`) and used `show <id> --full` on irregular verbs.
- `node scripts/vocab-audit/word.mjs diff <id>` on three of its words: every change is right. Check what you are unsure of in Wiktionary or Lewis & Short.

If the pilot is poor, stop and tell the human why before spending more.

## 3. Full run

Start it in the background so it outlives any one command of yours:

```
nohup node scripts/vocab-audit/run-codex.mjs --concurrency 12 >> scripts/vocab-audit/out/run.log 2>&1 &
```

(On a Mac, put `caffeinate -i` in front of `node` so the machine doesn't sleep.) Then, until it ends, check every few minutes, with no single command waiting longer than 5 minutes:

```
sleep 240; node scripts/vocab-audit/status.mjs; tail -3 scripts/vocab-audit/out/run.log
```

- Tell the human the progress now and then, in one line.
- If the runner stops before every batch is reviewed, look at the end of `run.log`, the last lines of `out/runs/sessions.ndjson` and the newest transcript. A usage or rate limit: wait, then start it again with a lower `--concurrency` (6, then 3). Anything else: tell the human.
- Restarting is always safe. Reviewed words are never reviewed again.

## 4. Check the agents' work

When `status.mjs` says the review is finished:

1. `node scripts/vocab-audit/summary.mjs`, then read `scripts/vocab-audit/out/summary.md` section by section. What each section should contain is written under its heading. Look hardest at:
   - impersonal verbs that lost their "it …" translation (should be none);
   - translations, etymologies and definitions that were rewritten (should be only empty fields filled, debris removed, or text that belonged to a different word);
   - label changes (each one rewrites a table).
2. Spot-check at least 10 verbs and 10 nouns among the edited words with `word.mjs diff <id>` and a dictionary.
3. Fix single mistakes with `word.mjs` (`set`, `replace`, `reset`) and keep a list of what you changed for the report. A mistake that repeats across many words comes from a rule or the brief: stop and show the human (see Hard rules).

## 5. Dry run of the write

`node scripts/vocab-audit/apply.mjs`. It prints how many words it would write and which it holds back and why, and writes every change to `scripts/vocab-audit/out/changes.md`.

For each held word, read its note (in `changes.md` under the word, or `scripts/vocab-audit/out/notes/<id>.json`) and decide:

- **Rule errors went up** usually means the agent kept a real exception the regular-paradigm rule doesn't know (a singular-only noun, a defective or irregular form). If the note's sources bear it out, it can be written.
- **Fails the schema**: leave it out; the human fixes it in the admin.

## 6. Hand over

Stop and report to the human, briefly:

- words reviewed, words to write, words held back, and which held words you recommend writing, with the reason;
- what the summary showed, anything you fixed, anything you could not settle;
- the paths of `changes.md`, `summary.md` and the backup.

Then give the exact commands for them to run themselves:

```
node scripts/vocab-audit/apply.mjs --yes
node scripts/vocab-audit/apply.mjs --yes --skip-gates --only <id>,<id>   # the held words you recommend
```

and the undo: `node scripts/vocab-audit/restore.mjs --log scripts/vocab-audit/out/apply-log-<time>.json --yes` (add `--backup <file>` if the backup was taken on another machine).
