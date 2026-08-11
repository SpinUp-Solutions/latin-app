import { TestAuthoringService } from '@/src/lib/tests/authoring-service';
import { MockTestService } from '@/src/lib/tests/mock-service';
import {
  createAnnotationId,
  createSentenceDiagramFeedbackContent,
  tokenizeDiagramSentence,
} from '@/src/features/sentence-diagramming/model';
import { validateSentenceDiagramDocument } from '@/src/features/sentence-diagramming/validation';

jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: jest.fn() } }));

const at = '2026-07-28T12:00:00.000Z';
const snap = (id: string, value?: Record<string, unknown>) => ({ id, exists: value !== undefined, data: () => value });

type Fixture = Record<string, unknown>;
type OrderedMockFixture = Fixture & { id: string; isLive: boolean; mockOrder: number | null };
type LiveOrderedMockFixture = OrderedMockFixture & { mockOrder: number };
type Ref = { collection: string; id: string; get: () => Promise<Snapshot> };
type Snapshot = { id: string; exists: boolean; data: () => Fixture | undefined };
type Query = { __collection: string; get: () => Promise<{ docs: Snapshot[] }> };
type Write = { kind: 'set' | 'create'; ref: Ref; value: Fixture } | { kind: 'delete'; ref: Ref };
type Transaction = {
  get: (source: Ref | Query) => Promise<Snapshot | { docs: Snapshot[] }>;
  set: (ref: Ref, value: Fixture) => void;
  create: (ref: Ref, value: Fixture) => void;
  delete: (ref: Ref) => void;
};

/** Optimistic Firestore model: reads record versions and conflicting commits retry. */
function mockDb(seed: Record<string, Record<string, Record<string, unknown>>>, enforceReadsBeforeWrites = false) {
  const data = new Map(
    Object.entries(seed).map(([collection, values]) => [collection, new Map(Object.entries(values))])
  );
  const versions = new Map<string, number>();
  let conflicts = 0;
  let retries = 0;
  const keyFor = (ref: Pick<Ref, 'collection' | 'id'>) => `${ref.collection}/${ref.id}`;
  const docs = (collection: string) => {
    let values = data.get(collection);
    if (!values) {
      values = new Map();
      data.set(collection, values);
    }
    return values;
  };
  const read = (ref: Pick<Ref, 'collection' | 'id'>): Snapshot => snap(ref.id, docs(ref.collection).get(ref.id));
  const valueAt = (value: Fixture, field: string) =>
    field
      .split('.')
      .reduce<unknown>(
        (current, key) => (current && typeof current === 'object' ? (current as Fixture)[key] : undefined),
        value
      );
  const collection = (name: string) => {
    const query = (
      filters: Array<[string, unknown]> = [],
      order: Array<[string, 'asc' | 'desc']> = [],
      maximum?: number,
      fields?: string[]
    ) => ({
      __collection: name,
      doc: (id: string): Ref => ({ collection: name, id, get: async () => read({ collection: name, id }) }),
      where: (field: string, _op: string, value: unknown) =>
        query([...filters, [field, value]], order, maximum, fields),
      orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') =>
        query(filters, [...order, [field, direction]], maximum, fields),
      select: (...selected: string[]) => query(filters, order, maximum, selected),
      limit: (value: number) => query(filters, order, value, fields),
      count: () => ({
        get: async () => ({
          data: () => ({
            count: [...docs(name)].filter(([, value]) =>
              filters.every(([field, expected]) => valueAt(value, field) === expected)
            ).length,
          }),
        }),
      }),
      get: async (): Promise<{ docs: Snapshot[] }> => {
        let entries = [...docs(name)].filter(([, value]) =>
          filters.every(([field, expected]) => valueAt(value, field) === expected)
        );
        for (const [field, direction] of [...order].reverse())
          entries = entries.sort(([, left], [, right]) => {
            const compared =
              valueAt(left, field) === valueAt(right, field)
                ? 0
                : valueAt(left, field)! > valueAt(right, field)!
                  ? 1
                  : -1;
            return direction === 'asc' ? compared : -compared;
          });
        if (maximum !== undefined) entries = entries.slice(0, maximum);
        return {
          docs: entries.map(([id, value]) =>
            snap(
              id,
              fields
                ? Object.fromEntries(
                    fields
                      .filter(field => valueAt(value, field) !== undefined)
                      .map(field => [field, valueAt(value, field)])
                  )
                : value
            )
          ),
        };
      },
    });
    return query();
  };
  const db = {
    collection,
    getAll: async (...args: unknown[]) =>
      (
        args.filter(
          (arg): arg is Ref => typeof arg === 'object' && arg !== null && 'collection' in arg && 'id' in arg
        ) as Ref[]
      ).map(ref => {
        const original = docs(ref.collection).get(ref.id);
        const { pages: _pages, ...summary } = original ?? {};
        return snap(ref.id, summary);
      }),
    runTransaction: async <T>(callback: (tx: Transaction) => Promise<T>): Promise<T> => {
      for (;;) {
        const reads = new Map<string, number>();
        const writes: Write[] = [];
        let hasWrites = false;
        const recordRead = (ref: Ref) => reads.set(keyFor(ref), versions.get(keyFor(ref)) ?? 0);
        const tx: Transaction = {
          get: async source => {
            if (enforceReadsBeforeWrites && hasWrites)
              throw new Error('Firestore transactions must read before writing');
            if ('collection' in source) {
              recordRead(source);
              return read(source);
            }
            const result = await source.get();
            result.docs.forEach(document =>
              recordRead({ collection: source.__collection, id: document.id, get: async () => document })
            );
            return result;
          },
          set: (ref, value) => {
            hasWrites = true;
            writes.push({ kind: 'set', ref, value });
          },
          create: (ref, value) => {
            hasWrites = true;
            writes.push({ kind: 'create', ref, value });
          },
          delete: ref => {
            hasWrites = true;
            writes.push({ kind: 'delete', ref });
          },
        };
        const result = await callback(tx);
        if ([...reads].some(([key, version]) => (versions.get(key) ?? 0) !== version)) {
          conflicts += 1;
          retries += 1;
          continue;
        }
        if (writes.some(write => write.kind === 'create' && docs(write.ref.collection).has(write.ref.id))) {
          conflicts += 1;
          retries += 1;
          continue;
        }
        writes.forEach(write => {
          if (write.kind === 'delete') docs(write.ref.collection).delete(write.ref.id);
          else docs(write.ref.collection).set(write.ref.id, write.value);
          versions.set(keyFor(write.ref), (versions.get(keyFor(write.ref)) ?? 0) + 1);
        });
        return result;
      }
    },
  };
  return {
    db,
    get: (collection: string, id: string) => docs(collection).get(id),
    stats: () => ({ conflicts, retries }),
  };
}

