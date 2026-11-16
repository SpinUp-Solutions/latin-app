// Optional, not part of the audit: run each word through an autocomplete profile and cache the raw
// structured output in out/regen/<profile>/<id>.json. Reruns skip cached words.
// Needs OPENAI_API_KEY in the environment. Calls OpenAI only; never Firestore.
// Usage: OPENAI_API_KEY=… node scripts/vocab-audit/regenerate.mjs [--profile candidate] [--concurrency 8] [--only id,id]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import jitiFactory from 'jiti';
import { OUT } from './paths.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const profile = arg('profile', 'candidate');
const concurrency = Number(arg('concurrency', '8'));
const only = arg('only')?.split(',');

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set. Export it in this shell, then rerun.');
  process.exit(1);
}

const { runVocabularyAutocomplete } = jitiFactory(import.meta.url)('../../shared/openai/autocomplete.ts');
const { words } = JSON.parse(readFileSync(join(OUT, 'index.json'), 'utf8'));
const dir = join(OUT, 'regen', profile);
mkdirSync(dir, { recursive: true });

const queue = words.filter(w => (!only || only.includes(w.id)) && !existsSync(join(dir, `${w.id}.json`)));
console.log(`${profile}: ${queue.length} to run, ${words.length - queue.length} cached or filtered`);

let done = 0;
let cost = 0;
const failures = [];
async function worker() {
  while (queue.length) {
    const w = queue.shift();
    const result = await runVocabularyAutocomplete({ word: w.word, part_of_speech: w.part_of_speech }, profile, {
      timeout: 600_000,
      maxRetries: 2,
    });
    cost += result.cost?.totalCost ?? 0;
    if (result.success)
      writeFileSync(
        join(dir, `${w.id}.json`),
        JSON.stringify({ id: w.id, word: w.word, model: result.model, structured: result.structured }, null, 2)
      );
    else failures.push(`${w.word} (${w.id}): ${result.code} ${result.error}`);
    done++;
    if (done % 10 === 0) console.log(`${done} done, $${cost.toFixed(2)} so far`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
console.log(
  `finished ${done}, cost $${cost.toFixed(2)}, ${failures.length} failed${failures.length ? ` (rerun to retry):\n  ${failures.join('\n  ')}` : ''}`
);
