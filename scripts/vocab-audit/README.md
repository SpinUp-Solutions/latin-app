# Vocabulary audit

Checks and fixes every word in the `vocabulary_words_v5` collection with Codex agents, then writes the result to Firestore. No human reviews the edits in between, so the scripts carry the safeguards: a backup taken before anything else, a write that refuses stale or invalid words, and an undo.

Working files go to `scripts/vocab-audit/out/` (gitignored). Backups go to `~/latin-app-vocab-backups/`, outside the repository, so removing a worktree does not remove them.

| Step                | Command                                                        | Touches                                                   |
| ------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| 1. Back up          | `node scripts/vocab-audit/fetch.mjs`                           | Firestore, read-only (gcloud token)                       |
| 2. Plan             | `node scripts/vocab-audit/plan.mjs`                            | local                                                     |
| 3. Review           | `node scripts/vocab-audit/run-codex.mjs`                       | local files; Codex usage; the web, for dictionary lookups |
| 4. Look at the diff | `node scripts/vocab-audit/apply.mjs` (dry run)                 | local: writes `out/changes.md`                            |
| 5. Write            | `node scripts/vocab-audit/apply.mjs --yes`                     | Firestore, **write**                                      |
| Undo                | `node scripts/vocab-audit/restore.mjs --log <apply-log> --yes` | Firestore, **write**                                      |

The project is `latin-app-prod` unless `VOCAB_AUDIT_PROJECT` says otherwise. With `FIRESTORE_EMULATOR_HOST` set, every script talks to the emulator instead, which is how the write and the undo are tried out.

## 1. Back up

`fetch.mjs` reads the whole collection and writes:

- `~/latin-app-vocab-backups/<project>-vocabulary_words_v5-<time>.ndjson.gz`: every document as Firestore returned it, with its value types. A `.json` file beside it holds the count and a checksum. Backup files are never overwritten.
- `out/docs/<id>.json` and `out/index.json`: the plain-JSON working copy.

`--since <time>` limits the download to words created on or after a time.

## 2. Plan

`plan.mjs` does two things, without AI:

- **Pre-pass.** Applies the fixes that need no knowledge of the word and logs them to `out/prepass.json`:
  - alternate forms that a general rule yields for any word: `-ēre` for `-ērunt`, `-re` for `-ris`, `-īs` for `-ēs`, `-ī` for `-e` in the ablative of present participles, syncopated perfects (`amāstī`), and the feminine and neuter variants of compound forms (`amāta est`). The client wants one form per cell, the regular one.
  - placeholder text in a cell (`—`, `null`, `(not used)`), which becomes an empty cell;
  - a verb lemma written with `-ēō` or `-ēor` (`audēō`), which becomes `-eō`, `-eor`;
  - participle locatives, which are emptied.
- **Batches.** A batch holds one part of speech only. Batches are sized by how much text their words take to review, not by count, so a batch of adverbs holds about 30 words and a batch of verbs far fewer. Verbs are the hardest, so they also have their own cap (`--max-verbs`, 8 by default). Writes `out/batches.json`.

## 3. Review

`run-codex.mjs` starts one `codex exec` session per batch, with the Codex CLI on this machine, several at a time. Defaults: `gpt-6.1-sol` at high effort, three sessions at once, web search and network on. `--dry-run` lists what it would run; `--batches 1-5`, `--pos verb` and `--limit 3` narrow it.

- Each session runs in Codex's workspace-write sandbox, without your Codex settings file and without this machine's gcloud sign-in. It can write only under the repository.
- A session gets `REVIEW_BRIEF.md` and one tool, `word.mjs`. Its edits go to `out/edited/`, its review marks to `out/progress/`, its notes to `out/notes/`.
- **Stopping and continuing.** The run can stop at any point (Ctrl-C, Codex usage running out, a closed laptop). Run the same command again and it continues: every reviewed word is recorded in `out/progress/`, finished batches are skipped, and an unfinished batch starts at its first unreviewed word. Only the few words a session was looking at when it stopped are seen twice. When sessions start failing without reviewing anything, the run stops by itself after three of them.
- **Progress.** `node scripts/vocab-audit/status.mjs` shows the words and batches reviewed, per part of speech, the Codex tokens spent across every run so far, and an estimate of what is left.
- `out/runs/sessions.ndjson` records the tokens, the time and the number of commands of every session; `out/runs/batch-<n>.<time>.jsonl` is a session's full transcript.

