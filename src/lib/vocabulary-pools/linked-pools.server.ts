import { createHash } from 'node:crypto';
import type { DocumentData, DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  DELETED_VOCABULARY_POOL_COLLECTION,
  VOCABULARY_POOL_COLLECTION,
  VOCABULARY_WORDS_COLLECTION,
} from '@/shared/constants/firestore';
import type { CreateVocabularyPoolFromPoolsRequest } from '@/shared/types/vocabulary/pool-requests';
import { estimateFirestoreDocumentBytes } from '@/src/lib/tests/firestore-size';
import {
  VocabularyPoolStateError,
  isVocabularyPoolCreationPending,
} from '@/src/lib/vocabulary-pools/pool-state.server';
import {
  runVocabularyContentExclusiveMutation,
  runVocabularyContentMutation,
} from '@/src/lib/vocabulary-pools/sync-lock.server';
import { buildPoolSearchTokens } from '@/src/utils/vocabularyPoolSummary';

export const MAX_LINKED_POOL_SOURCES = 100;
export const MAX_LINKED_POOL_GRAPH_SIZE = 500;
const MAX_POOL_BYTES = 900 * 1024;
const documentId = z
  .string()
  .min(1)
  .refine(id => Boolean(id.trim()) && !['.', '..'].includes(id) && !id.includes('/'));
export const sourcePoolIdsSchema = z
  .array(documentId)
  .max(MAX_LINKED_POOL_SOURCES)
  .transform(ids => [...new Set(ids)]);
const wordIdsSchema = z.array(documentId).transform(ids => [...new Set(ids)]);
const conflict = (message: string, code = 'VOCABULARY_POOL_LINK_INVALID') =>
  new VocabularyPoolStateError(message, code);

export function poolSourceIds(data: DocumentData): string[] {
  const parsed = sourcePoolIdsSchema.safeParse(data.sourcePoolIds === undefined ? [] : data.sourcePoolIds);
  if (!parsed.success) throw conflict('Pool contains invalid source pool references.');
  return parsed.data;
}

export function assertPoolDocumentSize(data: DocumentData) {
  if (estimateFirestoreDocumentBytes(data) > MAX_POOL_BYTES)
    throw conflict('This pool is too large to save safely.', 'VOCABULARY_POOL_TOO_LARGE');
}

/** Stored wordDocIds are direct membership. Effective membership is resolved at read time. */
export function createVocabularyPoolResolver(db: Firestore, transaction?: Transaction) {
  const documents = new Map<string, DocumentData>();
  const requested = new Set<string>();
  const resolved = new Map<string, DocumentData>();
  const read = async (id: string) => {
    const ref = db.collection(VOCABULARY_POOL_COLLECTION).doc(id);
    const tombstoneRef = db.collection(DELETED_VOCABULARY_POOL_COLLECTION).doc(id);
    const snapshots = transaction ? await transaction.getAll(ref, tombstoneRef) : await db.getAll(ref, tombstoneRef);
    if (!snapshots[0].exists || snapshots[1].exists)
      throw conflict(`Source pool ${id} is missing or archived.`, 'VOCABULARY_POOL_SOURCE_UNAVAILABLE');
    const data = snapshots[0].data() ?? {};
    if (data._deletionPending || isVocabularyPoolCreationPending(data))
      throw conflict(`Source pool ${id} is unavailable.`, 'VOCABULARY_POOL_SOURCE_UNAVAILABLE');
    return data;
  };
  const resolve = async (
    id: string,
    supplied?: DocumentData,
    ancestors: Set<string> = new Set()
  ): Promise<DocumentData> => {
    if (ancestors.has(id))
      throw conflict(
        'Pools cannot include themselves, directly or through another pool.',
        'VOCABULARY_POOL_LINK_CYCLE'
      );
    if (!supplied && resolved.has(id)) return resolved.get(id)!;
    if (!requested.has(id) && requested.size >= MAX_LINKED_POOL_GRAPH_SIZE)
      throw conflict('Too many connected pools to resolve safely.', 'VOCABULARY_POOL_GRAPH_TOO_LARGE');
    requested.add(id);
    const data = supplied ?? documents.get(id) ?? (await read(id));
    documents.set(id, data);
    const sourcePoolIds = poolSourceIds(data);
    // Preserve legacy readers for ordinary pools. Linked membership is strict.
    if (sourcePoolIds.length === 0) {
      const result = { ...data };
      resolved.set(id, result);
      return result;
    }
    const direct = wordIdsSchema.safeParse(data.wordDocIds);
    if (!direct.success) throw conflict('Pool contains invalid direct word references.');
    const path = new Set(ancestors).add(id);
    const inherited = new Set<string>();
    const sources: Array<{ id: string; name: string }> = [];
    for (const sourceId of sourcePoolIds) {
      const source = await resolve(sourceId, undefined, path);
      const words = wordIdsSchema.safeParse(source.wordDocIds);
      if (!words.success) throw conflict(`Source pool ${sourceId} contains invalid word references.`);
      words.data.forEach(wordId => inherited.add(wordId));
      sources.push({ id: sourceId, name: typeof source.name === 'string' ? source.name : sourceId });
    }
    const wordDocIds = [...new Set([...inherited, ...direct.data])];
    const result = {
      ...data,
      sourcePoolIds,
      sources,
      directWordDocIds: direct.data,
      inheritedWordDocIds: [...inherited],
      wordDocIds,
      metadata: { ...data.metadata, wordCount: wordDocIds.length },
    };
    assertPoolDocumentSize(result);
    resolved.set(id, result);
    return result;
  };
  return { resolve, documents };
}

