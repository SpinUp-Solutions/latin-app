// Step 4: write the reviewed words to Firestore. Dry run unless --yes is passed.
//
// There is no human review between the agents and the database, so the script checks each
// word itself and holds back a word when:
//   - its batch review did not finish (the word is not marked reviewed),
//   - the edited word fails the app's schema where the stored word passed, or
//   - the edited word has more rule errors than the stored word.
// Held words are listed with the reason and are not written.
//
// Each write goes the way the app's own word update goes: only the changed top-level
// fields plus updatedAt, in a transaction that respects the content sync lock and bumps the
// vocabulary content revision. A write is conditional on the word being unchanged since the
// download, so a word someone edited in the meantime is refused, not overwritten.
//
// The dry run writes every change to out/changes.md. A real run writes out/apply-log-<time>.json,
// which restore.mjs reads to undo it.
//
// Usage: node scripts/vocab-audit/apply.mjs [--yes] [--only id,id] [--include-unreviewed] [--skip-gates]
//   --include-unreviewed   also write words changed only by the pre-pass in plan.mjs
//   --skip-gates           write held words too (use with --only, after looking at them)
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkWord } from './check.mjs';
import { TARGET, docName, encode, mutate } from './firestore-rest.mjs';
import { EDITED, NOTES, changes, original, progress, readJson } from './lib.mjs';
import { OUT } from './paths.mjs';

const yes = process.argv.includes('--yes');
const includeUnreviewed = process.argv.includes('--include-unreviewed');
const skipGates = process.argv.includes('--skip-gates');
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? process.argv[onlyArg + 1].split(',') : null;

const errors = data => checkWord(data).filter(i => i.severity === 'error');
const schemaErrors = list => list.filter(i => i.check === 'schema').map(i => `${i.path}: ${i.note}`);

const plans = [];
const held = [];
for (const file of existsSync(EDITED) ? readdirSync(EDITED).filter(f => f.endsWith('.json')) : []) {
  const patched = readJson(join(EDITED, file));
  if (only && !only.includes(patched.id)) continue;
  const before = original(patched.id);
  const fields = Object.keys(patched.data).filter(
    k => k !== 'updatedAt' && JSON.stringify(patched.data[k]) !== JSON.stringify(before.data[k])
  );
  if (!fields.length) continue;
  const plan = { id: patched.id, word: patched.data.word, updateTime: before.updateTime, fields, data: patched.data };
  plan.diff = changes(before.data, patched.data);

  const [was, now] = [errors(before.data), errors(patched.data)];
  const newSchemaErrors = schemaErrors(now).filter(e => !schemaErrors(was).includes(e));
  const reason =
    !progress(patched.id) && !includeUnreviewed
      ? 'not reviewed'
      : newSchemaErrors.length
        ? `fails the schema: ${newSchemaErrors.join('; ')}`
        : now.length > was.length
          ? `rule errors went from ${was.length} to ${now.length}`
          : null;
  if (reason && !(skipGates && reason !== 'not reviewed')) held.push({ ...plan, reason });
  else plans.push(plan);
}
plans.sort((a, b) => a.word.localeCompare(b.word));

console.log(
  `${TARGET}: ${plans.length} words to update, ${held.length} held back${yes ? '' : ' (dry run; pass --yes to write)'}`
);
const reasons = {};
for (const h of held) {
  const kind = h.reason.startsWith('rule errors') ? 'more rule errors' : h.reason.replace(/:.*/, '');
  reasons[kind] = (reasons[kind] ?? 0) + 1;
}
for (const [reason, n] of Object.entries(reasons)) console.log(`  held, ${reason}: ${n}`);

if (!yes) {
  const note = id => (existsSync(join(NOTES, `${id}.json`)) ? readJson(join(NOTES, `${id}.json`)).note : null);
  const section = p =>
    `## ${p.word} (${p.id})${p.reason ? ` — HELD: ${p.reason}` : ''}\n\n${note(p.id) ? `Note: ${note(p.id)}\n\n` : ''}${p.diff.join('\n')}\n`;
  const changed = new Set([...held, ...plans].map(p => p.id));
  const noted = (existsSync(NOTES) ? readdirSync(NOTES) : [])
    .map(file => readJson(join(NOTES, file)))
    .filter(n => !changed.has(n.id) && (!only || only.includes(n.id)));
  writeFileSync(
    join(OUT, 'changes.md'),
    `# Vocabulary audit changes\n\n${plans.length} words to update, ${held.length} held back, ${noted.length} unchanged words with a note.\n\n` +
      [...held, ...plans].map(section).join('\n') +
      (noted.length
        ? `\n# Unchanged words with a note\n\n${noted.map(n => `- ${original(n.id).data.word} (${n.id}): ${n.note}`).join('\n')}\n`
        : '')
  );
  console.log(`every change and note: ${join(OUT, 'changes.md')}`);
  process.exit(0);
}

const startedAt = new Date().toISOString();
const log = [];
const queue = [...plans];
async function worker() {
  while (queue.length) {
    const p = queue.shift();
    const fields = Object.fromEntries(p.fields.map(f => [f, encode(p.data[f])]));
    fields.updatedAt = { timestampValue: new Date().toISOString() };
    try {
      const [result] = await mutate([
        {
          update: { name: docName(p.id), fields },
          updateMask: { fieldPaths: [...p.fields, 'updatedAt'] },
          currentDocument: { updateTime: p.updateTime },
        },
      ]);
      log.push({ id: p.id, word: p.word, ok: true, fields: p.fields, updateTime: result.updateTime });
    } catch (error) {
      log.push({ id: p.id, word: p.word, ok: false, error: String(error.message ?? error) });
      console.log(`  ✗ ${p.word} (${p.id}): ${error.message ?? error}`);
    }
    if (log.length % 100 === 0) console.log(`  ${log.length}/${plans.length}`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

const logFile = join(OUT, `apply-log-${startedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(
  logFile,
  JSON.stringify(
    { target: TARGET, startedAt, held: held.map(h => ({ id: h.id, word: h.word, reason: h.reason })), words: log },
    null,
    2
  )
);
console.log(
  `${log.filter(l => l.ok).length} written, ${log.filter(l => !l.ok).length} failed, ${held.length} held back`
);
console.log(`log: ${logFile}`);
