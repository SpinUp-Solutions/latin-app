import {
  Filter,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import { DomainError } from '@/src/lib/domain-error';
import { serializeVocabularyWord } from '@/src/lib/vocabulary/word-serialization.server';
import { canonicalHeadwordKey, HEADWORD_KEY_FIELD } from '@/src/utils/vocabulary/headword';

export const EXISTING_WORDS_SAMPLE_SIZE = 5;
const KEY_PAGE_SIZE = 100;

const keyRange = (from: string, until: string) =>
  Filter.and(Filter.where('sort_key', '>=', from), Filter.where('sort_key', '<', until));

/**
 * Old sort keys are macron-free, but can have arbitrary case and surrounding whitespace. Firestore
 * can't lowercase or trim in a query. Probe indexed prefixes (at most four case variants), then
 * compare the projected keys, without downloading paradigms or requiring a production backfill.
 */
function candidateKeys(key: string) {
  const chars = Array.from(key);
  let prefixes = [''];
  for (const char of chars.slice(0, 2)) {
    prefixes = prefixes.flatMap(prefix => [...new Set([char, char.toUpperCase()])].map(c => prefix + c));
  }
  const tail = chars.slice(2).join('');
  const ranges = prefixes.flatMap(prefix =>
    tail
      ? [keyRange(prefix + tail.toUpperCase(), prefix + tail + '\u{10ffff}')]
      : // An exact short word, possibly followed by whitespace; don't scan every word starting with 'a'.
        [keyRange(prefix, prefix + '!'), keyRange(prefix + '\u007f', prefix + '\uffff')]
  );
  // All leading whitespace removed by trim() falls in these three spans. None includes an ASCII
  // or Latin-1 letter. Comparing the actual word below discards punctuation and other false positives.
  return Filter.or(...ranges, keyRange('', '!'), keyRange('\u007f', '\u00a1'), keyRange('\u1680', '\uff00'));
}

export async function findWordsWithHeadword(db: Firestore, word: string, transaction?: Transaction) {
  const key = canonicalHeadwordKey(word);
  if (!key) return [];
  const words = db.collection(VOCABULARY_WORDS_COLLECTION);
  const hits = new Map<string, FirebaseFirestore.DocumentReference>();
  async function collect(candidates: Query) {
    const query = candidates.select('sort_key', 'word', '_deletionPending').limit(KEY_PAGE_SIZE);
    let cursor: QueryDocumentSnapshot | undefined;
    do {
      const page = cursor ? query.startAfter(cursor) : query;
      const { docs } = await (transaction ? transaction.get(page) : page.get());
      for (const doc of docs) {
        const data = doc.data();
        if (!data._deletionPending && canonicalHeadwordKey(data.word) === key) hits.set(doc.id, doc.ref);
        if (hits.size === EXISTING_WORDS_SAMPLE_SIZE) return;
      }
      cursor = docs.length === KEY_PAGE_SIZE ? docs.at(-1) : undefined;
    } while (cursor);
  }
  await collect(words.where(HEADWORD_KEY_FIELD, '==', key));
  // If the equality index already warns the admin, no compatibility scan is needed.
  if (!hits.size) await collect(words.where(candidateKeys(key)).orderBy('sort_key'));
  if (!hits.size) return [];
  const refs = [...hits.values()];
  const docs = await (transaction ? transaction.getAll(...refs) : db.getAll(...refs));
  return docs.flatMap(doc => {
    const data = doc.data();
    return data && !data._deletionPending && canonicalHeadwordKey(data.word) === key
      ? [{ ...serializeVocabularyWord(data), id: doc.id }]
      : [];
  });
}

export async function assertHeadwordAvailable(db: Firestore, word: string, transaction: Transaction) {
  const matches = await findWordsWithHeadword(db, word, transaction);
  if (matches.length) throw new WordAlreadyExistsError(word, matches);
}

/** Real homographs are allowed, but only after the admin has seen the conflict. */
export class WordAlreadyExistsError extends DomainError {
  readonly code = 'WORD_ALREADY_EXISTS';
  readonly status = 409;
  readonly details: { existingWords: Record<string, unknown>[]; headword: string };

  constructor(word: string, existingWords: Record<string, unknown>[]) {
    super(`"${word.trim()}" is already in the vocabulary.`);
    this.name = 'WordAlreadyExistsError';
    this.details = { existingWords, headword: word };
  }
}
