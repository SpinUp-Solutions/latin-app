import { createLinkedVocabularyPool, resolveVocabularyPool } from '@/src/lib/vocabulary-pools/linked-pools.server';
import { createHash } from 'node:crypto';
import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import {
  DELETED_VOCABULARY_POOL_COLLECTION,
  VOCABULARY_POOL_COLLECTION,
  VOCABULARY_WORDS_COLLECTION,
} from '@/shared/constants/firestore';
import type { CreateVocabularyPoolFromPoolsRequest } from '@/shared/types/vocabulary/pool-requests';
import { estimateFirestoreDocumentBytes } from '@/src/lib/tests/firestore-size';
import { isVocabularyPoolCreationPending } from '@/src/lib/vocabulary-pools/pool-state.server';
import {
  runVocabularyContentExclusiveMutation,
  runVocabularyContentMutation,
} from '@/src/lib/vocabulary-pools/sync-lock.server';
import { buildPoolSearchTokens } from '@/src/utils/vocabularyPoolSummary';

/** Keep one staged pool update plus at most 199 word updates in every transaction. */
export const VOCABULARY_POOL_COPY_WORD_BATCH_SIZE = 199;
export const VOCABULARY_POOL_COPY_MAX_DOCUMENT_BYTES = 900 * 1024;
const VOCABULARY_POOL_COPY_READ_CHUNK_SIZE = 200;

type SourcePoolState = {
  id: string;
  data: DocumentData;
};

