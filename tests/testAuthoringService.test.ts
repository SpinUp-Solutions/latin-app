import { TestAuthoringService } from '@/src/lib/tests/authoring-service';
import { TEST_VERSION_SUMMARY_FIELDS } from '@/src/lib/tests/domain';

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn() } }));

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
  it('rejects a test assignment transaction while production-content maintenance owns the lock', async () => {
    const create = jest.fn();
    const transaction = {
      get: jest.fn(async (ref: { collection: string; id: string }) =>
        ref.collection === 'content_sync_locks' ? snapshot(ref.id, { ownerId: 'sync-owner' }) : snapshot(ref.id)
      ),
      create,
      update: jest.fn(),
    };
    const db = {
      collection: (collection: string) => ({ doc: (id: string) => ({ collection, id }) }),
      runTransaction: (callback: (value: typeof transaction) => unknown) => callback(transaction),
    };
    const service = new TestAuthoringService(db as never, () => timestamp);

    await expect(
      service.createTestWithVersion(
        {
          test: { id: 'test-1', title: 'Chapter test', description: '', passingPercentage: 70 },
          version: { id: 'version-1', name: 'Version A', pages, vocabularyPoolId: 'pool-1' },
        },
        'admin-1'
      )
    ).rejects.toMatchObject({ status: 409, code: 'VOCABULARY_CONTENT_SYNC_IN_PROGRESS' });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates the container and first derived version in one transaction', async () => {
    const create = jest.fn();
    const transaction = {
      get: jest.fn(async (ref: { collection: string; id: string }) =>
        ref.collection === 'vocabulary_pools' ? snapshot(ref.id, { name: 'Pool' }) : snapshot(ref.id)
      ),
      create,
      update: jest.fn(),
    };
    const db = {
      collection: (collection: string) => ({
        doc: (id: string) => ({ collection, id }),
      }),
      runTransaction: (callback: (value: typeof transaction) => unknown) => callback(transaction),
    };
    const service = new TestAuthoringService(db as never, () => timestamp);

    const result = await service.createTestWithVersion(
      {
        test: {
          id: 'test-1',
          title: 'Chapter test',
          description: '',
          passingPercentage: 70,
        },
        version: { id: 'version-1', name: 'Version A', pages, vocabularyPoolId: 'pool-1' },
      },
      'admin-1'
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map(([, value]) => value)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'version-1',
          vocabularyPoolId: 'pool-1',
          totalItems: 2,
          totalExercises: 1,
          totalPoints: 3,
        }),
        expect.objectContaining({
          id: 'test-1',
          kind: 'test',
          rotationVersions: [{ versionId: 'version-1' }],
        }),
      ])
    );
    expect(result.test).not.toHaveProperty('isLive');
  });

  it('updates test settings and an assigned version in one transaction', async () => {
    const set = jest.fn();
    const transaction = {
      get: jest.fn(async (ref: { collection: string; id: string }) =>
        ref.collection === 'content_sync_locks'
          ? snapshot(ref.id)
          : ref.collection === 'vocabulary_pools'
            ? snapshot(ref.id, { name: 'Pool' })
            : ref.collection === 'deleted_vocabulary_pools'
              ? snapshot(ref.id)
              : ref.id === 'test-1'
                ? snapshot('test-1', testDocument)
                : snapshot('version-1', { ...versionDocument, vocabularyPoolId: 'pool-existing' })
      ),
      set,
      update: jest.fn(),
    };
    const db = {
      collection: (collection: string) => ({
        doc: (id: string) => ({ collection, id }),
      }),
      runTransaction: (callback: (value: typeof transaction) => unknown) => callback(transaction),
    };
    const service = new TestAuthoringService(db as never, () => timestamp);

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
        expect.objectContaining({
          id: 'version-1',
          name: 'Version B',
          vocabularyPoolId: 'pool-existing',
          totalPoints: 3,
          updatedBy: 'admin-2',
        }),
      ])
    );
    expect(result).toMatchObject({
      test: { title: 'Updated chapter test' },
      version: { name: 'Version B', totalPoints: 3 },
    });
  });

  it('refuses a stale normal-version save after ownership leaves the rotation', async () => {
    const transaction = {
      get: jest.fn(async (ref: { collection?: string; id: string }) =>
        ref.collection === 'content_sync_locks'
          ? snapshot(ref.id)
          : ref.id === 'test-1'
            ? snapshot('test-1', { ...testDocument, rotationVersions: [] })
            : snapshot('version-1', versionDocument)
      ),
      set: jest.fn(),
    };
    const db = {
      collection: (collection: string) => ({ doc: (id: string) => ({ collection, id }) }),
      runTransaction: (callback: (value: typeof transaction) => unknown) => callback(transaction),
    };
    const service = new TestAuthoringService(db as never, () => timestamp);

    await expect(
      service.updateTestWithVersion(
        'test-1',
        { versionId: 'version-1', test: { title: 'Stale' }, version: { name: 'Stale', pages } },
        'admin-2'
      )
    ).rejects.toMatchObject({ code: 'TEST_VERSION_NOT_IN_TEST' });
    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('treats an identical inactive-draft retry as success without another write', async () => {
    const secondVersion = {
      ...versionDocument,
      id: 'version-2',
      testId: 'test-1',
      name: 'Version B',
    };
    const transaction = {
      get: jest.fn(async (ref: { collection: string; id: string }) => {
        if (ref.collection === 'lessons') return snapshot('test-1', testDocument);
        if (ref.collection === 'testVersionDrafts') return snapshot('version-2', secondVersion);
        return snapshot('version-2');
      }),
      set: jest.fn(),
      create: jest.fn(),
    };
    const db = {
      collection: (collection: string) => ({ doc: (id: string) => ({ collection, id }) }),
      runTransaction: (callback: (value: typeof transaction) => unknown) => callback(transaction),
    };
    const result = await new TestAuthoringService(db as never, () => timestamp).addTestVersion(
      'test-1',
      { id: 'version-2', name: 'Version B', pages },
      'admin-2'
    );
    expect(result.version.id).toBe('version-2');
    expect(result.version).toMatchObject({ testId: 'test-1' });
    expect(transaction.create).not.toHaveBeenCalled();
    expect(transaction.set).not.toHaveBeenCalled();
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
    const service = new TestAuthoringService({ collection, getAll } as never, () => timestamp);

    const tests = await service.listTests();

    expect(fieldMask).toEqual(TEST_VERSION_SUMMARY_FIELDS);
    expect(fieldMask).not.toContain('pages');
    expect(tests).toEqual([
      expect.objectContaining({ id: 'test-1', rotationVersionCount: 1, minTotalPoints: 3, maxTotalPoints: 3 }),
    ]);
  });
});