export async function resolveVocabularyPool(db: Firestore, id: string, data: DocumentData, transaction?: Transaction) {
  if (poolSourceIds(data).length === 0) return data;
  return createVocabularyPoolResolver(db, transaction).resolve(id, data);
}

/** Read/validate links before any writes; source revisions invalidate outstanding deletion confirmations. */
export async function preparePoolSourceLinks(
  db: Firestore,
  transaction: Transaction,
  poolId: string,
  data: DocumentData,
  nextSourceIds: string[]
) {
  const next = sourcePoolIdsSchema.safeParse(nextSourceIds);
  if (!next.success) throw conflict('Select at most 100 valid source pools.');
  const resolver = createVocabularyPoolResolver(db, transaction);
  const effective = await resolver.resolve(poolId, { ...data, sourcePoolIds: next.data });
  const previous = new Set(poolSourceIds(data));
  const additions = next.data.filter(id => !previous.has(id));
  return {
    effective,
    writeCount: additions.length,
    apply: () =>
      additions.forEach(id => {
        const revision = resolver.documents.get(id)?._assignmentRevision;
        transaction.update(db.collection(VOCABULARY_POOL_COLLECTION).doc(id), {
          _assignmentRevision: Number.isSafeInteger(revision) ? Number(revision) + 1 : 1,
        });
      }),
  };
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Direct-word revision batches are harmless on retry; only the final transaction publishes the new pool. */
export async function createLinkedVocabularyPool(
  db: Firestore,
  actorUid: string,
  input: CreateVocabularyPoolFromPoolsRequest
) {
  const sourcePoolIds = sourcePoolIdsSchema.parse(input.sourcePoolIds);
  const wordDocIds = wordIdsSchema.parse(input.wordDocIds ?? []);
  const requestFingerprint = hash({ ...input, sourcePoolIds, wordDocIds });
  const id = `linked-${hash([actorUid, input.requestId])}`;
  const ref = db.collection(VOCABULARY_POOL_COLLECTION).doc(id);
  return runVocabularyContentExclusiveMutation(db, async lockOwnerId => {
    const now = new Date();
    const data = {
      name: input.name,
      description: input.description,
      sourcePoolIds,
      wordDocIds,
      searchTokens: buildPoolSearchTokens(input.name),
      metadata: {
        createdAt: now,
        createdBy: actorUid,
        updatedAt: now,
        updatedBy: actorUid,
        wordCount: wordDocIds.length,
        isActive: true,
        tags: input.tags ?? [],
        difficulty: input.difficulty ?? 'beginner',
      },
      _copyRequest: { actorUid, requestId: input.requestId, requestFingerprint },
    };
    assertPoolDocumentSize(data);
    const readDestination = async (transaction: Transaction) => {
      const [existing, tombstone] = await transaction.getAll(
        ref,
        db.collection(DELETED_VOCABULARY_POOL_COLLECTION).doc(id)
      );
      if (tombstone.exists)
        throw conflict(
          'This pool has been archived. Start a new creation request.',
          'VOCABULARY_POOL_COPY_DESTINATION_ARCHIVED'
        );
      if (
        existing.exists &&
        (existing.data()?._copyRequest?.requestFingerprint !== requestFingerprint ||
          existing.data()?._deletionPending ||
          isVocabularyPoolCreationPending(existing.data()))
      )
        throw conflict('This request conflicts with a saved pool.', 'VOCABULARY_POOL_COPY_REQUEST_CONFLICT');
      return existing;
    };
    const existing = await runVocabularyContentMutation(db, readDestination, { lockOwnerId });
    if (existing.exists) return { id, ...(await resolveVocabularyPool(db, id, existing.data()!)) };
    // Check sources before advancing any revisions, including all nested links.
    await runVocabularyContentMutation(
      db,
      async transaction => {
        await preparePoolSourceLinks(db, transaction, id, { ...data, sourcePoolIds: [] }, sourcePoolIds);
      },
      { lockOwnerId }
    );
    const validateWords = (snapshots: DocumentSnapshot[]) => {
      if (snapshots.some(snapshot => !snapshot.exists || snapshot.data()?._deletionPending))
        throw conflict('Cannot include missing words or words pending deletion.', 'VOCABULARY_POOL_WORDS_MISSING');
    };
    for (let offset = 0; offset < wordDocIds.length; offset += 200) {
      await runVocabularyContentMutation(
        db,
        async transaction => {
          const refs = wordDocIds
            .slice(offset, offset + 200)
            .map(wordId => db.collection(VOCABULARY_WORDS_COLLECTION).doc(wordId));
          const snapshots = await transaction.getAll(...refs);
          validateWords(snapshots);
          snapshots.forEach((snapshot, index) => {
            const revision = snapshot.data()?._poolReferenceRevision;
            transaction.update(refs[index], {
              _poolReferenceRevision: Number.isSafeInteger(revision) ? Number(revision) + 1 : 1,
            });
          });
        },
        { lockOwnerId }
      );
    }
    return runVocabularyContentMutation(
      db,
      async transaction => {
        await readDestination(transaction);
        const links = await preparePoolSourceLinks(db, transaction, id, { ...data, sourcePoolIds: [] }, sourcePoolIds);
        // All effective references must still exist at publication, including inherited words.
        const effectiveIds: string[] = links.effective.wordDocIds;
        for (let offset = 0; offset < effectiveIds.length; offset += 200) {
          validateWords(
            await transaction.getAll(
              ...effectiveIds
                .slice(offset, offset + 200)
                .map(wordId => db.collection(VOCABULARY_WORDS_COLLECTION).doc(wordId))
            )
          );
        }
        links.apply();
        transaction.create(ref, data);
        return { id, ...links.effective };
      },
      { lockOwnerId }
    );
  });
}

type MembershipInput = {
  wordDocIds?: unknown;
  directWordDocIds?: unknown;
  sourcePoolIds?: unknown;
  addWordDocIds?: string[];
};

/** Small changes are atomic; larger direct-word revision sets are batched under the sync lock. */
export async function updateLinkedPoolMembership(
  db: Firestore,
  poolId: string,
  updateData: DocumentData,
  input: MembershipInput
) {
  const ref = db.collection(VOCABULARY_POOL_COLLECTION).doc(poolId);
  const plan = async (transaction: Transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw conflict('Pool not found.', 'VOCABULARY_POOL_NOT_FOUND');
    const data = snapshot.data()!;
    if (data._deletionPending || isVocabularyPoolCreationPending(data))
      throw conflict('Pool is unavailable.', 'VOCABULARY_POOL_PENDING');
    const sources =
      input.sourcePoolIds === undefined ? poolSourceIds(data) : sourcePoolIdsSchema.parse(input.sourcePoolIds);
    const current = await resolveVocabularyPool(db, poolId, data, transaction);
    let nextWords = input.directWordDocIds ?? input.wordDocIds ?? data.wordDocIds;
    if (input.directWordDocIds === undefined && input.wordDocIds !== undefined && poolSourceIds(data).length) {
      const submitted = wordIdsSchema.parse(input.wordDocIds);
      const inherited: string[] = current.inheritedWordDocIds ?? [];
      if (inherited.some(id => !submitted.includes(id)))
        throw conflict(
          'Inherited words must be changed in their source pool, or unlink the whole source pool.',
          'VOCABULARY_POOL_INHERITED_WORD'
        );
      const priorDirect = new Set<string>(data.wordDocIds);
      nextWords = submitted.filter(id => !inherited.includes(id) || priorDirect.has(id));
    }
    const invalidIds: string[] = [];
    let duplicateCount = 0;
    if (input.addWordDocIds) {
      const requested = wordIdsSchema.parse(input.addWordDocIds);
      const effective = new Set<string>(current.wordDocIds);
      const candidates = requested.filter(id => !effective.has(id));
      duplicateCount = requested.length - candidates.length;
      const valid: string[] = [];
      for (let offset = 0; offset < candidates.length; offset += 200) {
        const ids = candidates.slice(offset, offset + 200);
        const snapshots = await transaction.getAll(
          ...ids.map(id => db.collection(VOCABULARY_WORDS_COLLECTION).doc(id))
        );
        snapshots.forEach((word, index) => {
          if (word.data()?._deletionPending)
            throw conflict('Cannot include words pending deletion.', 'VOCABULARY_POOL_WORDS_MISSING');
          (word.exists ? valid : invalidIds).push(ids[index]);
        });
      }
      nextWords = [...data.wordDocIds, ...valid];
    }
    const wordDocIds = wordIdsSchema.parse(nextWords);
    const links = await preparePoolSourceLinks(db, transaction, poolId, { ...data, wordDocIds }, sources);
    const nextData = { ...updateData, wordDocIds, sourcePoolIds: sources, 'metadata.wordCount': wordDocIds.length };
    assertPoolDocumentSize({ ...data, ...nextData });
    const previousWords = new Set<string>(data.wordDocIds);
    const additions = wordDocIds.filter(id => !previousWords.has(id));
    return { wordDocIds, links, nextData, additions, invalidIds, duplicateCount };
  };
  const validate = async (transaction: Transaction, ids: string[]) => {
    const snapshots: DocumentSnapshot[] = [];
    for (let offset = 0; offset < ids.length; offset += 200) {
      const words = await transaction.getAll(
        ...ids.slice(offset, offset + 200).map(id => db.collection(VOCABULARY_WORDS_COLLECTION).doc(id))
      );
      if (words.some(word => !word.exists || word.data()?._deletionPending))
        throw conflict('Cannot include missing words or words pending deletion.', 'VOCABULARY_POOL_WORDS_MISSING');
      snapshots.push(...words);
    }
    return snapshots;
  };
  const revise = (transaction: Transaction, words: DocumentSnapshot[]) =>
    words.forEach(word => {
      const revision = word.data()?._poolReferenceRevision;
      transaction.update(word.ref, {
        _poolReferenceRevision: Number.isSafeInteger(revision) ? Number(revision) + 1 : 1,
      });
    });
  const single = await runVocabularyContentMutation(db, async transaction => {
    const next = await plan(transaction);
    if (next.additions.length + next.links.writeCount + 1 > 200) return null;
    const words = await validate(transaction, next.links.effective.wordDocIds);
    const additions = new Set(next.additions);
    revise(
      transaction,
      words.filter(word => additions.has(word.id))
    );
    next.links.apply();
    transaction.update(ref, next.nextData);
    return { addedCount: next.additions.length, invalidIds: next.invalidIds, duplicateCount: next.duplicateCount };
  });
  if (single) return single;
  return runVocabularyContentExclusiveMutation(db, async lockOwnerId => {
    const initial = await runVocabularyContentMutation(db, plan, { lockOwnerId });
    for (let offset = 0; offset < initial.additions.length; offset += 200) {
      await runVocabularyContentMutation(
        db,
        async transaction => {
          revise(transaction, await validate(transaction, initial.additions.slice(offset, offset + 200)));
        },
        { lockOwnerId }
      );
    }
    return runVocabularyContentMutation(
      db,
      async transaction => {
        const final = await plan(transaction);
        await validate(transaction, final.links.effective.wordDocIds);
        final.links.apply();
        transaction.update(ref, final.nextData);
        return {
          addedCount: final.additions.length,
          invalidIds: final.invalidIds,
          duplicateCount: final.duplicateCount,
        };
      },
      { lockOwnerId }
    );
  });
}

export async function assertPoolHasNoDependents(db: Firestore, transaction: Transaction, poolId: string) {
  const dependents = await transaction.get(
    db.collection(VOCABULARY_POOL_COLLECTION).where('sourcePoolIds', 'array-contains', poolId).limit(1)
  );
  if (!dependents.empty)
    throw conflict('Unlink this pool from its combined pools before deleting it.', 'VOCABULARY_POOL_IN_USE');
}