type CreationPendingMarker = {
  actorUid: string;
  requestId: string;
  requestFingerprint: string;
  sourceMembershipFingerprint: string;
  sourcePoolIds: string[];
  processedWordCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type CompletedCopyMarker = {
  actorUid: string;
  requestId: string;
  requestFingerprint: string;
  sourceMembershipFingerprint: string;
  completedAt: Date;
};

export class VocabularyPoolFromPoolsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'VocabularyPoolFromPoolsError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isFirestoreDocumentId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value !== '.' && value !== '..' && !value.includes('/');

const markerRecord = (value: unknown): Record<string, unknown> | null => (isRecord(value) ? value : null);

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const canonicalRequest = (input: CreateVocabularyPoolFromPoolsRequest) => ({
  name: input.name.trim(),
  description: input.description.trim(),
  difficulty: input.difficulty ?? 'beginner',
  tags: [...new Set((input.tags ?? []).map(tag => tag.trim().toLowerCase()).filter(Boolean))],
  sourcePoolIds: [...new Set(input.sourcePoolIds)],
  wordDocIds: [...new Set(input.wordDocIds ?? [])],
  requestId: input.requestId,
});

export function vocabularyPoolCopyRequestFingerprint(input: CreateVocabularyPoolFromPoolsRequest): string {
  return digest(canonicalRequest(input));
}

function sourceMembershipFingerprint(
  sourcePoolIds: readonly string[],
  sourceStates: readonly SourcePoolState[]
): string {
  return digest({
    sourcePoolIds: [...sourcePoolIds],
    memberships: sourceStates.map(source => ({
      id: source.id,
      wordDocIds: source.data.wordDocIds,
    })),
  });
}

function operationDocumentId(actorUid: string, requestId: string): string {
  return `copy-${digest({ actorUid, requestId }).slice(0, 48)}`;
}

function isPendingDeletion(value: unknown): boolean {
  return Boolean(value);
}

function sourceWordIds(data: DocumentData, sourceId: string): string[] {
  if (!Array.isArray(data.wordDocIds)) {
    throw new VocabularyPoolFromPoolsError(
      `Source pool ${sourceId} has incomplete word membership data. Repair the source pool and try again.`,
      409,
      'VOCABULARY_POOL_SOURCE_INCOMPLETE'
    );
  }

  const ids = data.wordDocIds as unknown[];
  if (ids.some(id => !isFirestoreDocumentId(id))) {
    throw new VocabularyPoolFromPoolsError(
      `Source pool ${sourceId} contains an invalid word reference and cannot be copied.`,
      409,
      'VOCABULARY_POOL_SOURCE_MEMBERSHIP_INVALID'
    );
  }
  const typedIds = ids as string[];
  return typedIds;
}

function assertSourceState(sourceId: string, active: DocumentSnapshot, tombstone: DocumentSnapshot): SourcePoolState {
  if (!active.exists) {
    if (tombstone.exists) {
      throw new VocabularyPoolFromPoolsError(
        `Source pool ${sourceId} is archived or deleted and cannot be copied.`,
        409,
        'VOCABULARY_POOL_SOURCE_ARCHIVED'
      );
    }
    throw new VocabularyPoolFromPoolsError(
      `Source pool ${sourceId} was not found. Refresh the pool list and select an existing pool.`,
      404,
      'VOCABULARY_POOL_SOURCE_NOT_FOUND'
    );
  }
  if (tombstone.exists) {
    throw new VocabularyPoolFromPoolsError(
      `Source pool ${sourceId} has conflicting active and archived state.`,
      409,
      'VOCABULARY_POOL_SOURCE_STATE_CONFLICT'
    );
  }

  const data = active.data() ?? {};
  if (isVocabularyPoolCreationPending(data)) {
    throw new VocabularyPoolFromPoolsError(
      `Source pool ${sourceId} is still being created. Wait for it to finish and try again.`,
      409,
      'VOCABULARY_POOL_SOURCE_PENDING'
    );
  }
  if (isPendingDeletion(data._deletionPending)) {
    throw new VocabularyPoolFromPoolsError(
      `Source pool ${sourceId} is pending deletion and cannot be copied.`,
      409,
      'VOCABULARY_POOL_SOURCE_PENDING_DELETION'
    );
  }

  // This also rejects malformed persisted membership instead of silently
  // dropping references, while allowing a valid empty source pool.
  sourceWordIds(data, sourceId);
  return { id: sourceId, data };
}

function unionWordIds(sourceStates: readonly SourcePoolState[], individualWordIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const add = (value: string) => {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  };
  sourceStates.forEach(source => sourceWordIds(source.data, source.id).forEach(add));
  individualWordIds.forEach(add);
  return result;
}

async function getAllDocuments(
  db: Firestore,
  refs: readonly DocumentReference[],
  fieldMask?: readonly string[]
): Promise<DocumentSnapshot[]> {
  if (refs.length === 0) return [];
  const snapshots: DocumentSnapshot[] = [];
  const readOptions = fieldMask ? { fieldMask: [...fieldMask] } : undefined;
  for (const refsChunk of chunk(refs, VOCABULARY_POOL_COPY_READ_CHUNK_SIZE)) {
    snapshots.push(...(await db.getAll(...refsChunk, ...(readOptions ? [readOptions] : []))));
  }
  return snapshots;
}

async function transactionGetAll(
  transaction: Transaction,
  refs: readonly DocumentReference[],
  fieldMask?: readonly string[]
): Promise<DocumentSnapshot[]> {
  if (refs.length === 0) return [];
  const snapshots: DocumentSnapshot[] = [];
  const readOptions = fieldMask ? { fieldMask: [...fieldMask] } : undefined;
  for (const refsChunk of chunk(refs, VOCABULARY_POOL_COPY_READ_CHUNK_SIZE)) {
    snapshots.push(...(await transaction.getAll(...refsChunk, ...(readOptions ? [readOptions] : []))));
  }
  return snapshots;
}

async function readSources(db: Firestore, sourcePoolIds: readonly string[]): Promise<SourcePoolState[]> {
  const activeRefs = sourcePoolIds.map(id => db.collection(VOCABULARY_POOL_COLLECTION).doc(id));
  const tombstoneRefs = sourcePoolIds.map(id => db.collection(DELETED_VOCABULARY_POOL_COLLECTION).doc(id));
  // Reading all active and tombstone documents before validating any of them
  // keeps the lookup deterministic and makes conflicts fail closed.
  const [activeSnapshots, tombstoneSnapshots] = await Promise.all([
    getAllDocuments(db, activeRefs, ['wordDocIds', 'sourcePoolIds', '_creationPending', '_deletionPending']),
    getAllDocuments(db, tombstoneRefs, ['archiveId']),
  ]);
  return Promise.all(
    sourcePoolIds.map(async (id, index) => {
      const source = assertSourceState(id, activeSnapshots[index], tombstoneSnapshots[index]);
      return { ...source, data: await resolveVocabularyPool(db, id, source.data) };
    })
  );
}

function validateWordSnapshots(wordIds: readonly string[], snapshots: readonly DocumentSnapshot[]): void {
  const missingIds = wordIds.filter((_, index) => !snapshots[index]?.exists);
  if (missingIds.length > 0) {
    throw new VocabularyPoolFromPoolsError(
      `Cannot copy ${missingIds.length} missing vocabulary ${missingIds.length === 1 ? 'word' : 'words'} (${missingIds
        .slice(0, 5)
        .join(', ')}). Repair the source pool and try again.`,
      409,
      'VOCABULARY_POOL_WORD_REFERENCE_MISSING'
    );
  }
  const deletingIds = wordIds.filter((_, index) => isPendingDeletion(snapshots[index]?.data()?._deletionPending));
  if (deletingIds.length > 0) {
    throw new VocabularyPoolFromPoolsError(
      `Cannot copy ${deletingIds.length} vocabulary ${deletingIds.length === 1 ? 'word' : 'words'} pending deletion (${deletingIds
        .slice(0, 5)
        .join(', ')}).`,
      409,
      'VOCABULARY_POOL_WORD_PENDING_DELETION'
    );
  }
}

async function readAndValidateWords(db: Firestore, wordIds: readonly string[]): Promise<void> {
  const refs = wordIds.map(id => db.collection(VOCABULARY_WORDS_COLLECTION).doc(id));
  const snapshots = await getAllDocuments(db, refs, ['_deletionPending', '_poolReferenceRevision']);
  validateWordSnapshots(wordIds, snapshots);
}

function markerMatches(
  marker: Record<string, unknown>,
  input: CreateVocabularyPoolFromPoolsRequest,
  actorUid: string,
  requestFingerprint: string
): boolean {
  return (
    marker.actorUid === actorUid &&
    marker.requestId === input.requestId &&
    marker.requestFingerprint === requestFingerprint
  );
}

function sourceIdsMatch(marker: Record<string, unknown>, sourcePoolIds: readonly string[]): boolean {
  const markerSourcePoolIds = marker.sourcePoolIds;
  return (
    Array.isArray(markerSourcePoolIds) &&
    markerSourcePoolIds.length === sourcePoolIds.length &&
    markerSourcePoolIds.every((sourcePoolId, index) => sourcePoolId === sourcePoolIds[index])
  );
}

function assertPendingMarkerIdentity(
  marker: Record<string, unknown>,
  input: CreateVocabularyPoolFromPoolsRequest,
  actorUid: string,
  requestFingerprint: string,
  sourceFingerprint: string
): void {
  if (
    !markerMatches(marker, input, actorUid, requestFingerprint) ||
    marker.sourceMembershipFingerprint !== sourceFingerprint ||
    !sourceIdsMatch(marker, input.sourcePoolIds)
  ) {
    throw new VocabularyPoolFromPoolsError(
      'The saved vocabulary pool copy state is no longer usable. Review the selected pools and try Create Pool again.',
      409,
      'VOCABULARY_POOL_COPY_STATE_INVALID'
    );
  }
}

function markerProcessedWordIds(
  data: DocumentData,
  marker: Record<string, unknown>,
  expectedWordIds: readonly string[]
): string[] {
  const stagedIds = data.wordDocIds;
  const processedCount = typeof marker.processedWordCount === 'number' ? marker.processedWordCount : Number.NaN;
  if (
    !Array.isArray(stagedIds) ||
    !Number.isSafeInteger(processedCount) ||
    processedCount < 0 ||
    processedCount > expectedWordIds.length ||
    stagedIds.length !== processedCount ||
    stagedIds.some((id, index) => id !== expectedWordIds[index])
  ) {
    throw new VocabularyPoolFromPoolsError(
      'The saved vocabulary pool copy state is incomplete. Review the selected pools and try Create Pool again.',
      409,
      'VOCABULARY_POOL_COPY_STATE_INVALID'
    );
  }
  return stagedIds as string[];
}

function assertFullyStaged(
  data: DocumentData,
  marker: Record<string, unknown>,
  expectedWordIds: readonly string[]
): void {
  const stagedIds = markerProcessedWordIds(data, marker, expectedWordIds);
  if (stagedIds.length !== expectedWordIds.length) {
    throw new VocabularyPoolFromPoolsError(
      'The saved vocabulary pool copy is not finished. Review the selected pools and click Create Pool again.',
      409,
      'VOCABULARY_POOL_COPY_STATE_INVALID'
    );
  }
}

const toDateValue = (value: unknown): unknown =>
  value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate()
    : value;

function assertCompletedPoolData(data: DocumentData): void {
  const metadata = isRecord(data.metadata) ? data.metadata : null;
  const wordDocIds = data.wordDocIds;
  const searchTokens = data.searchTokens;
  if (
    typeof data.name !== 'string' ||
    typeof data.description !== 'string' ||
    !Array.isArray(wordDocIds) ||
    wordDocIds.some(wordDocId => !isFirestoreDocumentId(wordDocId)) ||
    !Array.isArray(searchTokens) ||
    searchTokens.some(token => typeof token !== 'string') ||
    !metadata ||
    !Number.isSafeInteger(metadata.wordCount) ||
    Number(metadata.wordCount) < 0 ||
    typeof metadata.isActive !== 'boolean' ||
    metadata.createdAt === undefined ||
    metadata.updatedAt === undefined
  ) {
    throw new VocabularyPoolFromPoolsError(
      'The completed vocabulary pool copy has invalid saved state. Review the selected pools and click Create Pool again.',
      409,
      'VOCABULARY_POOL_COPY_STATE_INVALID'
    );
  }
}

function serializeCompletedPool(poolId: string, data: DocumentData): DocumentData {
  assertCompletedPoolData(data);
  const metadata = data.metadata as Record<string, unknown>;
  return {
    id: poolId,
    name: data.name,
    description: data.description,
    wordDocIds: [...(data.wordDocIds as string[])],
    searchTokens: [...(data.searchTokens as string[])],
    metadata: {
      ...metadata,
      createdAt: toDateValue(metadata.createdAt),
      updatedAt: toDateValue(metadata.updatedAt),
    },
  };
}

function isSameCompletedRequest(
  value: unknown,
  actorUid: string,
  requestId: string,
  requestFingerprint: string
): boolean {
  const marker = markerRecord(value);
  return Boolean(
    marker &&
      marker.actorUid === actorUid &&
      marker.requestId === requestId &&
      marker.requestFingerprint === requestFingerprint &&
      typeof marker.sourceMembershipFingerprint === 'string' &&
      marker.sourceMembershipFingerprint.length > 0 &&
      marker.completedAt !== undefined &&
      marker.completedAt !== null
  );
}

function assertNoRequestCollision(
  existing: DocumentSnapshot,
  actorUid: string,
  requestId: string,
  requestFingerprint: string
): CreationPendingMarker | null {
  if (!existing.exists) return null;
  const data = existing.data() ?? {};
  const pending = markerRecord(data._creationPending);
  if (pending) {
    if (!markerMatches(pending, { requestId } as CreateVocabularyPoolFromPoolsRequest, actorUid, requestFingerprint)) {
      throw new VocabularyPoolFromPoolsError(
        'This copy request conflicts with another saved copy. Review the selected pools and click Create Pool again.',
        409,
        'VOCABULARY_POOL_COPY_REQUEST_CONFLICT'
      );
    }
    return pending as unknown as CreationPendingMarker;
  }

  const completed = markerRecord(data._copyRequest);
  if (
    completed &&
    (completed.actorUid !== actorUid ||
      completed.requestId !== requestId ||
      completed.requestFingerprint !== requestFingerprint)
  ) {
    throw new VocabularyPoolFromPoolsError(
      'This copy request conflicts with another saved copy. Review the selected pools and click Create Pool again.',
      409,
      'VOCABULARY_POOL_COPY_REQUEST_CONFLICT'
    );
  }
  throw new VocabularyPoolFromPoolsError(
    'A saved vocabulary pool copy is incomplete. Review the selected pools and click Create Pool again.',
    409,
    'VOCABULARY_POOL_COPY_REQUEST_CONFLICT'
  );
}

function ensureSourceFingerprint(expected: string, actual: string): void {
  if (expected === actual) return;
  throw new VocabularyPoolFromPoolsError(
    'A source pool changed while this copy was in progress. Review the selected pools and try Create Pool again.',
    409,
    'VOCABULARY_POOL_SOURCE_MEMBERSHIP_CHANGED'
  );
}

function buildPendingData(wordDocIds: readonly string[], marker: CreationPendingMarker): Record<string, unknown> {
  return {
    wordDocIds: [...wordDocIds],
    _creationPending: marker,
  };
}

function revisionValue(snapshot: DocumentSnapshot): number {
  const current = snapshot.data()?._poolReferenceRevision;
  return Number.isSafeInteger(current) && Number(current) >= 0 ? Number(current) + 1 : 1;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size) as T[]);
  return result;
}

