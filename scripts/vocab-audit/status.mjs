// Where the run stands: words reviewed, batches finished, Codex tokens spent so far and an
// estimate of what is left. Reads local files only.
// Usage: node scripts/vocab-audit/status.mjs [--batches]
//   --batches   also list every unfinished batch
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { batches, isEdited, progress } from './lib.mjs';
import { OUT } from './paths.mjs';

const all = batches();
const left = b => b.ids.filter(id => !progress(id)).length;
const total = all.reduce((n, b) => n + b.ids.length, 0);
const reviewed = all.reduce((n, b) => n + b.ids.length - left(b), 0);
const finished = all.filter(b => left(b) === 0);
const started = all.filter(b => left(b) > 0 && left(b) < b.ids.length);
const pct = (a, b) => `${b ? ((100 * a) / b).toFixed(1) : '0.0'}%`;

console.log(`Words:   ${reviewed} of ${total} reviewed (${pct(reviewed, total)})`);
console.log(
  `Batches: ${finished.length} of ${all.length} finished, ${started.length} partly reviewed, ${all.length - finished.length - started.length} not started`
);

const byPos = {};
for (const b of all) {
  const row = (byPos[b.part_of_speech] ??= { words: 0, reviewed: 0, edited: 0, 'batches left': 0 });
  row.words += b.ids.length;
  row.reviewed += b.ids.length - left(b);
  row.edited += b.ids.filter(id => progress(id) && isEdited(id)).length;
  if (left(b)) row['batches left']++;
}
console.table(byPos);

// Tokens: one line per Codex session in out/runs/sessions.ndjson, across every run so far.
const sessionsFile = join(OUT, 'runs', 'sessions.ndjson');
const sessions = existsSync(sessionsFile)
  ? readFileSync(sessionsFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
  : [];
if (sessions.length) {
  const sum = key => sessions.reduce((n, s) => n + (s.usage?.[key] ?? 0), 0);
  const m = n => `${(n / 1e6).toFixed(1)}M`;
  const input = sum('input_tokens');
  const cached = sum('cached_input_tokens');
  const output = sum('output_tokens');
  const done = sessions.reduce((n, s) => n + s.reviewed, 0);
  const minutes = Math.round(sessions.reduce((n, s) => n + s.seconds, 0) / 60);
  console.log(
    `Codex:   ${sessions.length} sessions, ${m(input)} tokens in (${m(cached)} cached), ${m(output)} out, ${minutes} session-minutes`
  );
  // Estimate from the text still to review, at the tokens per character spent so far.
  const doneChars = sessions.reduce((n, s) => n + (s.chars ?? 0), 0);
  const leftChars = all.reduce((n, b) => n + left(b) * (b.chars / b.ids.length), 0);
  if (done && doneChars && leftChars)
    console.log(
      `Left:    about ${m((input / doneChars) * leftChars)} tokens in and ${m((output / doneChars) * leftChars)} out, at the rate so far`
    );
  const failed = sessions.filter(s => !s.reviewed).length;
  if (failed) console.log(`         ${failed} sessions reviewed nothing (out/runs/sessions.ndjson)`);
}

if (process.argv.includes('--batches'))
  for (const b of all.filter(b => left(b)))
    console.log(`  batch ${b.n}: ${b.part_of_speech}, ${left(b)} of ${b.ids.length} words left`);

console.log(
  reviewed === total
    ? 'Review finished. Next: node scripts/vocab-audit/apply.mjs'
    : 'Continue: node scripts/vocab-audit/run-codex.mjs'
);
