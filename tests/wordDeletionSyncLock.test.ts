const transactionDelete = jest.fn();
const transactionSet = jest.fn();
const transactionUpdate = jest.fn();

jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: () => '__name__' } }));

type Ref = { kind: string; id?: string; get?: () => Promise<unknown> };

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: jest.requireActual('@/src/lib/verifyAdminAccess').AdminAccessError,
  verifyAdminAccess: jest.fn().mockResolvedValue({ uid: 'admin-1' }),
}));
jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string): Ref => {
        const kind =
          name === 'vocabulary_words_v5'
            ? 'word'
            : name === 'content_sync_locks'
              ? 'lock'
              : name === 'vocabulary_word_deletion_challenges'
                ? 'challenge'
                : name;
        return {
          kind,
          id,
          get: async () =>
            kind === 'word'
              ? {
                  exists: true,
                  updateTime: { seconds: 1, nanoseconds: 1 },
                  data: () => ({ word: 'amo' }),
                }
              : { exists: false, data: () => undefined },
        };
      },
      where: () => {
        const query = {
          orderBy: () => query,
          limit: () => query,
          startAfter: () => query,
          get: async () => ({ docs: [] }),
        };
        return query;
      },
    }),
    runTransaction: async (callback: (transaction: unknown) => unknown) =>
      callback({
        get: async (candidate: Ref) => {
          if (candidate.kind === 'word') {
            return {
              exists: true,
              updateTime: { seconds: 1, nanoseconds: 1 },
              data: () => ({ word: 'amo' }),
            };
          }
          if (candidate.kind === 'pools-query') return { docs: [] };
          if (candidate.kind === 'lock') return { exists: true, data: () => ({ ownerId: 'sync-1' }) };
          return { exists: false, data: () => undefined };
        },
        delete: transactionDelete,
        set: transactionSet,
        update: transactionUpdate,
      }),
  },
}));

import { DELETE } from '@/src/app/api/admin/words/[wordId]/route';

describe('word deletion during production content sync', () => {
  it('rejects before issuing a challenge or mutating any document', async () => {
    const response = (await DELETE(
      { url: 'http://localhost/api/admin/words/word-1', json: jest.fn().mockResolvedValue({}) } as never,
      { params: Promise.resolve({ wordId: 'word-1' }) }
    )) as unknown as { status: number; body: { code: string } };

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VOCABULARY_CONTENT_SYNC_IN_PROGRESS');
    expect(transactionSet).not.toHaveBeenCalled();
    expect(transactionUpdate).not.toHaveBeenCalled();
    expect(transactionDelete).not.toHaveBeenCalled();
  });
});
