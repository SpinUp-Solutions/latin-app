import type { CollectionReference, DocumentData, Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FieldPath } from 'firebase-admin/firestore';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

export const VOCABULARY_POOL_COLLECTION = 'vocabulary_pools';
export const DELETED_VOCABULARY_POOL_COLLECTION = 'deleted_vocabulary_pools';
export const VOCABULARY_POOL_ARCHIVE_COLLECTION = 'vocabulary_pool_archives';
export const VOCABULARY_POOL_DELETION_CHALLENGE_COLLECTION = 'vocabulary_pool_deletion_challenges';

export type ReadableVocabularyPool = {
  data: DocumentData;
  source: 'active' | 'archive';
  words: CollectionReference<DocumentData>;
};

export class VocabularyPoolArchiveIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VocabularyPoolArchiveIntegrityError';
  }
}

/**
 * Returns active content or the immutable archive selected by the pool
 * tombstone. Archived assignments remain supported for playback but are not
 * returned by management lists and cannot be edited or newly selected there.
 */
export async function getReadableVocabularyPool(db: Firestore, poolId: string): Promise<ReadableVocabularyPool | null> {
  const active = await db.collection(VOCABULARY_POOL_COLLECTION).doc(poolId).get();
  if (active.exists) {
    return {
      data: active.data() ?? {},
      source: 'active',
      words: db.collection(VOCABULARY_WORDS_COLLECTION),
    };
  }

  const tombstone = await db.collection(DELETED_VOCABULARY_POOL_COLLECTION).doc(poolId).get();
  const archiveId = tombstone.data()?.archiveId;
  if (!tombstone.exists || typeof archiveId !== 'string' || !archiveId) return null;

  const archive = await db.collection(VOCABULARY_POOL_ARCHIVE_COLLECTION).doc(archiveId).get();
  if (!archive.exists) return null;
  return {
    data: archive.data() ?? {},
    source: 'archive',
    words: archive.ref.collection('words'),
  };
}

export async function loadVocabularyPoolWords(
  pool: ReadableVocabularyPool,
  selectedWordIds?: readonly string[],
  options: { maxWords?: number; queryConcurrency?: number } = {}
) {
  const poolWordIds = Array.isArray(pool.data.wordDocIds)
    ? pool.data.wordDocIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
    : [];
  const allowedWordIds = new Set(poolWordIds);
  const selectedIds = selectedWordIds ? selectedWordIds.filter(id => allowedWordIds.has(id)) : poolWordIds;
  const wordIds =
    options.maxWords === undefined ? selectedIds : selectedIds.slice(0, Math.max(0, Math.floor(options.maxWords)));
  if (wordIds.length === 0) return [];

  const chunks = Array.from({ length: Math.ceil(wordIds.length / 10) }, (_, index) =>
    wordIds.slice(index * 10, index * 10 + 10)
  );
  const snapshots = [];
  const concurrency = Math.max(1, Math.min(10, Math.floor(options.queryConcurrency ?? 4)));
  for (let index = 0; index < chunks.length; index += concurrency) {
    snapshots.push(
      ...(await Promise.all(
        chunks
          .slice(index, index + concurrency)
          .map(chunk => pool.words.where(FieldPath.documentId(), 'in', chunk).get())
      ))
    );
  }
  const byId = new Map(
    snapshots
      .flatMap(snapshot => snapshot.docs)
      .map((document: QueryDocumentSnapshot) => [document.id, document] as const)
  );
  return wordIds.map(id => byId.get(id)).filter((document): document is QueryDocumentSnapshot => Boolean(document));
}

const ARCHIVE_BATCH_MAX_WRITES = 300;
const ARCHIVE_BATCH_ESTIMATED_BYTES = 6 * 1024 * 1024;

const estimatedDocumentBytes = (data: DocumentData): number => {
  try {
    return Buffer.byteLength(
      JSON.stringify(data, (_key, value) => {
        if (value instanceof Date) return value.toISOString();
        if (value && typeof value === 'object' && typeof value.toDate === 'function')
          return value.toDate().toISOString();
        return value;
      })
    );
  } catch {
    return ARCHIVE_BATCH_ESTIMATED_BYTES;
  }
};

const isFirestoreBatchSizeError = (error: unknown): boolean => {
  const code = error && typeof error === 'object' && 'code' in error ? Number(error.code) : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return [3, 8, 13].includes(code ?? -1) && /(?:too (?:big|large)|size|resource exhausted|payload)/i.test(message);
};

async function commitArchiveWords(
  db: Firestore,
  archiveWords: CollectionReference<DocumentData>,
  words: QueryDocumentSnapshot[]
): Promise<void> {
  try {
    const batch = db.batch();
    words.forEach(word => batch.set(archiveWords.doc(word.id), word.data()));
    await batch.commit();
  } catch (error) {
    if (!isFirestoreBatchSizeError(error) || words.length <= 1) throw error;
    const midpoint = Math.ceil(words.length / 2);
    await commitArchiveWords(db, archiveWords, words.slice(0, midpoint));
    await commitArchiveWords(db, archiveWords, words.slice(midpoint));
  }
}

/** Writes immutable per-word snapshots in bounded batches before the active pool is removed. */
export async function writeVocabularyPoolWordArchive(
  db: Firestore,
  archiveId: string,
  poolData: DocumentData
): Promise<number> {
  const rawWordIds = poolData.wordDocIds;
  if (
    !Array.isArray(rawWordIds) ||
    rawWordIds.some(wordId => typeof wordId !== 'string' || wordId.trim().length === 0)
  ) {
    throw new VocabularyPoolArchiveIntegrityError('Pool contains invalid word references and cannot be archived');
  }
  const expectedWordIds = new Set(rawWordIds);
  const activePool: ReadableVocabularyPool = {
    data: poolData,
    source: 'active',
    words: db.collection(VOCABULARY_WORDS_COLLECTION),
  };
  const words = await loadVocabularyPoolWords(activePool);
  const uniqueWords = Array.from(new Map(words.map(word => [word.id, word])).values());
  const archivedIds = new Set(uniqueWords.map(word => word.id));
  const missingWordIds = [...expectedWordIds].filter(wordId => !archivedIds.has(wordId));
  if (missingWordIds.length > 0) {
    throw new VocabularyPoolArchiveIntegrityError(
      `Pool archive is missing ${missingWordIds.length} referenced ${missingWordIds.length === 1 ? 'word' : 'words'}`
    );
  }
  const archiveWords = db.collection(VOCABULARY_POOL_ARCHIVE_COLLECTION).doc(archiveId).collection('words');

  let pending: QueryDocumentSnapshot[] = [];
  let pendingBytes = 0;
  for (const word of uniqueWords) {
    const wordBytes = estimatedDocumentBytes(word.data()) + word.id.length + 256;
    if (
      pending.length > 0 &&
      (pending.length >= ARCHIVE_BATCH_MAX_WRITES || pendingBytes + wordBytes > ARCHIVE_BATCH_ESTIMATED_BYTES)
    ) {
      await commitArchiveWords(db, archiveWords, pending);
      pending = [];
      pendingBytes = 0;
    }
    pending.push(word);
    pendingBytes += wordBytes;
  }
  if (pending.length > 0) await commitArchiveWords(db, archiveWords, pending);
  return uniqueWords.length;
}