What keeps the token count down:

- The pre-pass removes thousands of mechanical fixes before any agent starts.
- Cells that already equal the regular paradigm built from the word's labels and stems are not shown. The agent checks the labels and stems, and the cells that are shown.
- Findings of the same kind on one word are summed up in one line.
- `next` shows several short words at once (verbs one at a time), and the agent can chain its commands. Every call resends the whole session, so calls are what cost. The brief puts accuracy ahead of this: lookups and second looks are not to be skipped.
- Every batch is a fresh session, sized by text, so no session grows large.

`node scripts/vocab-audit/word.mjs` prints the tool's commands.

## 4 and 5. Write

`apply.mjs` without `--yes` is a dry run: it prints the counts and writes every change and every note to `out/changes.md`.

It holds a word back, and says why, when:

- the word's review did not finish;
- the edited word fails the app's schema where the stored word passed;
- the edited word has more rule errors than the stored word.

With `--yes` it writes the rest the way the app's own word update does: only the changed top-level fields plus `updatedAt`, in a transaction that refuses while a content sync holds its lock and that bumps the vocabulary content revision. Each write is conditional on the word being unchanged since the download, so a word edited in the admin in the meantime is refused, not overwritten. The run is logged to `out/apply-log-<time>.json`.

## Undo

`restore.mjs --log <apply-log>` puts every word that run wrote back to its backed-up state, whole document, original value types. Words edited again after the run are left alone unless `--force` is passed. `--only id,id` restores named words from the backup.

## What the rules check

`check.mjs` and `word.mjs issues` run these checks, with no AI:

- **Characters.** Latin forms may contain only Latin letters, macron vowels and dictionary punctuation. English fields may contain no foreign scripts.
- **Schema.** The app's Zod schema.
- **Required content.** A translation, definitions, a dictionary entry (nouns, verbs, adjectives), a `shortened_form` on every principal part or dictionary form after the first, and verb translations that start with "to".
- **Consistency.** The lemma against the first principal part and nominative, the genitive field against the table, pronoun person against the nominative (tū/vōs = 2nd), and the `3io` label on 3rd-conjugation verbs in -iō.
- **Regular paradigms**, derived from the stored lemma and label. Wrong stems and endings are errors; ending or stem macrons that differ are warnings.
  - Nouns of declensions 1–5.
  - Adjectives: 1st/2nd and 3rd declension positives, comparatives, superlatives.
  - Verbs of conjugations 1–4, active and deponent: every finite tense in both voices, imperatives, infinitives, gerunds, supines, and present, perfect and future participles and gerundives.
- **One form per cell**: the alternates, placeholders and participle locatives listed under the pre-pass, and any other cell with more than one form.

Verbs without a regular conjugation get the checks that hold for any verb: the perfect active system from the third principal part, everything built on the supine stem, and the endings of the present participle, gerundive and gerund.

The rules don't check the present system of irregular verbs, defective verbs, pronoun tables, words whose stored label is itself wrong, or meanings, etymology and pronunciation. That is why agents review every word, not only the flagged ones.

## Optional: dictionary and stress check

`wiktionary-fetch.mjs` saves the Latin section of each word's English Wiktionary page to `out/wiktionary/` (about 2 s per page, to stay under Wiktionary's rate limit). `wiktionary-compare.mjs` then compares every word, edited version when there is one, with it and writes `out/wiktionary-report.json` and `out/wiktionary-summary.txt`:

- the lemma, principal parts, genitive, comparative and superlative against the headword line;
- each table cell against Wiktionary's tagged inflection forms;
- pronunciation stress and vowel length against the penult rule and the lemma's macrons (`stress.mjs`).

Wiktionary's tables are generated, so a filled cell there is not proof a form is attested, and a breve-macron (`ī̆`) means either length is accepted.

`regenerate.mjs` reruns words through the app's autocomplete (needs `OPENAI_API_KEY`); it is not part of the audit.
