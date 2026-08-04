import {
  extractVocabularyPoolReferences,
  projectVocabularyPoolUsages,
  scanVocabularyPoolUsages,
} from '@/src/lib/vocabulary-pools/usage.server';

type TestDocument = { id: string; data: Record<string, unknown> };

function scanDb(documentsByCollection: Record<string, TestDocument[]>, counts: Partial<Record<string, number>> = {}) {
  const select = jest.fn();
  return {
    select,
    db: {
      collection: (collection: string) => {
        const documents = documentsByCollection[collection] ?? [];
        return {
          count: () => ({ get: async () => ({ data: () => ({ count: counts[collection] ?? documents.length }) }) }),
          select: (...fields: string[]) => {
            select(collection, fields);
            return {
              get: async () => ({ docs: documents.map(document => ({ id: document.id, data: () => document.data })) }),
            };
          },
        };
      },
    },
  };
}

describe('vocabulary pool usage extraction', () => {
  it('keeps direct assignments and only counts generated exercises configured to use a pool', () => {
    expect(
      extractVocabularyPoolReferences({
        vocabulary_pool: 'lesson-pool',
        pages: [
          {
            id: 'page-1',
            items: [
              { id: 'from-pool', data: { generatorConfig: { wordSource: 'pool', poolId: 'exercise-pool' } } },
              { id: 'stale-pool', data: { generatorConfig: { wordSource: 'filters', poolId: 'ignored-pool' } } },
              { id: 'missing-pool', data: { generatorConfig: { wordSource: 'pool' } } },
            ],
          },
        ],
      })
    ).toEqual([
      { poolId: 'lesson-pool', kind: 'direct' },
      { poolId: 'exercise-pool', kind: 'exercise', pageIndex: 0, pageId: 'page-1', itemIndex: 0, itemId: 'from-pool' },
    ]);
  });

  it('preserves page and exercise titles, with ordinals when either title is absent', () => {
    const references = extractVocabularyPoolReferences({
      pages: [
        {
          id: 'page-titled',
          title: 'Verb practice',
          items: [
            {
              id: 'item-titled',
              title: 'Identify the tense',
              data: { generatorConfig: { wordSource: 'pool', poolId: 'titled-pool' } },
            },
          ],
        },
        {
          id: 'page-untitled',
          items: [
            {
              id: 'item-untitled',
              data: { generatorConfig: { wordSource: 'pool', poolId: 'untitled-pool' } },
            },
          ],
        },
      ],
    });

    expect(references).toEqual([
      expect.objectContaining({ pageTitle: 'Verb practice', itemTitle: 'Identify the tense' }),
      expect.objectContaining({ pageIndex: 1, itemIndex: 0 }),
    ]);

    const usages = projectVocabularyPoolUsages({
      learningUnits: [
        {
          id: 'lesson-1',
          data: {
            kind: 'lesson',
            title: 'Lesson one',
            pages: [
              {
                id: 'page-titled',
                title: 'Verb practice',
                items: [
                  {
                    id: 'item-titled',
                    title: 'Identify the tense',
                    data: { generatorConfig: { wordSource: 'pool', poolId: 'titled-pool' } },
                  },
                ],
              },
              {
                id: 'page-untitled',
                items: [
                  { id: 'item-untitled', data: { generatorConfig: { wordSource: 'pool', poolId: 'untitled-pool' } } },
                ],
              },
            ],
          },
        },
      ],
      versions: [],
      drafts: [],
      mocks: [],
    });

    expect(usages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          poolId: 'titled-pool',
          label: 'Lesson: Lesson one → Verb practice → Identify the tense',
        }),
        expect.objectContaining({
          poolId: 'untitled-pool',
          label: 'Lesson: Lesson one → Page 2 → exercise 1',
        }),
      ])
    );
  });

  it('uses the active mock before normal rotation ownership and preserves draft editor links', () => {
    const usages = projectVocabularyPoolUsages({
      learningUnits: [
        { id: 'lesson-1', data: { kind: 'lesson', title: 'First lesson', vocabulary_pool: 'lesson-pool' } },
        {
          id: 'test-1',
          data: { kind: 'test', title: 'Chapter test', rotationVersions: [{ versionId: 'version-1' }] },
        },
      ],
      versions: [
        {
          id: 'version-1',
          data: {
            name: 'Version A',
            vocabularyPoolId: 'version-pool',
            pages: [
              {
                id: 'page-1',
                items: [
                  { id: 'exercise-1', data: { generatorConfig: { wordSource: 'pool', poolId: 'exercise-pool' } } },
                ],
              },
            ],
          },
        },
      ],
      drafts: [{ id: 'draft-1', data: { testId: 'test-1', name: 'Draft A', vocabularyPoolId: 'draft-pool' } }],
      mocks: [{ id: 'mock-1', data: { title: 'Mock A', versionId: 'version-1', status: 'active' } }],
    });

    expect(usages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          poolId: 'version-pool',
          label: 'Mock test: Mock A → Version A',
          editorUrl: '/admin/mock-tests/mock-1',
        }),
        expect.objectContaining({
          poolId: 'exercise-pool',
          label: 'Mock test: Mock A → Version A → Page 1 → exercise 1',
        }),
        expect.objectContaining({
          poolId: 'draft-pool',
          label: 'Test draft: Chapter test → Draft A',
          editorUrl: '/admin/tests/edit/test-1/versions/draft-1/edit',
        }),
      ])
    );
  });

  it('uses an archived standalone mock before falling back to text-only orphan ownership', () => {
    const usages = projectVocabularyPoolUsages({
      learningUnits: [],
      versions: [
        { id: 'archived-version', data: { name: 'Archived version', vocabularyPoolId: 'archived-pool' } },
        { id: 'orphan-version', data: { name: 'Lost version', vocabularyPoolId: 'orphan-pool' } },
      ],
      drafts: [],
      mocks: [
        {
          id: 'archived-mock',
          data: {
            title: 'Archived mock',
            versionId: 'archived-version',
            status: 'archived',
            parent: { kind: 'standalone' },
          },
        },
      ],
    });

    expect(usages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          poolId: 'archived-pool',
          label: 'Mock test: Archived mock → Archived version',
          editorUrl: '/admin/mock-tests/archived-mock',
        }),
        expect.objectContaining({
          poolId: 'orphan-pool',
          label: 'Orphaned version: Lost version',
        }),
      ])
    );
    expect(usages.find(usage => usage.poolId === 'orphan-pool')?.editorUrl).toBeUndefined();
  });

  it('fails closed before reading documents when aggregate counts exceed the cap', async () => {
    const { db, select } = scanDb({}, { lessons: 501 });
    const result = await scanVocabularyPoolUsages(db as never);

    expect(result).toMatchObject({ status: 'unavailable', documentCount: 501 });
    expect(select).not.toHaveBeenCalled();
  });

  it('projects a successful canonical scan and guards a post-count document race', async () => {
    const successful = scanDb({
      lessons: [
        { id: 'lesson-1', data: { kind: 'lesson', title: 'Lesson one', vocabulary_pool: 'lesson-pool' } },
        { id: 'test-1', data: { kind: 'test', title: 'Test one', rotationVersions: [{ versionId: 'version-1' }] } },
      ],
      testVersions: [{ id: 'version-1', data: { name: 'Version one', vocabularyPoolId: 'version-pool' } }],
    });
    const result = await scanVocabularyPoolUsages(successful.db as never);

    expect(result).toMatchObject({ status: 'available', documentCount: 3 });
    if (result.status === 'available') {
      expect(result.usages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ poolId: 'lesson-pool', label: 'Lesson: Lesson one' }),
          expect.objectContaining({
            poolId: 'version-pool',
            editorUrl: '/admin/tests/edit/test-1/versions/version-1/edit',
          }),
        ])
      );
    }

    const race = scanDb(
      { lessons: Array.from({ length: 501 }, (_, index) => ({ id: `lesson-${index}`, data: { kind: 'lesson' } })) },
      { lessons: 500 }
    );
    await expect(scanVocabularyPoolUsages(race.db as never)).resolves.toMatchObject({
      status: 'unavailable',
      documentCount: 501,
    });
  });
});
