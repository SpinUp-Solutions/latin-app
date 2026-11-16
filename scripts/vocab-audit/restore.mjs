// Undo: put words back exactly as they are in a backup file. Dry run unless --yes is passed.
//
// By default it undoes one apply run: every word that run wrote goes back to its backed-up
// state, except words that were edited again after the run, which are left alone (--force
// restores those too). With --only it restores the named words whatever happened to them.
//
// A restore replaces the whole document with the backed-up one, with its original value
// types, and goes through the same transaction as an app write (content sync lock, content
// revision bump).
//
// Usage: node scripts/vocab-audit/restore.mjs --log <apply-log.json> [--yes] [--force]
//        node scripts/vocab-audit/restore.mjs --only id,id [--yes]
//   --backup <file>   the backup to restore from (default: the one the last download wrote)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { TARGET, docId, docName, getDocuments, mutate } from './firestore-rest.mjs';
import { readJson } from './lib.mjs';
import { OUT } from './paths.mjs';

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};
const yes = process.argv.includes('--yes');
const force = process.argv.includes('--force');
const backupFile = arg('backup') ?? readJson(join(OUT, 'index.json')).backup;
const logFile = arg('log');
const only = arg('only')?.split(',');
if (!logFile && !only) {
  console.error('Pass --log <apply-log.json> to undo an apply run, or --only id,id.');
  process.exit(1);
}

const backup = new Map(
  gunzipSync(readFileSync(backupFile))
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .map(document => [docId(document.name), document])
);
// Key order does not matter when comparing two documents.
const stable = value =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v
  );
const written = logFile ? readJson(logFile).words.filter(w => w.ok) : [];
const ids = only ?? written.map(w => w.id);
const missing = ids.filter(id => !backup.has(id));
if (missing.length) {
  console.error(`Not in ${backupFile}: ${missing.join(', ')}`);
  process.exit(1);
}

const live = await getDocuments(ids);
const plans = [];
const skipped = [];
for (const id of ids) {
  const saved = backup.get(id);
  const now = live.get(id);
  const word = saved.fields?.word?.stringValue ?? id;
  if (now && (now.updateTime === saved.updateTime || stable(now.fields) === stable(saved.fields))) continue; // already as backed up
  const wrote = written.find(w => w.id === id);
  if (wrote && now && now.updateTime !== wrote.updateTime && !force) skipped.push({ id, word });
  else plans.push({ id, word, fields: saved.fields ?? {} });
}

console.log(
  `${TARGET}: ${plans.length} words to restore from ${backupFile}${yes ? '' : ' (dry run; pass --yes to write)'}`
);
for (const s of skipped) console.log(`  left alone, edited after the apply run: ${s.word} (${s.id})`);
if (!yes) {
  for (const p of plans.slice(0, 20)) console.log(`  ${p.word} (${p.id})`);
  if (plans.length > 20) console.log(`  … and ${plans.length - 20} more`);
  process.exit(0);
}

const startedAt = new Date().toISOString();
const log = [];
for (const p of plans) {
  try {
    await mutate([{ update: { name: docName(p.id), fields: p.fields } }]);
    log.push({ id: p.id, word: p.word, ok: true });
  } catch (error) {
    log.push({ id: p.id, word: p.word, ok: false, error: String(error.message ?? error) });
    console.log(`  ✗ ${p.word} (${p.id}): ${error.message ?? error}`);
  }
}
writeFileSync(
  join(OUT, `restore-log-${startedAt.replace(/[:.]/g, '-')}.json`),
  JSON.stringify({ target: TARGET, startedAt, backup: backupFile, words: log }, null, 2)
);
console.log(`${log.filter(l => l.ok).length} restored, ${log.filter(l => !l.ok).length} failed`);
