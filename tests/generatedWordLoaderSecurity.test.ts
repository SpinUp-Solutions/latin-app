jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn(() => '__name__') } }));

import { createFirestoreGeneratedWordLoader } from '@/src/lib/tests/generated-word-loader.server';

const exercise = (collection: string) =>
  ({
    type: 'generated-translation',
    data: {
      generatorConfig: { collection, wordSource: 'filters', count: 1 },
      posConfigs: {
        noun: { enabled: true, filters: {} },
      },
    },
  }) as never;

describe('server generated-word loader security', () => {
  it('rejects a persisted arbitrary Admin SDK collection before querying Firestore', async () => {
    const db = { collection: jest.fn() };
    const loader = createFirestoreGeneratedWordLoader(db as never);

    await expect(loader(exercise('users'))).rejects.toThrow(/configured vocabulary collection/);
    expect(db.collection).not.toHaveBeenCalled();
  });

  it('maps legacy vocabulary versions to v5 and strips unapproved document fields', async () => {
    const doc = {
      id: 'word-1',
      data: () => ({
        word: 'puella',
        part_of_speech: 'noun',
        translation: 'girl',
        definitions: ['girl'],
        internalSecret: 'never-return',
      }),
    };
    const query = {
      where: jest.fn(),
      orderBy: jest.fn(),
      limit: jest.fn(),
      get: jest.fn().mockResolvedValue({ docs: [doc], size: 1 }),
    };
    query.where.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    const db = { collection: jest.fn(() => query) };

    const words = await createFirestoreGeneratedWordLoader(db as never)(exercise('vocabulary_words_v4'));

    expect(db.collection).toHaveBeenCalledWith('vocabulary_words_v5');
    expect(words[0]).toMatchObject({ id: 'word-1', root_word: 'puella', translation: 'girl' });
    expect(words[0]).not.toHaveProperty('internalSecret');
  });
});
