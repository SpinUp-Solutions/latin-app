import {
  SOURCE_PROJECT_ID,
  SOURCE_STORAGE_BUCKET,
  TARGET_PROJECT_ID,
  TARGET_STORAGE_BUCKET,
  buildContentFingerprint,
  buildManifest,
  createPlan,
  isZeroByteStorageFolderMarker,
  sha256,
} from '../scripts/sync-prod-content-to-dev-core.mjs';

const timestamp = '2026-08-03T10:00:00.000Z';

type SyncDocument = {
  id: string;
  data: Record<string, unknown>;
  createTime: string;
  updateTime: string;
};

type SyncState = {
  projectId: string;
  storageBucket: string;
  database: string;
  capturedAt?: string;
  collections: Record<string, SyncDocument[]>;
  excludedCollections: Record<string, SyncDocument[]>;
  storage: Array<Record<string, unknown>>;
  excludedStorage: Array<Record<string, unknown>>;
  authFingerprint: { count: number; hash: string };
};

type PlanOperation = {
  collection: string;
  id: string;
  action: string;
  source?: SyncDocument | null;
  target?: SyncDocument | null;
};

type SyncPlan = {
  planHash: string;
  firestoreOperations: PlanOperation[];
  projectedState: SyncState;
};

function doc(collection: string, id: string, data: Record<string, unknown>): SyncDocument {
  return { id, data: { id, ...data }, createTime: timestamp, updateTime: timestamp };
}

function state(projectId: string, storageBucket: string, collections: Record<string, SyncDocument[]> = {}, storage: Array<Record<string, unknown>> = []): SyncState {
  return {
    projectId,
    storageBucket,
    database: '(default)',
    capturedAt: timestamp,
    collections,
    excludedCollections: { users: [doc('users', 'user-1', { role: 'student' })] },
    storage,
    excludedStorage: [],
    authFingerprint: { count: 1, hash: sha256('auth-before') },
  };
}

function lesson(id: string) {
  return doc('lessons', id, {
    kind: 'lesson',
    title: id,
    description: 'integration fixture',
    type: 'normal',
    pages: [{ id: `${id}-page`, items: [{ id: `${id}-item`, type: 'text' }] }],
    isLive: true,
    liveOrder: 0,
    publishedAt: timestamp,
    publishedBy: 'admin',
  });
}

function storageObject(name: string, md5Hash = 'md5') {
  return { name, generation: '1', metageneration: '1', size: '1', md5Hash, crc32c: null, contentType: 'audio/mpeg', metadata: {} };
}

function fixtures() {
  const source = state(SOURCE_PROJECT_ID, SOURCE_STORAGE_BUCKET, {
    lessons: [lesson('prod-lesson')],
    learningPaths: [doc('learningPaths', 'default', { id: 'default', revision: 1, unitIds: ['prod-lesson'], updatedAt: timestamp, updatedBy: 'admin' })],
    vocabulary_pools: [],
    vocabulary_words_v5: [],
  }, [storageObject('lessons/prod-lesson/audio.mp3')]);
  const target = state(TARGET_PROJECT_ID, TARGET_STORAGE_BUCKET, {
    lessons: [],
    learningPaths: [],
    vocabulary_pools: [],
    vocabulary_words_v5: [],
  });
  return { source, target };
}

class InMemorySyncHarness {
  constructor(public readonly target: SyncState) {}

  private before!: SyncState;
  private expectedPostSyncContentFingerprint: string | null = null;
  private failed = false;

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  snapshot() {
    return this.clone(this.target);
  }

  backup(plan: SyncPlan, shouldFail = false) {
    this.before = this.snapshot();
    if (shouldFail) throw new Error('simulated backup failure');
    return plan.planHash;
  }

  apply(plan: SyncPlan, failAfterPhase?: string, omitOperationId?: string) {
    if (this.failed) throw new Error('failed run cannot resume');
    this.backup(plan);
    this.expectedPostSyncContentFingerprint = buildContentFingerprint(plan.projectedState);
    const phase = (name: string, operations: PlanOperation[]) => {
      for (const operation of operations.filter(candidate => ['create', 'update', 'delete'].includes(candidate.action) && candidate.id !== omitOperationId)) {
        const records = this.target.collections[operation.collection] ?? [];
        const index = records.findIndex(record => record.id === operation.id);
        if (operation.action === 'delete') records.splice(index, 1);
        else {
          if (!operation.source) throw new Error(`missing source for ${operation.collection}/${operation.id}`);
          if (index === -1) records.push(this.clone(operation.source));
          else records[index] = this.clone(operation.source);
        }
      }
      if (failAfterPhase === name) {
        this.failed = true;
        throw new Error(`simulated failure after ${name}`);
      }
    };
    phase('words', plan.firestoreOperations.filter(operation => operation.collection === 'vocabulary_words_v5'));
    phase('pools', plan.firestoreOperations.filter(operation => operation.collection === 'vocabulary_pools'));
    phase('lessons', plan.firestoreOperations.filter(operation => operation.collection === 'lessons' && operation.action !== 'delete'));
    phase('stale-deletions', plan.firestoreOperations.filter(operation => operation.action === 'delete'));
    phase('learningPaths', plan.firestoreOperations.filter(operation => operation.collection === 'learningPaths'));
    this.target.storage = this.clone(plan.projectedState.storage);
  }

  verify() {
    return this.expectedPostSyncContentFingerprint === buildContentFingerprint(this.target);
  }