function buildFinalPoolData(
  input: CreateVocabularyPoolFromPoolsRequest,
  actorUid: string,
  requestFingerprint: string,
  sourceFingerprint: string,
  wordDocIds: readonly string[],
  now: Date
): Record<string, unknown> {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    wordDocIds: [...wordDocIds],
    searchTokens: buildPoolSearchTokens(input.name.trim()),
    metadata: {
      createdAt: now,
      createdBy: actorUid,
      updatedAt: now,
      updatedBy: actorUid,
      wordCount: wordDocIds.length,
      isActive: true,
      tags: [...new Set((input.tags ?? []).map(tag => tag.toLowerCase().trim()).filter(Boolean))],
      difficulty: input.difficulty ?? 'beginner',
    },
    _copyRequest: {
      actorUid,
      requestId: input.requestId,
      requestFingerprint,
      sourceMembershipFingerprint: sourceFingerprint,
      completedAt: now,
    } satisfies CompletedCopyMarker,
  };
}

function assertDocumentSize(data: Record<string, unknown>, description: string): void {
  let bytes: number;
  try {
    bytes = estimateFirestoreDocumentBytes(data);
  } catch {
    throw new VocabularyPoolFromPoolsError(
      `The new vocabulary pool ${description} contains unsupported data and cannot be saved.`,
      409,
      'VOCABULARY_POOL_SIZE_PREFLIGHT_FAILED'
    );
  }
  if (bytes > VOCABULARY_POOL_COPY_MAX_DOCUMENT_BYTES) {
    throw new VocabularyPoolFromPoolsError(
      `The new vocabulary pool is too large to save safely (${Math.ceil(bytes / 1024)} KiB estimated). Remove some words and try again.`,
      409,
      'VOCABULARY_POOL_TOO_LARGE'
    );
  }
}

