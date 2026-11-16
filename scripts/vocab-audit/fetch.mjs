// Step 1: back up and download the vocabulary collection. Read-only.
//
// Writes two things:
//   - a backup file, <backup dir>/<project>-<collection>-<time>.ndjson.gz, holding every
//     document exactly as Firestore returned it (typed values, so restore.mjs can put a
//     word back without losing the difference between a timestamp and a string);
//   - the working copy the audit reads: out/docs/<id>.json (plain JSON) and out/index.json.
//
// The backup directory is outside the repository by default, so removing a worktree does
// not remove the backup. A backup file is never overwritten.
//
// Usage: node scripts/vocab-audit/fetch.mjs [--since 2026-05-11T00:00:00Z] [--backup-dir <dir>]
//   --since      only words created on or after this time (default: the whole collection)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { COLLECTION, PROJECT, decodeFields, docId, firestore } from './firestore-rest.mjs';
import { BACKUPS, OUT } from './paths.mjs';

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
};
const since = arg('since');
const backupDir = arg('backup-dir') ?? BACKUPS;

async function listAll() {
  const documents = [];
  let pageToken = '';
  do {
    const page = await firestore(`/${COLLECTION}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`);
    documents.push(...(page.documents ?? []));
    pageToken = page.nextPageToken ? encodeURIComponent(page.nextPageToken) : '';
  } while (pageToken);
  return documents;
}

// createdAt is stored as an ISO string on most words and as a timestamp on some.
async function createdSince(value) {
  const rows = await firestore(':runQuery', {
    structuredQuery: {
      from: [{ collectionId: COLLECTION }],
      where: { fieldFilter: { field: { fieldPath: 'createdAt' }, op: 'GREATER_THAN_OR_EQUAL', value } },
    },
  });
  return rows.filter(row => row.document).map(row => row.document);
}

const fetchedAt = new Date().toISOString();
const documents = since
  ? [...(await createdSince({ stringValue: since })), ...(await createdSince({ timestampValue: since }))]
  : await listAll();
documents.sort((a, b) => a.name.localeCompare(b.name));
if (!documents.length) {
  console.error(`${PROJECT}/${COLLECTION}: no documents found; nothing written.`);
  process.exit(1);
}

// Backup first: if anything below fails, the backup is already on disk.
mkdirSync(backupDir, { recursive: true });
const backupFile = join(
  backupDir,
  `${PROJECT}-${COLLECTION}${since ? '-partial' : ''}-${fetchedAt.replace(/[:.]/g, '-')}.ndjson.gz`
);
const raw = Buffer.from(documents.map(d => JSON.stringify(d)).join('\n') + '\n');
writeFileSync(backupFile, gzipSync(raw), { flag: 'wx' });
writeFileSync(
  `${backupFile}.json`,
  JSON.stringify(
    {
      project: PROJECT,
      collection: COLLECTION,
      fetchedAt,
      since,
      documents: documents.length,
      sha256: createHash('sha256').update(raw).digest('hex'),
    },
    null,
    2
  ),
  { flag: 'wx' }
);

// Working copy. Words from an earlier download that are no longer there are removed.
const dir = join(OUT, 'docs');
mkdirSync(dir, { recursive: true });
const ids = new Set(documents.map(d => docId(d.name)));
for (const file of readdirSync(dir)) if (!ids.has(file.replace(/\.json$/, ''))) rmSync(join(dir, file));
const index = [];
for (const document of documents) {
  const id = docId(document.name);
  const data = decodeFields(document.fields ?? {});
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, updateTime: document.updateTime, data }, null, 2));
  index.push({ id, word: data.word, part_of_speech: data.part_of_speech, createdAt: data.createdAt });
}
writeFileSync(
  join(OUT, 'index.json'),
  JSON.stringify({ project: PROJECT, since, fetchedAt, backup: backupFile, words: index }, null, 2)
);
const stale = ['edited', 'progress'].filter(d => existsSync(join(OUT, d)) && readdirSync(join(OUT, d)).length);
console.log(`${PROJECT}/${COLLECTION}: ${index.length} words${since ? ` since ${since}` : ''}`);
console.log(`backup:  ${backupFile}`);
console.log(`working: ${dir}`);
if (stale.length)
  console.log(`note: out/${stale.join(' and out/')} hold edits from an earlier download; clear them before a new run.`);