  rollback(expectedPostSyncManifestHash: string) {
    if (buildManifest(this.target).manifestHash !== expectedPostSyncManifestHash) throw new Error('post-sync fingerprint drift');
    this.target.collections = this.before.collections;
    this.target.storage = this.before.storage;
    this.target.excludedCollections = this.before.excludedCollections;
    this.target.excludedStorage = this.before.excludedStorage;
    this.target.authFingerprint = this.before.authFingerprint;
  }
}

describe('production content sync equivalent integration workflow', () => {
  it('backs up before writes and fails closed when backup fails', () => {
    const { source, target } = fixtures();
    const plan = createPlan(source, target);
    const harness = new InMemorySyncHarness(target);
    const before = buildContentFingerprint(target);
    expect(() => harness.backup(plan, true)).toThrow(/backup failure/);
    expect(buildContentFingerprint(target)).toBe(before);
  });

  it('rejects stale plan state before any apply and does not resume a partial failure', () => {
    const { source, target } = fixtures();
    const plan = createPlan(source, target);
    target.collections.lessons.push(lesson('unexpected-drift'));
    const driftedPlan = createPlan(source, target);
    expect(driftedPlan.planHash).not.toBe(plan.planHash);

    const clean = fixtures();
    const partial = new InMemorySyncHarness(clean.target);
    const partialBefore = buildContentFingerprint(clean.target);
    expect(() => partial.apply(createPlan(clean.source, clean.target), 'lessons')).toThrow(/simulated failure/);
    expect(() => partial.apply(createPlan(clean.source, clean.target))).toThrow(/cannot resume/);
    expect(buildContentFingerprint(clean.target)).not.toBe(partialBefore);
  });

  it('keeps the zero-byte lessons/ folder marker out of the integration plan and fingerprint', () => {
    const clean = fixtures();
    const marked = fixtures();
    const marker = { name: 'lessons/', generation: '1', metageneration: '1', size: '0', md5Hash: null, crc32c: null, contentType: null, metadata: {} };
    marked.source.storage.push(marker);
    marked.target.storage.push(marker);

    expect(isZeroByteStorageFolderMarker(marker)).toBe(true);
    expect(createPlan(marked.source, marked.target).planHash).toBe(createPlan(clean.source, clean.target).planHash);
    expect(buildContentFingerprint(marked.target)).toBe(buildContentFingerprint(clean.target));
  });

  it('applies and rolls back deterministic clones for a mutable fixture collision', () => {
    const { source, target } = fixtures();
    source.collections.vocabulary_pools.push(doc('vocabulary_pools', 'shared-pool', { name: 'Production', wordDocIds: ['shared-word'] }));
    source.collections.vocabulary_words_v5.push(doc('vocabulary_words_v5', 'shared-word', { word: 'production', part_of_speech: 'noun' }));
    target.collections.lessons.push({ ...lesson('fixture-lesson'), data: { ...lesson('fixture-lesson').data, vocabulary_pool: 'shared-pool' } });
    target.collections.vocabulary_pools.push(doc('vocabulary_pools', 'shared-pool', { name: 'Fixture', wordDocIds: ['shared-word'] }));
    target.collections.vocabulary_words_v5.push(doc('vocabulary_words_v5', 'shared-word', { word: 'fixture', part_of_speech: 'verb' }));
    target.excludedCollections.practiceCategoryMemberships = [doc('practiceCategoryMemberships', 'membership', { lessonId: 'fixture-lesson' })];

    const before = buildContentFingerprint(target);
    const plan = createPlan(source, target);
    const poolRemap = plan.audit.fixtureClosure.fixtureRemaps.find(remap => remap.kind === 'vocabulary_pool');
    const wordRemap = plan.audit.fixtureClosure.fixtureRemaps.find(remap => remap.kind === 'vocabulary_word');
    if (!poolRemap || !wordRemap) throw new Error('Expected deterministic pool and word remaps');
    const harness = new InMemorySyncHarness(target);
    harness.apply(plan);

    expect(harness.verify()).toBe(true);
    expect(target.collections.vocabulary_pools.find(record => record.id === 'shared-pool')?.data.name).toBe('Production');
    expect(target.collections.vocabulary_pools.find(record => record.id === poolRemap.remappedId)?.data.name).toBe('Fixture');
    expect(target.collections.lessons.find(record => record.id === 'fixture-lesson')?.data.vocabulary_pool).toBe(poolRemap.remappedId);
    expect(target.collections.vocabulary_words_v5.find(record => record.id === wordRemap.remappedId)?.data.word).toBe('fixture');

    const postSyncManifestHash = buildManifest(target).manifestHash;
    harness.rollback(postSyncManifestHash);
    expect(buildContentFingerprint(target)).toBe(before);
  });

  it('verifies the post-sync fingerprint and requires it unchanged for rollback', () => {
    const { source, target } = fixtures();
    const plan = createPlan(source, target);
    const harness = new InMemorySyncHarness(target);
    harness.apply(plan);
    expect(harness.verify()).toBe(true);
    const postSyncManifestHash = buildManifest(target).manifestHash;
    target.excludedCollections.users[0].data.role = 'admin';
    expect(() => harness.rollback(postSyncManifestHash)).toThrow(/fingerprint drift/);
    target.excludedCollections.users[0].data.role = 'student';
    harness.rollback(postSyncManifestHash);
    expect(buildContentFingerprint(target)).toBe(plan.targetContentFingerprint);
  });

  it('fails verification when an apply omits a projected mirror operation', () => {
    const { source, target } = fixtures();
    const plan = createPlan(source, target);
    const harness = new InMemorySyncHarness(target);
    harness.apply(plan, undefined, 'prod-lesson');
    expect(harness.verify()).toBe(false);
  });
});
