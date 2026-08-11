import type { DocumentData, Firestore, Transaction } from 'firebase-admin/firestore';

const VOCABULARY_POOL_COLLECTION = 'vocabulary_pools';
const DELETED_VOCABULARY_POOL_COLLECTION = 'deleted_vocabulary_pools';

export class VocabularyPoolAssignmentError extends Error {
  constructor(
    public readonly code: 'VOCABULARY_POOL_ARCHIVED' | 'VOCABULARY_POOL_NOT_FOUND' | 'VOCABULARY_POOL_STATE_CONFLICT',
    message: string,
    public readonly status = 409
  ) {
    super(message);
    this.name = 'VocabularyPoolAssignmentError';
  }
}

type ReferenceSlots = Map<string, Map<string, number>>;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

function referencedPoolSlots(value: unknown): ReferenceSlots {
  const root = record(value);
  const slots: ReferenceSlots = new Map();
  if (!root) return slots;
  const add = (poolId: unknown, slot: string) => {
    if (typeof poolId !== 'string' || !poolId.trim()) return;
    const poolSlots = slots.get(poolId) ?? new Map<string, number>();
    poolSlots.set(slot, (poolSlots.get(slot) ?? 0) + 1);
    slots.set(poolId, poolSlots);
  };
  add(root.vocabulary_pool, 'direct:vocabulary_pool');
  add(root.vocabularyPoolId, 'direct:vocabularyPoolId');

  if (!Array.isArray(root.pages)) return slots;
  root.pages.forEach((pageValue, pageIndex) => {
    const page = record(pageValue);
    if (!page || !Array.isArray(page.items)) return;
    const pageSlot = typeof page.id === 'string' && page.id ? page.id : `index-${pageIndex}`;
    page.items.forEach((itemValue, itemIndex) => {
      const item = record(itemValue);
      const data = record(item?.data);
      const config = record(data?.generatorConfig);
      if (!item || !config || config.wordSource !== 'pool') return;
      const itemSlot = typeof item.id === 'string' && item.id ? item.id : `index-${itemIndex}`;
      add(config.poolId, `exercise:${pageSlot}:${itemSlot}`);
    });
  });
  return slots;
}

/**
 * Validates vocabulary-pool references inside the same transaction as an
 * authoring write. Reading active pool and tombstone documents rejects stale
 * state. The returned callback must run after every other transaction read; it
 * increments the pool revision so deletion conflicts with an assignment that
 * commits after its usage scan. Existing archived references may be retained,
 * but never added.
 */
export async function assertVocabularyPoolAssignmentsAllowedInTransaction(
  transaction: Transaction,
  db: Firestore,
  existingValue: DocumentData | undefined,
  nextValue: DocumentData
): Promise<() => void> {
  const existingPoolSlots = referencedPoolSlots(existingValue);
  const nextPoolSlots = referencedPoolSlots(nextValue);
  const affectedPoolIds = new Set([...existingPoolSlots.keys(), ...nextPoolSlots.keys()]);
  if (affectedPoolIds.size === 0) return () => undefined;

  const states = await Promise.all(
    [...affectedPoolIds].map(async poolId => {
      const activeRef = db.collection(VOCABULARY_POOL_COLLECTION).doc(poolId);
      const tombstoneRef = db.collection(DELETED_VOCABULARY_POOL_COLLECTION).doc(poolId);
      const [active, tombstone] = await Promise.all([transaction.get(activeRef), transaction.get(tombstoneRef)]);
      return { poolId, activeRef, active, tombstone };
    })
  );

  for (const { poolId, active, tombstone } of states) {
    const nextSlots = nextPoolSlots.get(poolId) ?? new Map<string, number>();
    const existingSlots = existingPoolSlots.get(poolId) ?? new Map<string, number>();
    const nextCount = [...nextSlots.values()].reduce((total, count) => total + count, 0);
    if (nextCount === 0) continue;
    if (active.exists && !tombstone.exists) continue;
    if (
      !active.exists &&
      tombstone.exists &&
      [...nextSlots].every(([slot, count]) => count <= (existingSlots.get(slot) ?? 0))
    )
      continue;
    if (active.exists && tombstone.exists) {
      throw new VocabularyPoolAssignmentError(
        'VOCABULARY_POOL_STATE_CONFLICT',
        `Vocabulary pool ${poolId} has conflicting active and archived state`
      );
    }
    if (tombstone.exists) {
      throw new VocabularyPoolAssignmentError(
        'VOCABULARY_POOL_ARCHIVED',
        `Vocabulary pool ${poolId} is archived and cannot be assigned`
      );
    }
    throw new VocabularyPoolAssignmentError('VOCABULARY_POOL_NOT_FOUND', `Vocabulary pool ${poolId} does not exist`);
  }

  return () => {
    for (const { activeRef, active, tombstone } of states) {
      if (!active.exists || tombstone.exists) continue;
      const currentRevision = active.data()?._assignmentRevision;
      transaction.update(activeRef, {
        _assignmentRevision: Number.isSafeInteger(currentRevision) ? Number(currentRevision) + 1 : 1,
      });
    }
  };
}
