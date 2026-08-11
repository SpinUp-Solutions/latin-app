jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn(() => '__name__') } }));

import { assertVocabularyPoolAssignmentsAllowedInTransaction } from '@/src/lib/vocabulary-pools/assignment.server';

type Snapshot = { exists: boolean; data: () => Record<string, unknown> };

function fixture(states: Record<string, boolean>) {
  const db = {
    collection: (collection: string) => ({
      doc: (id: string) => ({ path: `${collection}/${id}` }),
    }),
  };
  const transaction = {
    get: jest.fn(
      async (ref: { path: string }): Promise<Snapshot> => ({
        exists: Boolean(states[ref.path]),
        data: () => (states[ref.path] ? { _assignmentRevision: 2 } : {}),
      })
    ),
    update: jest.fn(),
  };
  return { db, transaction };
}

const nestedPoolLesson = (poolId: string) => ({
  pages: [
    {
      id: 'page-1',
      items: [
        {
          id: 'exercise-1',
          data: { generatorConfig: { wordSource: 'pool', poolId } },
        },
      ],
    },
  ],
});

describe('vocabulary pool authoring assignment guard', () => {
  it('allows a new active direct or nested assignment and reads its tombstone in the transaction', async () => {
    const { db, transaction } = fixture({
      'vocabulary_pools/direct-pool': true,
      'vocabulary_pools/nested-pool': true,
    });

    const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
      transaction as never,
      db as never,
      undefined,
      {
        vocabularyPoolId: 'direct-pool',
        ...nestedPoolLesson('nested-pool'),
      }
    );

    expect(transaction.get).toHaveBeenCalledWith({ path: 'deleted_vocabulary_pools/direct-pool' });
    expect(transaction.get).toHaveBeenCalledWith({ path: 'deleted_vocabulary_pools/nested-pool' });
    expect(transaction.update).not.toHaveBeenCalled();
    applyVocabularyPoolAssignmentRevisions();
    expect(transaction.update).toHaveBeenCalledTimes(2);
    expect(transaction.update).toHaveBeenCalledWith(
      { path: 'vocabulary_pools/direct-pool' },
      { _assignmentRevision: 3 }
    );
  });

  it('allows an unchanged archived reference but rejects a newly introduced archived reference', async () => {
    const { db, transaction } = fixture({ 'deleted_vocabulary_pools/archived-pool': true });
    const archived = nestedPoolLesson('archived-pool');

    const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
      transaction as never,
      db as never,
      archived,
      archived
    );
    applyVocabularyPoolAssignmentRevisions();
    expect(transaction.update).not.toHaveBeenCalled();
    await expect(
      assertVocabularyPoolAssignmentsAllowedInTransaction(transaction as never, db as never, undefined, archived)
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_ARCHIVED', status: 409 });
  });

  it('rejects increasing the number of references to an archived pool', async () => {
    const { db, transaction } = fixture({ 'deleted_vocabulary_pools/archived-pool': true });

    await expect(
      assertVocabularyPoolAssignmentsAllowedInTransaction(
        transaction as never,
        db as never,
        { vocabularyPoolId: 'archived-pool' },
        { vocabularyPoolId: 'archived-pool', ...nestedPoolLesson('archived-pool') }
      )
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_ARCHIVED' });
  });

  it('rejects moving an archived assignment into a new reference slot', async () => {
    const direct = fixture({ 'deleted_vocabulary_pools/archived-pool': true });
    await expect(
      assertVocabularyPoolAssignmentsAllowedInTransaction(
        direct.transaction as never,
        direct.db as never,
        { vocabularyPoolId: 'archived-pool' },
        nestedPoolLesson('archived-pool')
      )
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_ARCHIVED' });

    const exercise = fixture({ 'deleted_vocabulary_pools/archived-pool': true });
    const moved = nestedPoolLesson('archived-pool');
    moved.pages[0].items[0].id = 'exercise-2';
    await expect(
      assertVocabularyPoolAssignmentsAllowedInTransaction(
        exercise.transaction as never,
        exercise.db as never,
        nestedPoolLesson('archived-pool'),
        moved
      )
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_ARCHIVED' });
  });

  it('bumps the former active pool revision when a reference is removed', async () => {
    const { db, transaction } = fixture({ 'vocabulary_pools/former-pool': true });
    const applyVocabularyPoolAssignmentRevisions = await assertVocabularyPoolAssignmentsAllowedInTransaction(
      transaction as never,
      db as never,
      nestedPoolLesson('former-pool'),
      { pages: [] }
    );

    expect(transaction.update).not.toHaveBeenCalled();
    applyVocabularyPoolAssignmentRevisions();
    expect(transaction.update).toHaveBeenCalledWith(
      { path: 'vocabulary_pools/former-pool' },
      { _assignmentRevision: 3 }
    );
  });

  it('rejects missing pools and active/tombstone state collisions', async () => {
    const missing = fixture({});
    await expect(
      assertVocabularyPoolAssignmentsAllowedInTransaction(
        missing.transaction as never,
        missing.db as never,
        undefined,
        { vocabulary_pool: 'missing-pool' }
      )
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_NOT_FOUND' });

    const collision = fixture({
      'vocabulary_pools/collision-pool': true,
      'deleted_vocabulary_pools/collision-pool': true,
    });
    await expect(
      assertVocabularyPoolAssignmentsAllowedInTransaction(
        collision.transaction as never,
        collision.db as never,
        undefined,
        { vocabulary_pool: 'collision-pool' }
      )
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_STATE_CONFLICT' });
  });
});