async function cleanupOwnedStage(
  db: Firestore,
  poolRef: DocumentReference,
  actorUid: string,
  requestId: string,
  requestFingerprint: string,
  lockOwnerId: string
): Promise<void> {
  await runVocabularyContentMutation(
    db,
    async transaction => {
      const snapshot = await transaction.get(poolRef);
      if (!snapshot.exists) return;
      const marker = markerRecord(snapshot.data()?._creationPending);
      if (
        marker &&
        marker.actorUid === actorUid &&
        marker.requestId === requestId &&
        marker.requestFingerprint === requestFingerprint
      ) {
        transaction.delete(poolRef);
      }
    },
    { lockOwnerId }
  );
}

/**
 * Creates a new active pool by copying whole source-pool memberships and
 * optional individual words. Source pools and vocabulary definitions remain
 * untouched; only the new membership relationship increments word revisions.
 */
export async function createVocabularyPoolFromPools(
  db: Firestore,
  actorUid: string,
  input: CreateVocabularyPoolFromPoolsRequest
): Promise<DocumentData> {
  if (input.keepLinked !== false) return createLinkedVocabularyPool(db, actorUid, input);
  const requestFingerprint = vocabularyPoolCopyRequestFingerprint(input);
  const poolId = operationDocumentId(actorUid, input.requestId);
  const poolRef = db.collection(VOCABULARY_POOL_COLLECTION).doc(poolId);
  let operationMayHaveStage = false;
  let published = false;

  return runVocabularyContentExclusiveMutation(db, async lockOwnerId => {
    try {
      const existing = await poolRef.get();
      const destinationTombstoneRef = db.collection(DELETED_VOCABULARY_POOL_COLLECTION).doc(poolId);
      const destinationTombstone = await destinationTombstoneRef.get();
      if (destinationTombstone.exists) {
        throw new VocabularyPoolFromPoolsError(
          'The saved copy destination is archived or deleted. Try Create Pool again.',
          409,
          'VOCABULARY_POOL_COPY_DESTINATION_ARCHIVED'
        );
      }
      const existingData = existing.data() ?? {};
      const hasCopyRequestState = Object.prototype.hasOwnProperty.call(existingData, '_copyRequest');
      const completedMarker = markerRecord(existingData._copyRequest);
      if (hasCopyRequestState && isVocabularyPoolCreationPending(existingData)) {
        throw new VocabularyPoolFromPoolsError(
          'The saved vocabulary pool copy state is conflicting. Review the selected pools and try Create Pool again.',
          409,
          'VOCABULARY_POOL_COPY_STATE_INVALID'
        );
      }
      if (existing.exists && hasCopyRequestState) {
        if (
          !completedMarker ||
          !isSameCompletedRequest(existingData._copyRequest, actorUid, input.requestId, requestFingerprint)
        ) {
          throw new VocabularyPoolFromPoolsError(
            'A saved vocabulary pool copy is incomplete or conflicts with this request. Review the selected pools and click Create Pool again.',
            409,
            'VOCABULARY_POOL_COPY_REQUEST_CONFLICT'
          );
        }
        published = true;
        return serializeCompletedPool(poolId, existingData);
      }

      const pendingMarker = existing.exists ? markerRecord(existingData._creationPending) : null;
      if (existing.exists && !pendingMarker) {
        // Includes malformed private state and a legacy document that happens
        // to occupy the deterministic operation ID.
        assertNoRequestCollision(existing, actorUid, input.requestId, requestFingerprint);
      }
      if (pendingMarker) {
        if (!markerMatches(pendingMarker, input, actorUid, requestFingerprint)) {
          throw new VocabularyPoolFromPoolsError(
            'This copy request conflicts with another saved copy. Review the selected pools and click Create Pool again.',
            409,
            'VOCABULARY_POOL_COPY_REQUEST_CONFLICT'
          );
        }
        operationMayHaveStage = true;
      }

      // These reads happen under the exclusive lock for the initial plan. A
      // transaction rechecks source state before each write batch and again at
      // publication, so a stale preflight can never publish a changed source.
      const sourceStates = await readSources(db, input.sourcePoolIds);
      const sourceFingerprint = sourceMembershipFingerprint(input.sourcePoolIds, sourceStates);
      if (pendingMarker) {
        if (pendingMarker.sourceMembershipFingerprint !== sourceFingerprint) {
          throw new VocabularyPoolFromPoolsError(
            'A source pool changed while this copy was in progress. Review the selected pools and try Create Pool again.',
            409,
            'VOCABULARY_POOL_SOURCE_MEMBERSHIP_CHANGED'
          );
        }
        if (!sourceIdsMatch(pendingMarker, input.sourcePoolIds)) {
          throw new VocabularyPoolFromPoolsError(
            'The selected source pools no longer match the saved copy. Review them and try Create Pool again.',
            409,
            'VOCABULARY_POOL_COPY_STATE_INVALID'
          );
        }
      }

      const finalWordIds = unionWordIds(sourceStates, input.wordDocIds ?? []);
      await readAndValidateWords(db, finalWordIds);

      const now = new Date();
      const finalData = buildFinalPoolData(input, actorUid, requestFingerprint, sourceFingerprint, finalWordIds, now);
      assertDocumentSize(finalData, 'final document');
      const initialMarker: CreationPendingMarker = {
        actorUid,
        requestId: input.requestId,
        requestFingerprint,
        sourceMembershipFingerprint: sourceFingerprint,
        sourcePoolIds: [...input.sourcePoolIds],
        processedWordCount:
          typeof pendingMarker?.processedWordCount === 'number' ? pendingMarker.processedWordCount : 0,
        createdAt: pendingMarker?.createdAt instanceof Date ? pendingMarker.createdAt : now,
        updatedAt: now,
      };
      assertDocumentSize(buildPendingData(finalWordIds, initialMarker), 'staging document');

      let processedWordCount = pendingMarker
        ? markerProcessedWordIds(existingData, pendingMarker, finalWordIds).length
        : 0;

      // A zero-word source set still creates a staged document before publish,
      // so every publication has a recoverable operation marker.
      const batches = chunk(finalWordIds.slice(processedWordCount), VOCABULARY_POOL_COPY_WORD_BATCH_SIZE);
      if (batches.length === 0 && !pendingMarker) batches.push([]);

      for (const wordBatch of batches) {
        operationMayHaveStage = true;
        const nextWordIds = finalWordIds.slice(0, processedWordCount + wordBatch.length);
        const batchMarker: CreationPendingMarker = {
          ...initialMarker,
          processedWordCount: nextWordIds.length,
          updatedAt: new Date(),
        };
        assertDocumentSize(buildPendingData(nextWordIds, batchMarker), 'staging document');

        await runVocabularyContentMutation(
          db,
          async transaction => {
            const activeRefs = input.sourcePoolIds.map(id => db.collection(VOCABULARY_POOL_COLLECTION).doc(id));
            const tombstoneRefs = input.sourcePoolIds.map(id =>
              db.collection(DELETED_VOCABULARY_POOL_COLLECTION).doc(id)
            );
            const stagedSnapshot = await transaction.get(poolRef);
            const destinationTombstoneSnapshot = await transaction.get(destinationTombstoneRef);
            if (destinationTombstoneSnapshot.exists) {
              throw new VocabularyPoolFromPoolsError(
                'The saved copy destination is archived or deleted. Try Create Pool again.',
                409,
                'VOCABULARY_POOL_COPY_DESTINATION_ARCHIVED'
              );
            }
            const activeSnapshots = await transactionGetAll(transaction, activeRefs);
            const tombstoneSnapshots = await transactionGetAll(transaction, tombstoneRefs);
            const currentSources = await Promise.all(
              input.sourcePoolIds.map(async (id, index) => {
                const source = assertSourceState(id, activeSnapshots[index], tombstoneSnapshots[index]);
                return { ...source, data: await resolveVocabularyPool(db, id, source.data, transaction) };
              })
            );
            ensureSourceFingerprint(
              sourceFingerprint,
              sourceMembershipFingerprint(input.sourcePoolIds, currentSources)
            );

            let stagedMarker: Record<string, unknown> | null = null;
            if (stagedSnapshot.exists) {
              stagedMarker = markerRecord(stagedSnapshot.data()?._creationPending);
              if (!stagedMarker) {
                throw new VocabularyPoolFromPoolsError(
                  'This vocabulary pool copy is owned by a different request.',
                  409,
                  'VOCABULARY_POOL_COPY_REQUEST_CONFLICT'
                );
              }
              assertPendingMarkerIdentity(stagedMarker, input, actorUid, requestFingerprint, sourceFingerprint);
              const priorIds = markerProcessedWordIds(stagedSnapshot.data() ?? {}, stagedMarker, finalWordIds);
              if (priorIds.length !== processedWordCount) {
                throw new VocabularyPoolFromPoolsError(
                  'The saved vocabulary pool copy is stale. Review the selected pools and click Create Pool again.',
                  409,
                  'VOCABULARY_POOL_COPY_STATE_INVALID'
                );
              }
            } else if (processedWordCount !== 0) {
              throw new VocabularyPoolFromPoolsError(
                'The saved vocabulary pool copy is incomplete. Review the selected pools and click Create Pool again.',
                409,
                'VOCABULARY_POOL_COPY_STATE_INVALID'
              );
            }

            const wordRefs = wordBatch.map(id => db.collection(VOCABULARY_WORDS_COLLECTION).doc(id));
            const wordSnapshots = await transactionGetAll(transaction, wordRefs);
            validateWordSnapshots(wordBatch, wordSnapshots);

            // All transaction reads are complete before any revision or pool
            // membership write is scheduled.
            wordSnapshots.forEach((snapshot, index) => {
              transaction.update(wordRefs[index], { _poolReferenceRevision: revisionValue(snapshot) });
            });
            if (stagedSnapshot.exists) {
              transaction.update(
                poolRef,
                buildPendingData(
                  nextWordIds,
                  batchMarker
                ) as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>
              );
            } else {
              transaction.create(poolRef, buildPendingData(nextWordIds, batchMarker));
            }
          },
          { lockOwnerId }
        );
        processedWordCount = nextWordIds.length;
      }

      // Final transaction rechecks every source and every final word reference
      // before publishing the user-visible fields. Reads are chunked while the
      // write set remains a single pool update.
      await runVocabularyContentMutation(
        db,
        async transaction => {
          const activeRefs = input.sourcePoolIds.map(id => db.collection(VOCABULARY_POOL_COLLECTION).doc(id));
          const tombstoneRefs = input.sourcePoolIds.map(id =>
            db.collection(DELETED_VOCABULARY_POOL_COLLECTION).doc(id)
          );
          const stagedSnapshot = await transaction.get(poolRef);
          const destinationTombstoneSnapshot = await transaction.get(destinationTombstoneRef);
          if (destinationTombstoneSnapshot.exists) {
            throw new VocabularyPoolFromPoolsError(
              'The saved copy destination is archived or deleted. Try Create Pool again.',
              409,
              'VOCABULARY_POOL_COPY_DESTINATION_ARCHIVED'
            );
          }
          const activeSnapshots = await transactionGetAll(transaction, activeRefs);
          const tombstoneSnapshots = await transactionGetAll(transaction, tombstoneRefs);
          const currentSources = await Promise.all(
            input.sourcePoolIds.map(async (id, index) => {
              const source = assertSourceState(id, activeSnapshots[index], tombstoneSnapshots[index]);
              return { ...source, data: await resolveVocabularyPool(db, id, source.data, transaction) };
            })
          );
          ensureSourceFingerprint(sourceFingerprint, sourceMembershipFingerprint(input.sourcePoolIds, currentSources));

          if (!stagedSnapshot.exists) {
            throw new VocabularyPoolFromPoolsError(
              'The saved vocabulary pool copy is incomplete. Review the selected pools and click Create Pool again.',
              409,
              'VOCABULARY_POOL_COPY_STATE_INVALID'
            );
          }
          const stagedData = stagedSnapshot.data() ?? {};
          const stagedMarker = markerRecord(stagedData._creationPending);
          if (!stagedMarker) {
            throw new VocabularyPoolFromPoolsError(
              'This vocabulary pool copy is owned by a different request.',
              409,
              'VOCABULARY_POOL_COPY_REQUEST_CONFLICT'
            );
          }
          assertPendingMarkerIdentity(stagedMarker, input, actorUid, requestFingerprint, sourceFingerprint);
          assertFullyStaged(stagedData, stagedMarker, finalWordIds);

          const allWordSnapshots: DocumentSnapshot[] = [];
          for (const wordChunk of chunk(finalWordIds, VOCABULARY_POOL_COPY_WORD_BATCH_SIZE)) {
            const refs = wordChunk.map(id => db.collection(VOCABULARY_WORDS_COLLECTION).doc(id));
            const snapshots = await transactionGetAll(transaction, refs);
            validateWordSnapshots(wordChunk, snapshots);
            allWordSnapshots.push(...snapshots);
          }
          // Keep this explicit: the final transaction has read every final
          // reference before its sole pool publication write.
          if (allWordSnapshots.length !== finalWordIds.length) {
            throw new VocabularyPoolFromPoolsError(
              'Vocabulary references changed while publishing. Review the selected pools and try Create Pool again.',
              409,
              'VOCABULARY_POOL_COPY_STATE_INVALID'
            );
          }
          // Replace the staged document so the internal marker is removed
          // atomically with publication. An update would preserve omitted
          // fields and leave the pool hidden forever.
          transaction.set(poolRef, finalData);
        },
        { lockOwnerId }
      );
      published = true;
      return { id: poolId, ...serializeCompletedPool(poolId, finalData) };
    } catch (error) {
      if (operationMayHaveStage && !published) {
        // Cleanup is deliberately scoped by the deterministic operation
        // marker; a malformed, completed, or another actor's document can
        // never be deleted by this retry path. If cleanup itself fails, leave
        // the hidden stage for a later retry and preserve the original error.
        try {
          await cleanupOwnedStage(db, poolRef, actorUid, input.requestId, requestFingerprint, lockOwnerId);
        } catch (cleanupError) {
          console.error('Failed to clean up vocabulary pool copy staging document:', cleanupError);
        }
      }
      throw error;
    }
  });
}
