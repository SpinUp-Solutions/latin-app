jest.mock('firebase-admin/firestore', () => ({}));

import { prepareVocabularyPoolWordMembership } from '@/src/lib/vocabulary-pools/word-membership.server';

describe('vocabulary pool word membership transaction limits', () => {
  it('rejects more than 400 newly assigned words before reading or writing Firestore', async () => {
    const transaction = { getAll: jest.fn(), update: jest.fn() };
    const db = { collection: jest.fn() };
    const wordIds = Array.from({ length: 401 }, (_, index) => `word-${index}`);

    await expect(
      prepareVocabularyPoolWordMembership(transaction as never, db as never, [], wordIds)
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_WORDS_MISSING', status: 409 });
    expect(transaction.getAll).not.toHaveBeenCalled();
  });
});
