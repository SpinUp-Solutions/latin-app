// What the agents changed, sorted so a reviewer reads the risky edits rather than 7 MB of diff.
// Writes out/summary.md and prints its counts. Reads local files only.
// Usage: node scripts/vocab-audit/summary.mjs
//
// Sections, riskiest first:
// - labels and lemmas (part of speech, lemma, gender, declension, conjugation, deponent);
// - translations, split into "added to" (expected), small fixes, and rewrites (read these);
// - impersonal verbs whose "it …" translation was turned into "to …" (should be none);
// - etymologies changed beyond removing [1] marks, definitions rewritten rather than trimmed;
// - a sample of pronunciation changes;
// - every note.
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EDITED, NOTES, original, readJson } from './lib.mjs';
import { OUT } from './paths.mjs';

const clean = s =>
  String(s ?? '')
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const letters = s =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\bto\b/g, '')
    .replace(/[^a-z]/g, '');
const distance = (a, b) => {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
};
const cut = (v, n = 140) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? `${s.slice(0, n)}…` : s;
};

const LABELS = ['part_of_speech', 'word', 'gender', 'declension', 'conjugation', 'is_deponent', 'pronoun_type'];
const fieldCounts = {};
const labels = [];
const translations = { 'added to': [], small: [], rewritten: [] };
const impersonal = [];
const etymology = [];
const definitions = [];
const pronunciation = [];

const files = existsSync(EDITED) ? readdirSync(EDITED).filter(f => f.endsWith('.json')) : [];
for (const file of files) {
  const { id, data: after } = readJson(join(EDITED, file));
  const before = original(id).data;
  const tag = `${before.word} (${before.part_of_speech}, ${id})`;
  for (const k of Object.keys(after))
    if (k !== 'updatedAt' && JSON.stringify(after[k]) !== JSON.stringify(before[k]))
      fieldCounts[k] = (fieldCounts[k] ?? 0) + 1;

  for (const k of LABELS)
    if (JSON.stringify(after[k]) !== JSON.stringify(before[k]))
      labels.push(`${tag}: ${k} ${cut(before[k])} → ${cut(after[k])}`);

  const [t0, t1] = [before.translation ?? '', after.translation ?? ''];
  if (t0 !== t1) {
    const line = `${tag}: ${cut(t0)} → ${cut(t1)}`;
    if (before.part_of_speech === 'verb' && /^\s*it\b/i.test(t0) && !/^\s*it\b/i.test(t1)) impersonal.push(line);
    if (letters(t0) === letters(t1)) translations['added to'].push(line);
    else if (distance(letters(t0), letters(t1)) <= 4) translations.small.push(line);
    else translations.rewritten.push(line);
  }

  if (clean(before.etymology) !== clean(after.etymology))
    etymology.push(`${tag}: ${cut(before.etymology)} → ${cut(after.etymology)}`);

  const [d0, d1] = [(before.definitions ?? []).map(clean), (after.definitions ?? []).map(clean)];
  if (JSON.stringify(d0) !== JSON.stringify(d1) && !d1.every(x => d0.some(y => y.includes(x))))
    definitions.push(`${tag}: ${cut(d0, 200)} → ${cut(d1, 200)}`);

  if ((before.pronunciation ?? '') !== (after.pronunciation ?? ''))
    pronunciation.push(`${tag}: ${before.pronunciation} → ${after.pronunciation}`);
}

const notes = existsSync(NOTES)
  ? readdirSync(NOTES)
      .filter(f => f.endsWith('.json'))
      .map(f => readJson(join(NOTES, f)))
      .map(n => `${original(n.id).data.word} (${n.id}): ${n.note}`)
  : [];
const sample = (list, n) => list.filter((_, i) => i % Math.max(1, Math.ceil(list.length / n)) === 0);
const section = (title, lines, hint = '') =>
  `## ${title} (${lines.length})\n\n${hint ? `${hint}\n\n` : ''}${lines.map(l => `- ${l}`).join('\n')}\n`;

const md = [
  `# What the agents changed\n\n${files.length} edited words. Changed fields: ${Object.entries(fieldCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')}.\n`,
  section('Labels and lemmas', labels, 'A wrong label rewrites a whole table. Check each against a dictionary.'),
  section(
    'Impersonal verbs turned from "it …" into "to …"',
    impersonal,
    'Should be empty: an impersonal verb keeps "it pleases".'
  ),
  section('Translations rewritten', translations.rewritten, 'Should only be translations of a different word.'),
  section('Translations with small fixes', translations.small),
  section('Translations where only "to" or a bracket moved', translations['added to']),
  section('Etymologies changed beyond [1] marks', etymology, 'Should only be etymologies of a different word.'),
  section('Definitions rewritten, not only trimmed', definitions, 'Should be empty ones filled or wrong-word ones.'),
  section('Pronunciation changes, sample', sample(pronunciation, 40), `${pronunciation.length} in all.`),
  section('Notes', notes),
].join('\n');
writeFileSync(join(OUT, 'summary.md'), md);

console.log(`${files.length} edited words; changed fields:`, fieldCounts);
console.log(
  `labels ${labels.length}, impersonal "it" lost ${impersonal.length}, translations rewritten ${translations.rewritten.length} / small ${translations.small.length} / "to" ${translations['added to'].length}, etymologies ${etymology.length}, definitions rewritten ${definitions.length}, pronunciations ${pronunciation.length}, notes ${notes.length}`
);
console.log(`Read: ${join(OUT, 'summary.md')}`);