const version = {
  id: 'v1',
  name: 'A',
  pages: [{ id: 'p1', items: [{ id: 'q1', type: 'multiple-choice', maxPoints: 1 }] }],
  totalPages: 1,
  totalItems: 1,
  totalExercises: 1,
  totalPoints: 1,
  createdAt: at,
  createdBy: 'a',
  updatedAt: at,
  updatedBy: 'a',
};
const test = {
  id: 't1',
  kind: 'test',
  title: 'T',
  description: '',
  passingPercentage: null,
  rotationVersions: [],
  createdAt: at,
  createdBy: 'a',
  updatedAt: at,
  updatedBy: 'a',
};
const mock = {
  id: MockTestService.parentMockId('t1', 'v1'),
  versionId: 'v1',
  parent: { kind: 'test', testId: 't1' },
  title: 'M',
  description: '',
  passingPercentage: null,
  status: 'active',
  isLive: true,
  mockOrder: 0,
  createdAt: at,
  createdBy: 'a',
  updatedAt: at,
  updatedBy: 'a',
};
const standaloneInput = (id: string, versionId: string, isLive = true) => ({
  mock: { id, title: id, description: '', passingPercentage: null, isLive },
  version: { id: versionId, name: versionId, pages: version.pages },
});

describe('mock transactional lifecycle', () => {
  it('reads ordering survivors before writes while archiving, moving, and hiding live mocks', async () => {
    const survivor = {
      ...mock,
      id: 'survivor',
      versionId: 'v2',
      parent: { kind: 'standalone' as const },
      mockOrder: 1,
    };
    const versions = { v1: version, v2: { ...version, id: 'v2', name: 'B' } };
    const archiveMemory = mockDb(
      {
        lessons: {},
        testVersions: versions,
        mockTests: { 'standalone-1': { ...mock, id: 'standalone-1', parent: { kind: 'standalone' } }, survivor },
        mockTestOrdering: {},
        learningPaths: {},
      },
      true
    );
    await expect(
      new MockTestService(archiveMemory.db as never, () => at).archiveMock('standalone-1', 'admin')
    ).resolves.toMatchObject({ status: 'archived' });

    const moveMemory = mockDb(
      {
        lessons: { t1: test },
        testVersions: versions,
        mockTests: { 'standalone-1': { ...mock, id: 'standalone-1', parent: { kind: 'standalone' } }, survivor },
        mockTestOrdering: {},
        learningPaths: {},
      },
      true
    );
    await expect(
      new MockTestService(moveMemory.db as never, () => at).moveStandaloneMockToTest(
        'standalone-1',
        { testId: 't1' },
        'admin'
      )
    ).resolves.toBeDefined();

    const hideMemory = mockDb(
      {
        lessons: {},
        testVersions: versions,
        mockTests: { 'standalone-1': { ...mock, id: 'standalone-1', parent: { kind: 'standalone' } }, survivor },
        mockTestOrdering: {},
        learningPaths: {},
      },
      true
    );
    await expect(
      new MockTestService(hideMemory.db as never, () => at).updateMock('standalone-1', { isLive: false }, 'admin')
    ).resolves.toMatchObject({ isLive: false });
  });

  it('compacts survivors when an existing live parent assignment becomes hidden', async () => {
    const survivor = {
      ...mock,
      id: 'survivor',
      versionId: 'v2',
      parent: { kind: 'standalone' as const },
      mockOrder: 1,
    };
    const memory = mockDb(
      {
        lessons: { t1: test },
        testVersions: { v1: version, v2: { ...version, id: 'v2', name: 'B' } },
        mockTests: { [mock.id]: mock, survivor },
        mockTestOrdering: {},
        learningPaths: {},
      },
      true
    );
    const hidden = await new MockTestService(memory.db as never, () => at).assignVersionToMock(
      { testId: 't1', versionId: 'v1', title: 'Hidden', description: '', passingPercentage: null, isLive: false },
      'admin'
    );
    expect(hidden).toMatchObject({ isLive: false, mockOrder: null });
    expect(memory.get('mockTests', 'survivor')).toMatchObject({ mockOrder: 0 });
  });

  it('serializes archive/reactivation retries: history and deterministic id survive while rotation ownership transfers', async () => {
    const memory = mockDb({
      lessons: { t1: test },
      testVersions: { v1: version },
      mockTests: { [mock.id]: mock },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const service = new MockTestService(memory.db as never, () => at);
    const archived = await service.archiveMock(mock.id, 'admin-2');
    expect(archived).toMatchObject({ id: mock.id, status: 'archived', isLive: false, mockOrder: null, createdAt: at });
    expect((memory.get('lessons', 't1') as { rotationVersions?: unknown } | undefined)?.rotationVersions).toEqual([
      { versionId: 'v1' },
    ]);
    const input = {
      testId: 't1',
      versionId: 'v1',
      title: 'Reactivated',
      description: '',
      passingPercentage: 80,
      isLive: true,
    };
    const [first, second] = await Promise.all([
      service.assignVersionToMock(input, 'admin-3'),
      service.assignVersionToMock(input, 'admin-3'),
    ]);
    expect(first.id).toBe(mock.id);
    expect(second.id).toBe(mock.id);
    expect(memory.get('mockTests', mock.id)).toMatchObject({ status: 'active', createdAt: at, title: 'Reactivated' });
    expect((memory.get('lessons', 't1') as { rotationVersions?: unknown } | undefined)?.rotationVersions).toEqual([]);
  });

  it('moves a standalone mock into rotation, while duplicate keeps the mock active and regenerates content ids', async () => {
    const standalone = { ...mock, id: 'standalone-1', parent: { kind: 'standalone' }, title: 'Standalone' };
    const memory = mockDb({
      lessons: { t1: { ...test, rotationVersions: [] } },
      testVersions: { v1: version },
      mockTests: { 'standalone-1': standalone },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const service = new MockTestService(memory.db as never, () => at);
    const moved = await service.moveStandaloneMockToTest('standalone-1', { testId: 't1' }, 'admin-2');
    expect(moved.mock.status).toBe('archived');
    expect((memory.get('lessons', 't1') as { rotationVersions?: unknown } | undefined)?.rotationVersions).toEqual([
      { versionId: 'v1' },
    ]);

    const copyMemory = mockDb({
      lessons: { t1: test },
      testVersions: { v1: version },
      mockTests: { 'standalone-1': standalone },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const copyService = new MockTestService(copyMemory.db as never, () => at);
    const copied = await copyService.duplicateStandaloneMockVersionIntoTest(
      'standalone-1',
      { testId: 't1', requestId: 'retry-key' },
      'admin-2'
    );
    const retried = await copyService.duplicateStandaloneMockVersionIntoTest(
      'standalone-1',
      { testId: 't1', requestId: 'retry-key' },
      'admin-2'
    );
    expect(copied.mock.status).toBe('active');
    expect(copied.version.pages[0].id).not.toBe('p1');
    expect(copied.version.pages[0].items[0].id).not.toBe('q1');
    expect(retried.version.id).toBe(copied.version.id);
    expect((copyMemory.get('lessons', 't1') as { rotationVersions?: unknown } | undefined)?.rotationVersions).toEqual([
      { versionId: copied.version.id },
    ]);
  });

  it('serializes archive and move against mock-scoped version saves', async () => {
    const active = { ...mock, id: 'standalone-1', parent: { kind: 'standalone' as const }, title: 'Standalone' };
    const archiveMemory = mockDb({
      lessons: {},
      testVersions: { v1: version },
      mockTests: { 'standalone-1': active },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const archiveService = new MockTestService(archiveMemory.db as never, () => at);
    const archiveRace = await Promise.allSettled([
      archiveService.updateActiveMockVersion('standalone-1', { name: 'Edited', pages: version.pages }, 'editor'),
      archiveService.archiveMock('standalone-1', 'archiver'),
    ]);
    expect(archiveRace.some(result => result.status === 'fulfilled')).toBe(true);
    await expect(
      archiveService.updateActiveMockVersion('standalone-1', { name: 'Late', pages: version.pages }, 'editor')
    ).rejects.toMatchObject({ code: 'MOCK_TEST_INVALID_OPERATION' });

    const moveMemory = mockDb({
      lessons: { t1: test },
      testVersions: { v1: version },
      mockTests: { 'standalone-1': active },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const moveService = new MockTestService(moveMemory.db as never, () => at);
    await Promise.allSettled([
      moveService.updateActiveMockVersion('standalone-1', { name: 'Edited', pages: version.pages }, 'editor'),
      moveService.moveStandaloneMockToTest('standalone-1', { testId: 't1' }, 'mover'),
    ]);
    await expect(
      moveService.updateActiveMockVersion('standalone-1', { name: 'Late', pages: version.pages }, 'editor')
    ).rejects.toMatchObject({ code: 'MOCK_TEST_INVALID_OPERATION' });
  });

  it('duplicates a normal rotation version idempotently with regenerated canonical identities', async () => {
    const memory = mockDb({
      lessons: { t1: { ...test, rotationVersions: [{ versionId: 'v1' }] } },
      testVersions: { v1: version },
      mockTests: {},
      mockTestOrdering: {},
      learningPaths: {},
    });
    const service = new TestAuthoringService(memory.db as never, () => at);
    const first = await service.duplicateTestVersion('t1', 'v1', { requestId: 'retry-key', name: 'A Copy' }, 'admin-2');
    const second = await service.duplicateTestVersion(
      't1',
      'v1',
      { requestId: 'retry-key', name: 'ignored-on-retry' },
      'admin-2'
    );
    expect(second.version.id).toBe(first.version.id);
    expect(second.version.name).toBe('A Copy');
    expect(first.version.pages[0].id).not.toBe('p1');
    expect(first.version.pages[0].items[0].id).not.toBe('q1');
    expect((memory.get('lessons', 't1') as { rotationVersions: unknown[] }).rotationVersions).toHaveLength(1);
    expect(memory.get('testVersions', first.version.id)).toBeUndefined();
    expect(memory.get('testVersionDrafts', first.version.id)).toMatchObject({
      id: first.version.id,
      testId: 't1',
      name: 'A Copy',
    });
  });

  it('does not duplicate archived pool assignments into either new version path', async () => {
    const archivedVersion = { ...version, vocabularyPoolId: 'archived-pool' };
    const normalMemory = mockDb({
      lessons: { t1: { ...test, rotationVersions: [{ versionId: 'v1' }] } },
      testVersions: { v1: archivedVersion },
      testVersionDrafts: {},
      deleted_vocabulary_pools: { 'archived-pool': { archiveId: 'archive-1' } },
      mockTests: {},
      mockTestOrdering: {},
      learningPaths: {},
    });
    await expect(
      new TestAuthoringService(normalMemory.db as never, () => at).duplicateTestVersion(
        't1',
        'v1',
        { requestId: 'archived-copy' },
        'admin-2'
      )
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_ARCHIVED' });

    const standalone = { ...mock, id: 'standalone-1', parent: { kind: 'standalone' as const } };
    const mockMemory = mockDb({
      lessons: { t1: test },
      testVersions: { v1: archivedVersion },
      testVersionDrafts: {},
      deleted_vocabulary_pools: { 'archived-pool': { archiveId: 'archive-1' } },
      mockTests: { 'standalone-1': standalone },
      mockTestOrdering: {},
      learningPaths: {},
    });
    await expect(
      new MockTestService(mockMemory.db as never, () => at).duplicateStandaloneMockVersionIntoTest(
        'standalone-1',
        { testId: 't1', requestId: 'archived-mock-copy' },
        'admin-2'
      )
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_ARCHIVED' });
  });

  it('keeps incomplete versions inactive until an explicit successful activation', async () => {
    const memory = mockDb({
      lessons: { t1: test },
      testVersions: {},
      testVersionDrafts: {},
      mockTests: {},
      mockTestOrdering: {},
      learningPaths: {},
    });
    const service = new TestAuthoringService(memory.db as never, () => at);

    const created = await service.addTestVersion('t1', { id: 'draft-1', name: 'Work in progress', pages: [] }, 'admin');
    expect(created.version).toMatchObject({ id: 'draft-1', testId: 't1', totalPages: 0, totalExercises: 0 });
    expect((memory.get('lessons', 't1') as { rotationVersions: unknown[] }).rotationVersions).toEqual([]);
    expect(memory.get('testVersions', 'draft-1')).toBeUndefined();

    await expect(service.activateTestVersion('t1', 'draft-1', 'admin')).rejects.toBeDefined();
    expect(memory.get('testVersionDrafts', 'draft-1')).toBeDefined();

    await service.updateTestVersionDraft('t1', 'draft-1', { name: 'Ready', pages: version.pages }, 'admin');
    const activated = await service.activateTestVersion('t1', 'draft-1', 'admin');
    expect(activated.version).toMatchObject({ id: 'draft-1', name: 'Ready', totalExercises: 1 });
    expect(memory.get('testVersionDrafts', 'draft-1')).toBeUndefined();
    expect(memory.get('testVersions', 'draft-1')).toBeDefined();
    expect((memory.get('lessons', 't1') as { rotationVersions: unknown[] }).rotationVersions).toEqual([
      { versionId: 'draft-1' },
    ]);
  });

  it('blocks deactivating a placed test’s final version and allows it when another active version remains', async () => {
    const path = {
      revision: 1,
      unitIds: ['t1'],
      updatedAt: at,
      updatedBy: 'admin',
    };
    const memory = mockDb({
      lessons: { t1: { ...test, rotationVersions: [{ versionId: 'v1' }] } },
      testVersions: { v1: version },
      testVersionDrafts: {},
      mockTests: {},
      mockTestOrdering: {},
      learningPaths: { default: path },
    });
    const service = new TestAuthoringService(memory.db as never, () => at);

    await expect(service.deactivateTestVersion('t1', 'v1', 'admin')).rejects.toMatchObject({
      code: 'PLACED_TEST_REQUIRES_ROTATION_VERSION',
    });
    expect(memory.get('testVersions', 'v1')).toBeDefined();

    const second = { ...version, id: 'v2', name: 'B' };
    const twoVersionMemory = mockDb({
      lessons: { t1: { ...test, rotationVersions: [{ versionId: 'v1' }, { versionId: 'v2' }] } },
      testVersions: { v1: version, v2: second },
      testVersionDrafts: {},
      mockTests: {},
      mockTestOrdering: {},
      learningPaths: { default: path },
    });
    const deactivated = await new TestAuthoringService(twoVersionMemory.db as never, () => at).deactivateTestVersion(
      't1',
      'v1',
      'admin'
    );
    expect(deactivated.version).toMatchObject({ id: 'v1', testId: 't1' });
    expect(twoVersionMemory.get('testVersions', 'v1')).toBeUndefined();
    expect(twoVersionMemory.get('testVersionDrafts', 'v1')).toBeDefined();
    expect((twoVersionMemory.get('lessons', 't1') as { rotationVersions: unknown[] }).rotationVersions).toEqual([
      { versionId: 'v2' },
    ]);
  });

  it('uses the same nested identity rewrite for normal and standalone mock duplicates without mutating their source', async () => {
    const richVersion = {
      ...version,
      pages: [
        {
          id: 'rich-page',
          items: [
            {
              id: 'matching-1',
              type: 'matching',
              maxPoints: 1,
              data: {
                leftColumn: [{ id: 'left-1', value: 'amo' }],
                rightColumn: [{ id: 'right-1', value: 'love' }],
                answers: { 'left-1': 'right-1' },
              },
            },
          ],
        },
      ],
    };
    const source = JSON.parse(JSON.stringify(richVersion));
    const copiedMatching = (copied: {
      pages: Array<{
        items: Array<{
          id: string;
          data: {
            leftColumn: Array<{ id: string }>;
            rightColumn: Array<{ id: string }>;
            answers: Record<string, string>;
          };
        }>;
      }>;
    }) => copied.pages[0].items[0];

    const normalMemory = mockDb({
      lessons: { t1: { ...test, rotationVersions: [{ versionId: 'v1' }] } },
      testVersions: { v1: richVersion },
      mockTests: {},
      mockTestOrdering: {},
      learningPaths: {},
    });
    const normalService = new TestAuthoringService(normalMemory.db as never, () => at);
    const normalFirst = await normalService.duplicateTestVersion(
      't1',
      'v1',
      { requestId: 'nested-copy', name: 'Nested copy' },
      'admin-2'
    );
    const normalRetry = await normalService.duplicateTestVersion(
      't1',
      'v1',
      { requestId: 'nested-copy', name: 'ignored' },
      'admin-2'
    );

    const standalone = { ...mock, id: 'standalone-1', parent: { kind: 'standalone' as const }, title: 'Standalone' };
    const mockMemory = mockDb({
      lessons: { t1: test },
      testVersions: { v1: richVersion },
      mockTests: { 'standalone-1': standalone },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const mockCopy = await new MockTestService(mockMemory.db as never, () => at).duplicateStandaloneMockVersionIntoTest(
      'standalone-1',
      { testId: 't1', requestId: 'nested-mock-copy' },
      'admin-2'
    );

    [normalFirst.version, mockCopy.version].forEach(copied => {
      const matching = copiedMatching(copied);
      const left = matching.data.leftColumn[0].id;
      const right = matching.data.rightColumn[0].id;
      expect(matching.id).not.toBe('matching-1');
      expect(left).not.toBe('left-1');
      expect(right).not.toBe('right-1');
      expect(matching.data.answers).toEqual({ [left]: right });
    });
    expect(normalRetry.version.id).toBe(normalFirst.version.id);
    expect(richVersion).toEqual(source);
    expect(normalMemory.get('testVersions', 'v1')).toEqual(source);
    expect(mockMemory.get('testVersions', 'v1')).toEqual(source);
  });

  it('preserves canonical sentence-diagram IDs through both normal and standalone copies', async () => {
    const latin = 'amat';
    const tokens = tokenizeDiagramSentence(latin);
    const span = { startTokenIndex: 0, endTokenIndex: 0, startCharOffset: 0, endCharOffset: 4 };
    const annotation = { id: createAnnotationId('verb', span), kind: 'verb' as const, span };
    const feedback = {
      ...createSentenceDiagramFeedbackContent(latin),
      annotations: [annotation],
    };
    const diagramVersion = {
      ...version,
      pages: [
        {
          id: 'diagram-page',
          items: [
            {
              id: 'diagram-exercise',
              type: 'sentence-diagramming',
              maxPoints: 1,
              data: {
                latin,
                translation: 'he loves',
                tokens,
                solutionAnnotations: [annotation],
                availableStudentTools: ['verb' as const],
                hint: feedback,
                explanation: feedback,
                difficulty: 'beginner' as const,
              },
            },
          ],
        },
      ],
    };
    const source = JSON.parse(JSON.stringify(diagramVersion));
    const normalMemory = mockDb({
      lessons: { t1: { ...test, rotationVersions: [{ versionId: 'v1' }] } },
      testVersions: { v1: diagramVersion },
      mockTests: {},
      mockTestOrdering: {},
      learningPaths: {},
    });
    const normalCopy = await new TestAuthoringService(normalMemory.db as never, () => at).duplicateTestVersion(
      't1',
      'v1',
      { requestId: 'diagram-copy' },
      'admin-2'
    );

    const standalone = {
      ...mock,
      id: 'standalone-diagram',
      parent: { kind: 'standalone' as const },
      title: 'Standalone diagram',
    };
    const mockMemory = mockDb({
      lessons: { t1: test },
      testVersions: { v1: diagramVersion },
      mockTests: { 'standalone-diagram': standalone },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const mockCopy = await new MockTestService(mockMemory.db as never, () => at).duplicateStandaloneMockVersionIntoTest(
      'standalone-diagram',
      { testId: 't1', requestId: 'diagram-mock-copy' },
      'admin-2'
    );

    [normalCopy.version, mockCopy.version].forEach(copied => {
      const item = copied.pages[0].items[0] as unknown as {
        id: string;
        data: (typeof diagramVersion.pages)[0]['items'][0]['data'];
      };
      expect(item.id).not.toBe('diagram-exercise');
      expect(item.data).toEqual(source.pages[0].items[0].data);
      expect(validateSentenceDiagramDocument(item.data)).toEqual([]);
    });
    expect(diagramVersion).toEqual(source);
    expect(normalMemory.get('testVersions', 'v1')).toEqual(source);
    expect(mockMemory.get('testVersions', 'v1')).toEqual(source);
  });

  it('touches mock audit metadata atomically when its owned version is edited', async () => {
    const memory = mockDb({
      lessons: { t1: test },
      testVersions: { v1: version },
      mockTests: { [mock.id]: mock },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const service = new MockTestService(memory.db as never, () => '2026-07-29T12:00:00.000Z');
    await service.updateActiveMockVersion(mock.id, { name: 'Edited mock version', pages: version.pages }, 'admin-9');
    expect(memory.get('testVersions', 'v1')).toMatchObject({ name: 'Edited mock version', updatedBy: 'admin-9' });
    expect(memory.get('mockTests', mock.id)).toMatchObject({
      updatedAt: '2026-07-29T12:00:00.000Z',
      updatedBy: 'admin-9',
    });
  });

  it('reactivates an archived standalone with its original id and history only while its version is unclaimed', async () => {
    const standalone = {
      ...mock,
      id: 'standalone-1',
      parent: { kind: 'standalone' as const },
      status: 'archived' as const,
      isLive: false,
      mockOrder: null,
    };
    const memory = mockDb({
      lessons: { t1: { ...test, rotationVersions: [] } },
      testVersions: { v1: version },
      mockTests: { 'standalone-1': standalone },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const service = new MockTestService(memory.db as never, () => at);

    const reactivated = await service.reactivateStandaloneMock('standalone-1', { isLive: true }, 'admin-2');
    expect(reactivated).toMatchObject({
      id: 'standalone-1',
      versionId: 'v1',
      status: 'active',
      isLive: true,
      mockOrder: 0,
      createdAt: at,
    });
    expect(memory.get('mockTests', 'standalone-1')).toMatchObject({
      createdAt: at,
      createdBy: 'a',
      updatedBy: 'admin-2',
    });

    await service.archiveMock('standalone-1', 'admin-3');
    (memory.get('lessons', 't1') as { rotationVersions: unknown[] }).rotationVersions.push({ versionId: 'v1' });
    await expect(service.reactivateStandaloneMock('standalone-1', { isLive: false }, 'admin-4')).rejects.toMatchObject({
      code: 'VERSION_ALREADY_ASSIGNED',
    });
  });

  it('requires parent-linked archived mocks to use their parent test assignment path', async () => {
    const archivedParent = { ...mock, status: 'archived' as const, isLive: false, mockOrder: null };
    const memory = mockDb({
      lessons: { t1: { ...test, rotationVersions: [{ versionId: 'v1' }] } },
      testVersions: { v1: version },
      mockTests: { [mock.id]: archivedParent },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const service = new MockTestService(memory.db as never, () => at);
    await expect(service.reactivateStandaloneMock(mock.id, { isLive: false }, 'admin')).rejects.toMatchObject({
      code: 'MOCK_TEST_INVALID_OPERATION',
    });
  });

  it('joins only active parent mocks with a deliverable version into test detail', async () => {
    const valid = { ...mock, id: 'parent-valid', isLive: false, mockOrder: null };
    const missing = { ...mock, id: 'parent-missing', versionId: 'gone', isLive: false, mockOrder: null };
    const archived = { ...mock, id: 'parent-archived', status: 'archived', isLive: false, mockOrder: null };
    const memory = mockDb({
      lessons: { t1: test },
      testVersions: { v1: version },
      mockTests: { 'parent-valid': valid, 'parent-missing': missing, 'parent-archived': archived },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const detail = await new TestAuthoringService(memory.db as never, () => at).getTest('t1');
    expect(detail.mocks?.map(entry => entry.id)).toEqual(['parent-valid']);
    errors.mockRestore();
  });

  it('serializes standalone creates, hidden publication, and reorder interleavings into one dense live scope', async () => {
    const hidden = { ...mock, id: 'hidden', parent: { kind: 'standalone' as const }, isLive: false, mockOrder: null };
    const memory = mockDb({
      lessons: {},
      testVersions: { v1: version },
      mockTests: { hidden },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const service = new MockTestService(memory.db as never, () => at);

    await Promise.all([
      service.createStandaloneMock(standaloneInput('one', 'v2'), 'admin'),
      service.createStandaloneMock(standaloneInput('two', 'v3'), 'admin'),
      service.updateMock('hidden', { isLive: true }, 'admin'),
    ]);
    expect(memory.stats()).toMatchObject({ conflicts: expect.any(Number), retries: expect.any(Number) });
    expect(memory.stats().conflicts).toBeGreaterThan(0);
    const firstPhaseConflicts = memory.stats().conflicts;
    await Promise.all([
      service.reorderMocks({ mockIds: ['two', 'hidden', 'one'] }, 'admin'),
      service.updateMock('one', { isLive: false }, 'admin'),
    ]);
    expect(memory.stats().conflicts).toBeGreaterThan(firstPhaseConflicts);

    const live = ['two', 'hidden', 'one']
      .map(id => memory.get('mockTests', id) as OrderedMockFixture | undefined)
      .filter((card): card is LiveOrderedMockFixture => Boolean(card?.isLive && typeof card.mockOrder === 'number'))
      .sort((left, right) => left.mockOrder - right.mockOrder);
    expect(live.map(card => [card.id, card.mockOrder])).toEqual([
      ['two', 0],
      ['hidden', 1],
    ]);
    expect(new Set(live.map(card => card.mockOrder)).size).toBe(live.length);
    expect(live.map(card => card.mockOrder)).toEqual(live.map((_, index) => index));
    await expect(service.reorderMocks({ mockIds: ['two'] }, 'admin')).rejects.toMatchObject({
      code: 'MOCK_TEST_INVALID_OPERATION',
    });
  });

  it('rejects invalid visibility transitions while keeping archived and hidden mocks out of the live ordering scope', async () => {
    const archived = { ...mock, id: 'archived', status: 'archived' as const, isLive: false, mockOrder: null };
    const hidden = { ...mock, id: 'hidden', isLive: false, mockOrder: null };
    const memory = mockDb({
      lessons: { t1: test },
      testVersions: { v1: version },
      mockTests: { archived, hidden },
      mockTestOrdering: {},
      learningPaths: {},
    });
    const service = new MockTestService(memory.db as never, () => at);
    await expect(service.updateMock('archived', { isLive: true }, 'admin')).rejects.toMatchObject({
      code: 'MOCK_TEST_INVALID_OPERATION',
    });
    const published = await service.updateMock('hidden', { isLive: true }, 'admin');
    expect(published).toMatchObject({ status: 'active', isLive: true, mockOrder: 0 });
    expect(memory.get('mockTests', 'archived')).toMatchObject({ isLive: false, mockOrder: null });
  });

  it('projects isolated live cards with twelve chronological trend points and related-nudge filtering', async () => {
    const good = { ...mock, id: 'good', parent: { kind: 'test' as const, testId: 't1' }, mockOrder: 0 };
    const missingVersion = { ...mock, id: 'missing-version', versionId: 'gone', mockOrder: 1 };
    const malformed = { id: 'malformed', status: 'active', isLive: true, mockOrder: 2 };
    const hidden = { ...mock, id: 'hidden', isLive: false, mockOrder: null };
    const archived = { ...mock, id: 'archived', status: 'archived' as const, isLive: false, mockOrder: null };
    const attempts = Object.fromEntries(
      Array.from({ length: 13 }, (_, index) => [
        `a-${index}`,
        {
          studentId: 'student',
          status: 'submitted',
          origin: { kind: 'mock-test', mockTestId: 'good' },
          score: index,
          maxScore: 13,
          percentage: index * 5,
          outcome: 'score-only',
          submittedAt: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
        },
      ])
    );
    const memory = mockDb({
      lessons: { t1: test },
      testVersions: { v1: version },
      mockTests: { good, 'missing-version': missingVersion, malformed, hidden, archived },
      testAttempts: attempts,
      mockTestOrdering: {},
      learningPaths: {},
    });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new MockTestService(memory.db as never, () => at);

    const cards = await service.listStudentLiveMocks('student');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: 'good',
      attemptSummary: { attemptCount: 13, best: { percentage: 60 }, latest: { percentage: 60 } },
    });
    expect(cards[0].scoreTrend).toEqual(
      Array.from({ length: 12 }, (_, index) => ({
        percentage: (index + 1) * 5,
        submittedAt: `2026-07-${String(index + 2).padStart(2, '0')}T00:00:00.000Z`,
      }))
    );
    await expect(service.getRelatedLiveMocks('t1')).resolves.toEqual([
      { id: 'good', title: 'M', passingPercentage: null },
    ]);
    errors.mockRestore();
  });
});
