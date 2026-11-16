// Step 2: prepare the run. No AI, local files only.
//
//   1. Applies the fixes that need no knowledge of the word, so no agent spends tokens on
//      them: alternate forms a general rule yields (-ēre for -ērunt, -re for -ris, -īs for
//      -ēs, syncopated perfects, gender variants of compound forms), placeholder text in a
//      cell (—, null), and participle locatives. What it changed goes to out/prepass.json.
//   2. Splits the words into batches. A batch holds one part of speech only, and is sized
//      by how much text its words take to review, not by count: a batch of adverbs holds
//      many words, a batch of verbs few. Verbs are the hardest, so they also have their own
//      lower cap. Writes out/batches.json.
//
// Usage: node scripts/vocab-audit/plan.mjs [--batch-chars 30000] [--max-words 40] [--max-verbs 8] [--force]
//   --force   plan again although a review is already under way
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strip } from './paradigms.mjs';
import { OUT } from './paths.mjs';
import {
  BATCHES,
  PREPASS_FIXES,
  PROGRESS,
  applyFixes,
  current,
  index,
  nfc,
  render,
  renderIssues,
  save,
  show,
} from './lib.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const batchChars = Number(arg('batch-chars', '30000'));
const maxWords = Number(arg('max-words', '40'));
const maxVerbs = Number(arg('max-verbs', '8'));

if (existsSync(PROGRESS) && readdirSync(PROGRESS).length && !process.argv.includes('--force')) {
  console.error('A review is under way (out/progress is not empty). Pass --force to plan again.');
  process.exit(1);
}

const words = [...index()].sort(
  (a, b) =>
    String(a.part_of_speech).localeCompare(String(b.part_of_speech)) ||
    strip(a.word).localeCompare(strip(b.word)) ||
    a.id.localeCompare(b.id)
);

// 1. Pre-pass
const prepass = [];
for (const { id } of words) {
  const doc = nfc(structuredClone(current(id).data));
  const applied = applyFixes(doc, PREPASS_FIXES);
  if (!applied.length) continue;
  save(id, doc);
  prepass.push({
    id,
    word: doc.word,
    fixes: applied.map(i => ({ path: i.path, from: show(i.actual), to: show(i.expected), rule: i.note ?? i.check })),
  });
}
writeFileSync(join(OUT, 'prepass.json'), JSON.stringify(prepass, null, 2));

// 2. Batches
const batches = [];
let open = null;
for (const { id, part_of_speech } of words) {
  const chars = render(id).length + renderIssues(id).length;
  if (
    !open ||
    open.part_of_speech !== part_of_speech ||
    open.ids.length >= (part_of_speech === 'verb' ? maxVerbs : maxWords) ||
    open.chars + chars > batchChars
  ) {
    open = { n: batches.length + 1, part_of_speech, ids: [], chars: 0 };
    batches.push(open);
  }
  open.ids.push(id);
  open.chars += chars;
}
writeFileSync(
  BATCHES,
  JSON.stringify({ createdAt: new Date().toISOString(), batchChars, maxWords, maxVerbs, batches }, null, 2)
);

const fixes = prepass.reduce((n, p) => n + p.fixes.length, 0);
const byRule = {};
for (const { fixes: list } of prepass) for (const f of list) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
console.log(`pre-pass: ${fixes} cells fixed in ${prepass.length} words (out/prepass.json)`);
for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) console.log(`  ${rule}: ${n}`);
console.log(
  `batches:  ${batches.length} for ${words.length} words, ${batches.reduce((n, b) => n + b.chars, 0)} characters to review`
);
const byPos = {};
for (const b of batches) {
  byPos[b.part_of_speech] ??= { batches: 0, words: 0, chars: 0 };
  byPos[b.part_of_speech].batches++;
  byPos[b.part_of_speech].words += b.ids.length;
  byPos[b.part_of_speech].chars += b.chars;
}
console.table(byPos);
