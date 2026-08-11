import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertVocabularyContentMutationUnlocked,
  runVocabularyContentMutation,
  runVocabularyContentStorageMutation,
} from '@/src/lib/vocabulary-pools/sync-lock.server';

const guardedTransactionWriters = [
  'src/app/api/admin/lessons/route.ts',
  'src/app/api/admin/words/route.ts',
  'src/app/api/admin/vocabulary-pools/route.ts',
  'src/app/api/admin/vocabulary-pools/[poolId]/route.ts',
  'src/app/api/admin/vocabulary-pools/[poolId]/words/route.ts',
  'src/app/api/admin/vocabulary-word-requests/[id]/approve/route.ts',
  'src/lib/learning-units/learning-path-service.ts',
  'src/lib/practice-categories/service.ts',
  'src/lib/tests/authoring-service.ts',
  'src/lib/tests/mock-service.ts',
];

describe('vocabulary content maintenance mutation guard', () => {
  it('rejects a mirrored admin transaction before its callback can write', async () => {
    const callback = jest.fn();
    const transaction = {
      get: jest.fn(async () => ({ exists: true, data: () => ({ ownerId: 'sync-owner' }) })),
    };
    const db = {
      collection: (collection: string) => ({ doc: (id: string) => ({ collection, id }) }),
      runTransaction: (runner: (value: typeof transaction) => unknown) => runner(transaction),
    };

    await expect(runVocabularyContentMutation(db as never, callback)).rejects.toMatchObject({
      status: 409,
      code: 'VOCABULARY_CONTENT_SYNC_IN_PROGRESS',
    });
    expect(callback).not.toHaveBeenCalled();
  });

  it('rejects Storage mutations while the same maintenance lock is active', async () => {
    const db = {
      collection: () => ({
        doc: () => ({ get: async () => ({ exists: true, data: () => ({ ownerId: 'sync-owner' }) }) }),
      }),
    };

    await expect(assertVocabularyContentMutationUnlocked(db as never)).rejects.toMatchObject({
      status: 409,
      code: 'VOCABULARY_CONTENT_SYNC_IN_PROGRESS',
    });
  });

  it('owns the singleton lock for the full Storage callback and releases only its own lock', async () => {
    let lockData: Record<string, unknown> | undefined;
    const db = {
      collection: (collection: string) => ({ doc: (id: string) => ({ collection, id }) }),
      runTransaction: async (runner: (transaction: unknown) => Promise<unknown>) => {
        const transaction = {
          get: async () => ({ exists: Boolean(lockData), data: () => lockData }),
          create: (_ref: unknown, data: Record<string, unknown>) => {
            lockData = data;
          },
          delete: () => {
            lockData = undefined;
          },
        };
        return runner(transaction);
      },
    };
    const storageWrite = jest.fn(async () => {
      expect(lockData).toMatchObject({ kind: 'app-storage-mutation', manifestDurable: false });
      return 'stored';
    });

    await expect(runVocabularyContentStorageMutation(db as never, storageWrite)).resolves.toBe('stored');
    expect(storageWrite).toHaveBeenCalledTimes(1);
    expect(lockData).toBeUndefined();
  });

  it.each(guardedTransactionWriters)('keeps %s inside the shared transaction gate', file => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    expect(source).toContain('runVocabularyContentMutation');
  });
});
