import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: () => '__name__' } }));

import {
  cleanupVocabularyWordPoolReferences,
  WORD_DELETION_POOL_CLEANUP_BATCH_SIZE,
} from '@/src/lib/vocabulary/word-deletion-cleanup.server';

type FakeRef = { kind: 'doc'; collection: string; id: string };
type FakeQuery = { kind: 'query'; collection: string; wordId: string; limitValue: number };
type FakeTransaction = {
  get: (target: FakeRef | FakeQuery) => Promise<unknown>;
  update: (ref: FakeRef, data: Record<string, unknown>) => void;
};

describe('high-cardinality vocabulary word mutations', () => {
  it('removes a word from more than one Firestore write limit in bounded transactions', async () => {
    const wordId = 'word-common';
    const pools = new Map(
      Array.from({ length: 600 }, (_, index) => [
        `pool-${index}`,
        { name: `Pool ${index}`, wordDocIds: [wordId, `other-${index}`] },
      ])
    );
    const writesPerTransaction: number[] = [];
    const db = {
      collection: (collection: string) => ({
        doc: (id: string): FakeRef => ({ kind: 'doc', collection, id }),
        where: (_field: string, _operator: string, selectedWordId: string) => ({
          limit: (limitValue: number): FakeQuery => ({
            kind: 'query',
            collection,
            wordId: selectedWordId,
            limitValue,
          }),
        }),
      }),
      runTransaction: async (callback: (transaction: FakeTransaction) => Promise<unknown>) => {
        let writes = 0;
        const transaction = {
          get: async (target: FakeRef | FakeQuery) => {
            if (target.kind === 'query') {
              const docs = [...pools.entries()]
                .filter(([, pool]) => pool.wordDocIds.includes(target.wordId))
                .slice(0, target.limitValue)
                .map(([id, pool]) => ({
                  id,
                  ref: { kind: 'doc', collection: 'vocabulary_pools', id },
                  data: () => pool,
                }));
              return { docs, empty: docs.length === 0 };
            }
            if (target.collection === 'content_sync_locks') return { exists: false, data: () => undefined };
            if (target.collection === 'vocabulary_words_v5') {
              return {
                exists: true,
                data: () => ({ _deletionPending: { actorUid: 'admin-1', tokenHash: 'token-hash' } }),
              };
            }
            throw new Error(`Unexpected read ${target.collection}/${target.id}`);
          },
          update: (ref: FakeRef, data: Record<string, unknown>) => {
            writes += 1;
            pools.set(ref.id, { ...pools.get(ref.id)!, wordDocIds: data.wordDocIds as string[] });
          },
        };
        const result = await callback(transaction);
        writesPerTransaction.push(writes);
        return result;
      },
    };

    const result = await cleanupVocabularyWordPoolReferences(db as never, {
      wordId,
      actorUid: 'admin-1',
      tokenHash: 'token-hash',
    });

    expect(result.cleanedPoolCount).toBe(600);
    expect([...pools.values()].every(pool => !pool.wordDocIds.includes(wordId))).toBe(true);
    expect(Math.max(...writesPerTransaction)).toBeLessThanOrEqual(WORD_DELETION_POOL_CLEANUP_BATCH_SIZE);
  });

  it('keeps ordinary word edits constant-size regardless of pool cardinality', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/api/admin/words/route.ts'), 'utf8');
    const putHandler = source.slice(
      source.indexOf('export async function PUT'),
      source.indexOf('function getCellValue')
    );
    expect(putHandler).not.toContain("where('wordDocIds', 'array-contains'");
    expect(putHandler).not.toContain('_wordContentRevision');
    expect(putHandler).toContain('prepareVocabularyContentRevisionBump');
  });

  it('keeps the initial confirmation transaction bounded and paginates the warning scan', () => {
    const routeSource = readFileSync(resolve(process.cwd(), 'src/app/api/admin/words/[wordId]/route.ts'), 'utf8');
    const cleanupSource = readFileSync(
      resolve(process.cwd(), 'src/lib/vocabulary/word-deletion-cleanup.server.ts'),
      'utf8'
    );
    expect(routeSource).not.toContain('transaction.get(poolsQuery),');
    expect(cleanupSource).toContain('.limit(WORD_DELETION_POOL_SCAN_PAGE_SIZE)');
    expect(cleanupSource).toContain('query.startAfter(lastDocument)');
    expect(routeSource).toContain('.slice(0, WORD_DELETION_POOL_WARNING_SAMPLE_SIZE)');
  });
});
