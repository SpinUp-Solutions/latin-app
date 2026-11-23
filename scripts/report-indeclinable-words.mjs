#!/usr/bin/env node
/**
 * Read-only report of nouns and adjectives in VOCABULARY_WORDS_COLLECTION that
 * may be indeclinable, flagged either by headword list (ignoring macrons, same
 * part of speech) or by having a uniform inflection table.
 *
 * Writes nothing to Firestore. An admin updates flagged words in the editor.
 *
 * Usage:
 *   node scripts/report-indeclinable-words.mjs [--project <projectId>] [--include-marked] [--json]
 */

import { pathToFileURL } from 'node:url';
import { VOCABULARY_WORDS_COLLECTION } from '../shared/constants/firestore.ts';
import { isUniformTable } from '../src/utils/morphologyForms.ts';

export const INDECLINABLE_NOUN_HEADWORDS = new Set([
  'fas',
  'nefas',
  'instar',
  'nihil',
  'nil',
  'opus',
  'mane',
  'secus',
  'pondo',
  'gummi',
  'sinapi',
]);

export const INDECLINABLE_ADJECTIVE_HEADWORDS = new Set([
  'frugi',
  'nequam',
  'quot',
  'tot',
  'aliquot',
  'totidem',
  'quotquot',
  'praesto',
  'potis',
  'pote',
  'semis',
  'mille',
]);

const CARDINAL_TENS_AND_CENTUM = [
  'viginti',
  'triginta',
  'quadraginta',
  'quinquaginta',
  'sexaginta',
  'septuaginta',
  'octoginta',
  'nonaginta',
  'centum',
];

const INDECLINABLE_CARDINAL_TOKENS = new Set([
  'quattuor',
  'quinque',
  'sex',
  'septem',
  'octo',
  'novem',
  'decem',
  'undecim',
  'duodecim',
  'tredecim',
  'quattuordecim',
  'quindecim',
  'sedecim',
  'septendecim',
  'octodecim',
  'novendecim',
  ...CARDINAL_TENS_AND_CENTUM,
  ...CARDINAL_TENS_AND_CENTUM.flatMap(base => [`duode${base}`, `unde${base}`]),
  'mille',
]);

export function normalizeHeadword(word) {
  return String(word ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0304]/g, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ');
}

export function isIndeclinableCardinalHeadword(normalized) {
  if (!normalized) return false;
  if (INDECLINABLE_CARDINAL_TOKENS.has(normalized)) return true;
  const tokens = normalized.split(' ').filter(token => token !== 'et');
  return tokens.length > 1 && tokens.every(token => INDECLINABLE_CARDINAL_TOKENS.has(token));
}

export function matchesIndeclinableHeadword(word, partOfSpeech) {
  const normalized = normalizeHeadword(word);
  if (!normalized) return false;
  if (partOfSpeech === 'noun') return INDECLINABLE_NOUN_HEADWORDS.has(normalized);
  if (partOfSpeech === 'adjective') {
    return INDECLINABLE_ADJECTIVE_HEADWORDS.has(normalized) || isIndeclinableCardinalHeadword(normalized);
  }
  return false;
}

function getInflectionTableForUniformCheck(data) {
  if (data.part_of_speech === 'noun') return data.declension_table;
  if (data.part_of_speech === 'adjective') {
    const degrees = data.degrees_table;
    if (degrees && typeof degrees === 'object' && 'positive' in degrees) {
      return degrees.positive;
    }
    return degrees;
  }
  return null;
}

/**
 * Inspects vocabulary documents and returns flagged nouns/adjectives.
 * Pure and read-only.
 */
export function findIndeclinableCandidates(docs, { includeMarked = false } = {}) {
  const flagged = [];

  for (const doc of docs) {
    const data = typeof doc.data === 'function' ? doc.data() : doc.data;
    if (!data || typeof data !== 'object' || data._deletionPending) continue;
    if (data.part_of_speech !== 'noun' && data.part_of_speech !== 'adjective') continue;

    const declension = typeof data.declension === 'string' ? data.declension : null;
    if (!includeMarked && declension === 'indeclinable') continue;

    const reasons = [];
    if (matchesIndeclinableHeadword(data.word, data.part_of_speech)) {
      reasons.push('headword');
    }
    if (isUniformTable(getInflectionTableForUniformCheck(data))) {
      reasons.push('uniform-table');
    }

    if (reasons.length > 0) {
      flagged.push({
        id: doc.id,
        word: typeof data.word === 'string' ? data.word : '',
        partOfSpeech: data.part_of_speech,
        declension,
        reasons,
      });
    }
  }

  return flagged.sort((a, b) => a.word.localeCompare(b.word) || a.id.localeCompare(b.id));
}

/** Reads VOCABULARY_WORDS_COLLECTION from a Firestore instance without writing anything. */
export async function reportIndeclinableWords(db, options = {}) {
  const snapshot = await db.collection(VOCABULARY_WORDS_COLLECTION).get();
  return findIndeclinableCandidates(snapshot.docs, options);
}

export function parseArgs(argv) {
  const options = { projectId: null, includeMarked: false, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--include-marked') {
      options.includeMarked = true;
    } else if (arg === '--project') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--project requires a project ID');
      options.projectId = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

export function formatReport(flagged) {
  if (flagged.length === 0) {
    return `No candidate indeclinable nouns or adjectives found in ${VOCABULARY_WORDS_COLLECTION}.`;
  }
  const lines = [
    `Found ${flagged.length} candidate indeclinable word(s) in ${VOCABULARY_WORDS_COLLECTION} (read-only):`,
    '',
    ['ID', 'WORD', 'POS', 'DECLENSION', 'REASON'].join('\t'),
    ...flagged.map(entry =>
      [entry.id, entry.word, entry.partOfSpeech, entry.declension ?? '(none)', entry.reasons.join(', ')].join('\t')
    ),
  ];
  return lines.join('\n');
}

export function usage() {
  return [
    'Usage: node scripts/report-indeclinable-words.mjs [options]',
    '',
    'Read-only report of nouns and adjectives in vocabulary_words_v5 that match',
    'the indeclinable headword list or have a uniform inflection table.',
    '',
    'Options:',
    '  --project <id>     Firebase project ID (defaults to env vars / ADC)',
    '  --include-marked   Include words already marked declension="indeclinable"',
    '  --json             Output report as JSON',
    '  -h, --help         Show this help message',
  ].join('\n');
}

async function createReadOnlyFirestore(projectIdOverride) {
  const [{ applicationDefault, cert, deleteApp, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ]);

  const projectId =
    projectIdOverride ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;

  const appConfig = process.env.FIRESTORE_EMULATOR_HOST
    ? { projectId: projectId || 'demo-latin-app' }
    : process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
      ? {
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
          projectId,
        }
      : {
          credential: applicationDefault(),
          ...(projectId ? { projectId } : {}),
        };

  const app = initializeApp(appConfig, `report-indeclinable-words-${process.pid}`);
  return {
    db: getFirestore(app),
    close: () => deleteApp(app),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const { db, close } = await createReadOnlyFirestore(options.projectId);
  try {
    const flagged = await reportIndeclinableWords(db, { includeMarked: options.includeMarked });
    if (options.json) {
      console.log(JSON.stringify({ collection: VOCABULARY_WORDS_COLLECTION, count: flagged.length, flagged }, null, 2));
    } else {
      console.log(formatReport(flagged));
    }
  } finally {
    await close();
  }
}

const isEntrypoint = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntrypoint) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
