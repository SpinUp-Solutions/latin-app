// Firestore REST helpers for the vocabulary audit. Auth comes from
// `gcloud auth print-access-token`; the token is never printed.
// With FIRESTORE_EMULATOR_HOST set (for example 127.0.0.1:8080) everything goes to the
// emulator instead, which is how apply.mjs and restore.mjs are tried out.
import { execFileSync } from 'node:child_process';

export const PROJECT = process.env.VOCAB_AUDIT_PROJECT ?? 'latin-app-prod';
export const COLLECTION = 'vocabulary_words_v5';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const DATABASE = `projects/${PROJECT}/databases/(default)`;
const BASE = `${EMULATOR ? `http://${EMULATOR}` : 'https://firestore.googleapis.com'}/v1/${DATABASE}/documents`;
export const TARGET = `${PROJECT}${EMULATOR ? ` (emulator ${EMULATOR})` : ''}/${COLLECTION}`;
export const docName = id => `${DATABASE}/documents/${COLLECTION}/${id}`;

let token;
function accessToken() {
  token ??= EMULATOR ? 'owner' : execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  return token;
}

export async function firestore(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Firestore ${response.status}: ${await response.text()}`);
  return response.json();
}

/** Current documents by id (missing ones are left out), read in chunks. */
export async function getDocuments(ids) {
  const found = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await firestore(':batchGet', { documents: ids.slice(i, i + 100).map(docName) });
    for (const row of rows) if (row.found) found.set(docId(row.found.name), row.found);
  }
  return found;
}

// The app's own word writes (src/app/api/admin/words/route.ts) do two things besides the
// write: they refuse while a content sync holds its lock, and they bump the vocabulary
// content revision. mutate() does both, in one transaction with the writes.
const LOCK = `${DATABASE}/documents/content_sync_locks/prod-content-to-dev`;
const CONTENT_STATE = `${DATABASE}/documents/vocabulary_content_state/global`;

/** Commits `writes` atomically, the way the app writes a word. Returns the write results. */
export async function mutate(writes) {
  const { transaction } = await firestore(':beginTransaction', {});
  const [lock] = await firestore(':batchGet', { documents: [LOCK], transaction });
  if (lock.found) {
    await firestore(':rollback', { transaction });
    throw new Error('A content sync holds the vocabulary lock; try again when it has finished.');
  }
  const { writeResults } = await firestore(':commit', {
    transaction,
    writes: [
      ...writes,
      {
        update: { name: CONTENT_STATE },
        updateMask: { fieldPaths: [] },
        updateTransforms: [
          { fieldPath: 'revision', increment: { integerValue: '1' } },
          { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
        ],
      },
    ],
  });
  return writeResults;
}

/** Plain JSON → Firestore REST typed value. */
export function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number')
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
}

/** Firestore REST typed value → plain JSON. Timestamps become ISO strings. */
export function decode(value) {
  if (value == null) return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields ?? {});
  throw new Error(`Unknown Firestore value: ${JSON.stringify(value)}`);
}

export function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

export const docId = name => name.split('/').pop();
