import { FieldPath, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { VOCABULARY_POOL_COLLECTION } from '@/shared/constants/firestore';
import { createVocabularyPoolResolver, poolSourceIds } from '@/src/lib/vocabulary-pools/linked-pools.server';
import {
  isVocabularyPoolCreationPending,
  VocabularyPoolStateError,
} from '@/src/lib/vocabulary-pools/pool-state.server';
import type { VocabularyPool, VocabularyPoolSummary } from '@/src/types/vocabulary-pool';
import { toVocabularyPoolSummary } from '@/src/utils/vocabularyPoolSummary';

export const POOL_SUMMARY_FIELDS = [
  'name',
  'description',
  'metadata',
  '_creationPending',
  '_deletionPending',
  'sourcePoolIds',
];
export const POOL_LIST_READ_BATCH_SIZE = 200;
const POOL_LIST_RESOLVE_CONCURRENCY = 8;

const toDateValue = (value: unknown) =>
  value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate()
    : value;

type PoolListFilters = {
  difficulty: string | null;
  isActive: boolean | null;
  tags?: string[];
};

export async function summarizeVocabularyPool(
  db: Firestore,
  doc: DocumentSnapshot,
  filters?: PoolListFilters
): Promise<VocabularyPoolSummary | null> {
  const rawData = doc.data();
  if (!rawData || isVocabularyPoolCreationPending(rawData) || rawData._deletionPending) return null;
  const data = rawData as Partial<VocabularyPool>;
  const summary = toVocabularyPoolSummary(doc.id, {
    ...data,
    metadata: data.metadata
      ? {
          ...data.metadata,
          createdAt: toDateValue(data.metadata.createdAt),
          updatedAt: toDateValue(data.metadata.updatedAt),
        }
      : undefined,
  });
  const tags = filters?.tags ?? [];
  if (
    filters &&
    ((filters.difficulty && summary.metadata.difficulty !== filters.difficulty) ||
      (filters.isActive !== null && summary.metadata.isActive !== filters.isActive) ||
      (tags.length > 0 && !summary.metadata.tags.some(tag => tags.includes(tag))))
  )
    return null;

  if (poolSourceIds(rawData).length > 0) {
    // The graph limit belongs to this pool's dependency graph, not the catalog
    // or the sum of unrelated graphs encountered while listing a page.
    const effective = await createVocabularyPoolResolver(db).resolve(doc.id);
    summary.metadata = { ...summary.metadata, wordCount: effective.metadata.wordCount };
  }
  return summary;
}

/** Live counts require a catalog scan; bound reads and retain only the requested page plus lookahead. */
export async function listVocabularyPoolsByWordCount(
  db: Firestore,
  options: PoolListFilters & { limit: number; sortOrder: 'asc' | 'desc'; lastPoolId: string | null }
) {
  const collection = db.collection(VOCABULARY_POOL_COLLECTION);
  const compare = (a: VocabularyPoolSummary, b: VocabularyPoolSummary) =>
    (options.sortOrder === 'asc' ? 1 : -1) *
    (a.metadata.wordCount - b.metadata.wordCount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cursor = options.lastPoolId
    ? await summarizeVocabularyPool(db, await collection.doc(options.lastPoolId).get(), options)
    : null;
  if (options.lastPoolId && !cursor)
    throw new VocabularyPoolStateError('Pool list changed. Refresh the list.', 'VOCABULARY_POOL_CURSOR_STALE');

  const page: VocabularyPoolSummary[] = [];
  const query = collection
    .orderBy(FieldPath.documentId())
    .select(...POOL_SUMMARY_FIELDS)
    .limit(POOL_LIST_READ_BATCH_SIZE);
  let lastScanned: DocumentSnapshot | undefined;
  while (true) {
    const snapshot = await (lastScanned ? query.startAfter(lastScanned) : query).get();
    for (let offset = 0; offset < snapshot.docs.length; offset += POOL_LIST_RESOLVE_CONCURRENCY) {
      const summaries = await Promise.all(
        snapshot.docs
          .slice(offset, offset + POOL_LIST_RESOLVE_CONCURRENCY)
          .map(doc => summarizeVocabularyPool(db, doc, options))
      );
      for (const pool of summaries) {
        if (!pool || (cursor && compare(pool, cursor) <= 0)) continue;
        page.push(pool);
        page.sort(compare);
        if (page.length > options.limit + 1) page.pop();
      }
    }
    if (snapshot.docs.length < POOL_LIST_READ_BATCH_SIZE) break;
    lastScanned = snapshot.docs.at(-1);
  }

  const hasMore = page.length > options.limit;
  const pools = page.slice(0, options.limit);
  return { pools, hasMore, lastPoolId: pools.at(-1)?.id ?? null };
}
