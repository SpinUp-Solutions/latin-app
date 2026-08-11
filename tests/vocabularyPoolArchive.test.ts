jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn(() => '__name__') } }));

import {
  getReadableVocabularyPool,
  loadVocabularyPoolWords,
  writeVocabularyPoolWordArchive,
} from '@/src/lib/vocabulary-pools/archive.server';

const document = (id: string, data?: Record<string, unknown>) => ({
  id,
  exists: Boolean(data),
  data: () => data,
});

describe('vocabulary pool archive resolution', () => {
  it('falls back to the immutable archive and preserves word order', async () => {
    const archivedWords = new Map([
      ['word-1', document('word-1', { word: 'puella' })],
      ['word-2', document('word-2', { word: 'amo' })],
    ]);
    const archiveWordsCollection = {
      where: jest.fn(() => ({
        get: async () => ({ docs: [archivedWords.get('word-1'), archivedWords.get('word-2')] }),
      })),
    };
    const archiveRef = {
      collection: jest.fn(() => archiveWordsCollection),
    };
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => {
          if (name === 'vocabulary_pools') return { get: async () => document(id) };
          if (name === 'deleted_vocabulary_pools') {
            return { get: async () => document(id, { archiveId: 'archive-1' }) };
          }
          if (name === 'vocabulary_pool_archives') {
            return {
              ...archiveRef,
              get: async () => ({
                ...document(id, { name: 'Archived pool', wordDocIds: ['word-2', 'word-1'] }),
                ref: archiveRef,
              }),
            };
          }
          return {};
        },
      }),
    };

    const pool = await getReadableVocabularyPool(db as never, 'pool-1');
    expect(pool?.source).toBe('archive');

    const words = await loadVocabularyPoolWords(pool!);
    expect(words.map(word => word.id)).toEqual(['word-2', 'word-1']);
    expect(archiveRef.collection).toHaveBeenCalledWith('words');
  });

  it('queries only the selected generated-exercise word IDs', async () => {
    const where = jest.fn(() => ({
      get: async () => ({
        docs: ['word-3', 'word-7'].map(id => document(id, { word: id })),
      }),
    }));
    const pool = {
      data: { wordDocIds: Array.from({ length: 25 }, (_, index) => `word-${index + 1}`) },
      source: 'active' as const,
      words: { where },
    };

    const words = await loadVocabularyPoolWords(pool as never, ['word-7', 'word-3']);

    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith('__name__', 'in', ['word-7', 'word-3']);
    expect(words.map(word => word.id)).toEqual(['word-7', 'word-3']);
  });

  it('refuses deletion archival when any referenced word is missing', async () => {
    const words = {
      where: jest.fn(() => ({
        get: async () => ({ docs: [document('word-1', { word: 'amo' })] }),
      })),
    };
    const db = {
      collection: (name: string) => {
        if (name === 'vocabulary_words_v5') return words;
        throw new Error(`Unexpected collection ${name}`);
      },
    };

    await expect(
      writeVocabularyPoolWordArchive(db as never, 'archive-1', { wordDocIds: ['word-1', 'word-missing'] })
    ).rejects.toMatchObject({ name: 'VocabularyPoolArchiveIntegrityError' });
  });

  it('bounds pool word query fan-out concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    const where = jest.fn((_field, _operator, ids: string[]) => ({
      get: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 1));
        active -= 1;
        return { docs: ids.map(id => document(id, { word: id })) };
      },
    }));
    const ids = Array.from({ length: 100 }, (_, index) => `word-${index}`);

    const words = await loadVocabularyPoolWords(
      { data: { wordDocIds: ids }, source: 'active', words: { where } } as never,
      undefined,
      { queryConcurrency: 4 }
    );

    expect(words).toHaveLength(100);
    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it('splits oversized archive commits and preserves all large word snapshots', async () => {
    const ids = Array.from({ length: 8 }, (_, index) => `word-${index}`);
    const documents = ids.map(id => document(id, { word: id, table: 'x'.repeat(1024 * 1024) }));
    const archivedIds: string[] = [];
    let commitAttempts = 0;
    const archiveWords = { doc: (id: string) => ({ id }) };
    const db = {
      collection: (name: string) => {
        if (name === 'vocabulary_words_v5') {
          return { where: () => ({ get: async () => ({ docs: documents }) }) };
        }
        if (name === 'vocabulary_pool_archives') {
          return { doc: () => ({ collection: () => archiveWords }) };
        }
        throw new Error(`Unexpected collection ${name}`);
      },
      batch: () => {
        const pending: string[] = [];
        return {
          set: (ref: { id: string }) => pending.push(ref.id),
          commit: async () => {
            commitAttempts += 1;
            if (commitAttempts === 1) {
              throw Object.assign(new Error('3 INVALID_ARGUMENT: request size too large'), { code: 3 });
            }
            archivedIds.push(...pending);
          },
        };
      },
    };

    await expect(writeVocabularyPoolWordArchive(db as never, 'archive-1', { wordDocIds: ids })).resolves.toBe(8);
    expect(new Set(archivedIds)).toEqual(new Set(ids));
    expect(commitAttempts).toBeGreaterThan(2);
  });
});
