import { TestService, TEST_VERSION_SUMMARY_FIELDS } from '@/src/lib/tests/service';

jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));

const timestamp = '2026-07-16T12:00:00.000Z';
const pages = [
  {
    id: 'page-1',
    items: [
      { id: 'instructions', type: 'text', content: 'Read carefully.' },
      { id: 'question-1', type: 'multiple-choice', maxPoints: 3 },
    ],
  },
];

const snapshot = (id: string, data?: Record<string, unknown>) => ({
  id,
  exists: Boolean(data),
  data: () => data,
});

const testDocument = {
  id: 'test-1',
  kind: 'test',
  title: 'Chapter test',
  description: '',
  passingPercentage: 70,
  rotationVersions: [{ versionId: 'version-1' }],
  isLive: false,
  liveOrder: null,
  publishedAt: null,
  publishedBy: null,
  createdAt: timestamp,
  createdBy: 'admin-1',
  updatedAt: timestamp,
  updatedBy: 'admin-1',
};

const versionDocument = {
  id: 'version-1',
  name: 'Version A',
  pages,
  totalPages: 1,
  totalItems: 2,
  totalExercises: 1,
  totalPoints: 3,
  createdAt: timestamp,
  createdBy: 'admin-1',
  updatedAt: timestamp,
  updatedBy: 'admin-1',
};
const { pages: _versionPages, ...versionSummaryDocument } = versionDocument;

describe('test persistence service', () => {
  it('creates the container and first derived version in one transaction', async () => {
    const create = jest.fn();
    const transaction = {
      get: jest.fn(async (ref: { id: string }) => snapshot(ref.id)),
      create,
    };
    const db = {
      collection: (collection: string) => ({
        doc: (id: string) => ({ collection, id }),
      }),
      runTransaction: (callback: (value: typeof transaction) => unknown) => callback(transaction),
    };
    const service = new TestService(db as never, () => timestamp);

    const result = await service.createTestWithVersion(
      {
        test: {
          id: 'test-1',
          title: 'Chapter test',
          description: '',
          passingPercentage: 70,
        },
        version: { id: 'version-1', name: 'Version A', pages },
      },
      'admin-1'
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map(([, value]) => value)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'version-1', totalItems: 2, totalExercises: 1, totalPoints: 3 }),
        expect.objectContaining({
          id: 'test-1',
          kind: 'test',
          rotationVersions: [{ versionId: 'version-1' }],
        }),
      ])
    );
    expect(result.test.isLive).toBe(false);
  });

  it('recomputes version summaries instead of retaining client totals', async () => {
    const set = jest.fn();
    const transaction = {
      get: jest.fn(async () => snapshot('version-1', versionDocument)),
      set,
    };
    const db = {
      collection: (collection: string) => ({
        doc: (id: string) => ({ collection, id }),
      }),
      runTransaction: (callback: (value: typeof transaction) => unknown) => callback(transaction),
    };
    const service = new TestService(db as never, () => timestamp);

    const version = await service.updateTestVersion(
      'version-1',
      {
        name: 'Version B',
        pages: [{ ...pages[0], items: [...pages[0].items, { id: 'question-2', type: 'fill', maxPoints: 5 }] }],
      },
      'admin-2'
    );

    expect(version).toMatchObject({ totalPages: 1, totalItems: 3, totalExercises: 2, totalPoints: 8 });
    expect(set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ totalItems: 3, totalExercises: 2, totalPoints: 8, updatedBy: 'admin-2' })
    );
  });

  it('updates test settings and an assigned version in one transaction', async () => {
    const set = jest.fn();
    const transaction = {
      get: jest.fn(async (ref: { id: string }) =>
        ref.id === 'test-1' ? snapshot('test-1', testDocument) : snapshot('version-1', versionDocument)
      ),
      set,
    };
    const db = {
      collection: (collection: string) => ({
        doc: (id: string) => ({ collection, id }),
      }),
      runTransaction: (callback: (value: typeof transaction) => unknown) => callback(transaction),
    };
    const service = new TestService(db as never, () => timestamp);

    const result = await service.updateTestWithVersion(
      'test-1',
      {
        versionId: 'version-1',
        test: { title: 'Updated chapter test' },
        version: { name: 'Version B', pages },
      },
      'admin-2'
    );

    expect(set).toHaveBeenCalledTimes(2);
    expect(set.mock.calls.map(([, value]) => value)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'test-1', title: 'Updated chapter test', updatedBy: 'admin-2' }),
        expect.objectContaining({ id: 'version-1', name: 'Version B', totalPoints: 3, updatedBy: 'admin-2' }),
      ])
    );
    expect(result).toMatchObject({
      test: { title: 'Updated chapter test' },
      version: { name: 'Version B', totalPoints: 3 },
    });
  });

  it('projects version summaries without reading page bodies for test lists', async () => {
    let fieldMask: string[] = [];
    const collection = (name: string) => {
      const query = {
        where: () => query,
        orderBy: () => query,
        get: async () => ({
          docs: name === 'lessons' ? [snapshot('test-1', testDocument)] : [],
        }),
        doc: (id: string) => ({ name, id }),
      };
      return query;
    };
    const getAll = async (...values: unknown[]) => {
      fieldMask = (values.at(-1) as { fieldMask: string[] }).fieldMask;
      return [snapshot('version-1', versionSummaryDocument)];
    };
    const service = new TestService({ collection, getAll } as never, () => timestamp);

    const tests = await service.listTests();

    expect(fieldMask).toEqual(TEST_VERSION_SUMMARY_FIELDS);
    expect(fieldMask).not.toContain('pages');
    expect(tests).toEqual([
      expect.objectContaining({ id: 'test-1', rotationVersionCount: 1, minTotalPoints: 3, maxTotalPoints: 3 }),
    ]);
  });
});
