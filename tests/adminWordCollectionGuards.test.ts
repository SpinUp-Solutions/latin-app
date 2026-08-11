jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn(() => {
      throw new Error('Firestore must not be reached for an invalid collection');
    }),
  },
}));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  AdminAccessError: class AdminAccessError extends Error {},
  verifyAdminAccess: jest.fn(async () => ({ uid: 'admin-1' })),
}));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn(() => '__name__') } }));

import * as wordsRoute from '@/src/app/api/admin/words/route';
import { DELETE as deleteWord } from '@/src/app/api/admin/words/[wordId]/route';
import { GET as backupWords } from '@/src/app/api/admin/words/backup/route';
import { POST as migrateWords } from '@/src/app/api/admin/words/migrate/route';

const mockCollection = jest.requireMock('@/src/services/firebase-admin').adminDb.collection as jest.Mock;

const request = (url: string, body?: unknown) =>
  ({
    url,
    json: jest.fn(async () => body),
  }) as never;

function expectInvalidCollection(response: unknown) {
  const result = response as { status: number; body: unknown };
  expect(result.status).toBe(400);
  expect(result.body).toMatchObject({ code: 'INVALID_VOCABULARY_WORD_COLLECTION' });
  expect(mockCollection).not.toHaveBeenCalled();
}

describe('admin word route collection boundaries', () => {
  beforeEach(() => mockCollection.mockClear());

  it('rejects arbitrary collections on list, backup, and delete', async () => {
    expectInvalidCollection(
      await wordsRoute.GET(request('http://localhost/api/admin/words?collection=deleted_vocabulary_pools'))
    );
    expectInvalidCollection(
      await backupWords(request('http://localhost/api/admin/words/backup?collection=vocabulary_pool_archives'))
    );
    expectInvalidCollection(
      await deleteWord(request('http://localhost/api/admin/words/word-1?collection=users'), {
        params: Promise.resolve({ wordId: 'word-1' }),
      })
    );
  });

  it('rejects arbitrary collections on create and update', async () => {
    expectInvalidCollection(
      await wordsRoute.POST(
        request('http://localhost/api/admin/words', { collection: 'vocabulary_pools', word: 'amo' })
      )
    );
    expectInvalidCollection(
      await wordsRoute.PUT(
        request('http://localhost/api/admin/words', {
          collection: 'deleted_vocabulary_pools',
          wordId: 'word-1',
          updates: { word: 'amo' },
        })
      )
    );
  });

  it('fixes migration to the legacy-v4 to current-v5 boundary', async () => {
    expectInvalidCollection(
      await migrateWords(
        request('http://localhost/api/admin/words/migrate?sourceCollection=users&targetCollection=vocabulary_words_v5')
      )
    );
    expectInvalidCollection(
      await migrateWords(
        request(
          'http://localhost/api/admin/words/migrate?sourceCollection=vocabulary_words_v4&targetCollection=vocabulary_pool_archives'
        )
      )
    );
  });
});
