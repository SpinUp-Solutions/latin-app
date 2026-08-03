import {
  BACKUP_BUCKET,
  MAX_BATCH_WRITES,
  MIRRORED_COLLECTIONS,
  SOURCE_PROJECT_ID,
  SOURCE_STORAGE_BUCKET,
  TARGET_PROJECT_ID,
  TARGET_STORAGE_BUCKET,
  SyncError,
  canonicalJson,
  chunkOperations,
  collectFixtureClosure,
  createPlan,
  dataHash,
  decodeFirestoreValue,
  encodeFirestoreValue,
  assertPlanHash,
  normalizeStorageRecord,
  safePathSegment,
  sha256,
  validateCurrentTargetState,
} from '../scripts/sync-prod-content-to-dev-core.mjs';

const timestamp = '2026-08-03T10:00:00.000Z';

class Timestamp {
  constructor(
    public readonly seconds: number,
    public readonly nanoseconds: number
  ) {}

  toDate() {
    return new Date(this.seconds * 1000);
  }
}

class GeoPoint {
  constructor(
    public readonly latitude: number,
    public readonly longitude: number
  ) {}
}

class DocumentReference {
  constructor(public readonly path: string) {}
}

type TestDocument = { id: string; data: Record<string, unknown>; updateTime: string; createTime: string };
type TestStorageRecord = { name: string; generation: string; metageneration: string; size: string; md5Hash: string; crc32c: null; contentType: string; metadata: Record<string, unknown> };
type TestState = {
  projectId: string;
  storageBucket: string;
  database: string;
  capturedAt: string;
  collections: Record<string, TestDocument[]>;
  excludedCollections: Record<string, TestDocument[]>;
  storage: TestStorageRecord[];
  excludedStorage: TestStorageRecord[];
  authFingerprint: { count: number; hash: string };
};

function record(collection: string, id: string, data: Record<string, unknown>, updateTime = timestamp) {
  return { id, data: { id, ...data }, updateTime, createTime: timestamp };
}

function lesson(id: string, extra: Record<string, unknown> = {}) {
  return record('lessons', id, {
    kind: 'lesson',
    title: id,
    description: `${id} description`,
    type: 'normal',
    pages: [{ id: `${id}-page`, items: [{ id: `${id}-item`, type: 'text', content: id }] }],
    isLive: true,
    liveOrder: 0,
    publishedAt: timestamp,
    publishedBy: 'admin',
    ...extra,
  });
}

function testLesson(id: string, versionId: string) {
  return record('lessons', id, {
    kind: 'test',
    title: id,
    description: `${id} description`,
    rotationVersions: [{ versionId }],
    passingPercentage: 70,
  });
}

function path(unitIds: string[]) {
  return record('learningPaths', 'default', {
    id: 'default',
    revision: 4,
    unitIds,
    updatedAt: timestamp,
    updatedBy: 'admin',
  });
}

function storage(name: string, md5Hash = 'hash'): TestStorageRecord {
  return { name, generation: '1', metageneration: '1', size: '5', md5Hash, crc32c: null, contentType: 'audio/mpeg', metadata: {} };
}

function state(projectId: string, bucket: string, collections: Record<string, TestDocument[]> = {}, storageObjects: TestStorageRecord[] = []): TestState {
  return {
    projectId,
    storageBucket: bucket,
    database: '(default)',
    capturedAt: timestamp,
    collections,
    excludedCollections: {},
    storage: storageObjects,
    excludedStorage: [],
    authFingerprint: { count: 0, hash: sha256('no-users') },
  };
}

function baseStates() {
  const source = state(SOURCE_PROJECT_ID, SOURCE_STORAGE_BUCKET, {
    lessons: [lesson('lesson-prod')],
    learningPaths: [path(['lesson-prod'])],
    vocabulary_pools: [record('vocabulary_pools', 'pool-prod', { name: 'Production', wordDocIds: ['word-prod'] })],
    vocabulary_words_v5: [record('vocabulary_words_v5', 'word-prod', { word: 'amo', part_of_speech: 'verb' })],
  }, [storage('lessons/lesson-prod/audio.mp3')]);
  const target = state(TARGET_PROJECT_ID, TARGET_STORAGE_BUCKET, {
    lessons: [
      testLesson('test-fixture', 'version-fixture'),
      lesson('category-fixture', { vocabulary_pool: 'pool-fixture' }),
      lesson('stale-lesson'),
    ],
    learningPaths: [path(['stale-lesson'])],
    vocabulary_pools: [
      record('vocabulary_pools', 'pool-fixture', { name: 'Fixture', wordDocIds: ['word-fixture'] }),
      record('vocabulary_pools', 'pool-stale', { name: 'Stale', wordDocIds: [] }),
    ],
    vocabulary_words_v5: [
      record('vocabulary_words_v5', 'word-fixture', { word: 'sum', part_of_speech: 'verb' }),
      record('vocabulary_words_v5', 'word-stale', { word: 'stale', part_of_speech: 'noun' }),
    ],
  }, [
    storage('lessons/test-fixture/audio.mp3'),
    storage('lessons/stale-lesson/audio.mp3'),
  ]);
  target.excludedCollections = {
    users: [record('users', 'user-1', { role: 'student' })],
    practiceCategoryMemberships: [record('practiceCategoryMemberships', 'membership-1', { lessonId: 'category-fixture' })],
    testVersions: [record('testVersions', 'version-fixture', { name: 'Fixture', pages: [], vocabularyPoolId: 'pool-fixture' })],
    testVersionDrafts: [],
  };
  target.excludedStorage = [storage('unrelated/private.txt')];
  return { source, target };
}

describe('production content sync pure core', () => {
  it('canonicalizes object key order and hashes deterministically', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(dataHash({ b: 2, a: 1 })).toBe(dataHash({ a: 1, b: 2 }));
    expect(sha256('same')).toHaveLength(64);
  });

  it('normalizes Storage metadata idempotently for stable repeated manifests', () => {
    const record = normalizeStorageRecord({ name: 'lessons/lesson-prod/audio.mp3', generation: '1', metageneration: '1', size: '5', md5Hash: 'hash', metadata: { z: 'last', a: 'first' } });
    const renormalized = normalizeStorageRecord(record);
    expect(renormalized.hash).toBe(record.hash);
    expect(renormalized.contentHash).toBe(record.contentHash);
    expect(renormalized.metadata).toEqual(record.metadata);
  });

  it('builds a plan that overlays dev fixtures and retains their dependency closure', () => {
    const { source, target } = baseStates();
    const plan = createPlan(source, target);
    expect(plan.closure.preservedLessonIds).toEqual(new Set(['test-fixture', 'category-fixture']));
    expect(plan.closure.preservedPoolIds).toEqual(new Set(['pool-fixture']));
    expect(plan.closure.preservedWordIds).toEqual(new Set(['word-fixture']));
    expect(plan.planHash).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.audit.validation.ok).toBe(true);
    expect(plan.audit.firestore.summary).toMatchObject({ create: 3, update: 1, delete: 3, preserve: 4 });
    expect(plan.audit.storage.summary).toMatchObject({ create: 1, update: 0, delete: 1, preserve: 1 });

    const writes = plan.firestoreOperations.filter(operation => ['create', 'update', 'delete'].includes(operation.action));
    expect(writes.every(operation => MIRRORED_COLLECTIONS.includes(operation.collection))).toBe(true);
    expect(writes.some(operation => operation.collection === 'lessons' && operation.id === 'test-fixture')).toBe(false);
    expect(writes.some(operation => operation.collection === 'practiceCategoryMemberships')).toBe(false);
    expect(plan.storageOperations.find(operation => operation.name === 'lessons/test-fixture/audio.mp3')?.action).toBe('preserve');
    expect(plan.storageOperations.find(operation => operation.name === 'unrelated/private.txt')).toBeUndefined();
  });

  it('rejects an ambiguous fixture collision and missing membership dependency', () => {
    const { source, target } = baseStates();
    source.collections.vocabulary_pools.push(record('vocabulary_pools', 'pool-fixture', { name: 'Different', wordDocIds: ['word-prod'] }));
    expect(() => collectFixtureClosure(source, target)).toThrow(SyncError);

    const missingMembership = baseStates();
    missingMembership.target.collections.practiceCategoryMemberships = [record('practiceCategoryMemberships', 'bad', { lessonId: 'missing' })];
    expect(() => createPlan(missingMembership.source, missingMembership.target)).toThrow(/missing lesson/);
  });

  it('rejects non-canonical learning paths and storage outside lessons/**', () => {
    const { source, target } = baseStates();
    source.collections.learningPaths[0].data.legacyField = true;
    expect(() => createPlan(source, target)).toThrow(/non-canonical/);

    const next = baseStates();
    next.source.storage.push(storage('audio/lesson-prod.mp3'));
    expect(() => createPlan(next.source, next.target)).toThrow(/outside lessons/);
  });

  it('validates the current dev graph independently from later production drift', () => {
    const { source, target } = baseStates();
    const plan = createPlan(source, target);
    source.collections.lessons[0].data.title = 'changed after apply';
    source.collections.learningPaths[0].data.unitIds = ['lesson-prod'];
    expect(validateCurrentTargetState(target, plan.closure)).toMatchObject({ lessonCount: 3, poolCount: 2, wordCount: 2 });
  });

  it('keeps Firestore batches below both write and byte limits', () => {
    const operations = Array.from({ length: MAX_BATCH_WRITES + 3 }, (_, index) => ({
      collection: 'vocabulary_words_v5',
      id: `word-${index}`,
      action: 'create',
      source: { data: { id: `word-${index}`, value: 'x' } },
    }));
    const chunks = chunkOperations(operations);
    expect(chunks.every(chunk => chunk.length <= MAX_BATCH_WRITES)).toBe(true);
    expect(chunks.length).toBe(2);
  });

  it('rejects a stale or malformed apply precondition', () => {
    expect(() => assertPlanHash('a'.repeat(64), 'b'.repeat(64))).toThrow(/planHash/);
    expect(() => assertPlanHash('a'.repeat(64), 'not-a-hash')).toThrow(/planHash/);
    expect(() => assertPlanHash('a'.repeat(64), 'a'.repeat(64))).not.toThrow();
  });

  it('serializes Firestore values without emitting secrets or unstable key order', () => {
    const encoded = encodeFirestoreValue({ z: Buffer.from('audio'), a: { b: 2, a: 1 } });
    expect(encoded).toEqual({
      __syncType: 'map',
      entries: [
        ['a', { __syncType: 'map', entries: [['a', 1], ['b', 2]] }],
        ['z', { __syncType: 'bytes', base64: 'YXVkaW8=' }],
      ],
    });
    expect(JSON.stringify(encoded)).not.toContain('privateKey');
    expect(BACKUP_BUCKET).toBe('latin-app-dev-prod-content-sync-122256273781');
    expect(TARGET_PROJECT_ID).toBe('latin-app-dev');
  });

  it('does not confuse a Firestore map containing reserved-looking keys with a special value', () => {
    const map = { __type: 'bytes', value: 'literal', base64: 'not-a-real-bytes-value' };
    const encoded = encodeFirestoreValue(map);
    const decoded = decodeFirestoreValue(encoded, { doc: (path: string) => new DocumentReference(path) });
    expect(decoded).toEqual(map);
    expect(dataHash(map)).not.toBe(dataHash(Buffer.from('literal')));
  });

  it('uses collision-resistant hashed artifact path segments while retaining the source name in records', () => {
    expect(safePathSegment('_25')).not.toBe(safePathSegment('%'));
    expect(safePathSegment('lessons/lesson-1/audio.mp3')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('round-trips nested Timestamp, GeoPoint, and DocumentReference values in arrays', () => {
    const value = {
      nested: {
        timestamp: new Timestamp(1_700_000_000, 123_456_789),
        point: new GeoPoint(41.0082, 28.9784),
        reference: new DocumentReference('lessons/lesson-1'),
      },
      values: [
        new Timestamp(1_700_000_001, 987_654_321),
        { point: new GeoPoint(37.9838, 23.7275) },
        [new DocumentReference('vocabulary_pools/pool-1')],
      ],
    };
    const encoded = encodeFirestoreValue(value);
    const db = { doc: (path: string) => new DocumentReference(path) };
    type RoundTripValue = {
      nested: { timestamp: Timestamp; point: GeoPoint; reference: DocumentReference };
      values: [Timestamp, { point: GeoPoint }, DocumentReference[]];
    };
    const decoded = decodeFirestoreValue(encoded, db, { Timestamp, GeoPoint }) as RoundTripValue;
    expect(decoded.nested.timestamp).toBeInstanceOf(Timestamp);
    expect(decoded.nested.timestamp).toMatchObject({ seconds: 1_700_000_000, nanoseconds: 123_456_789 });
    expect(decoded.nested.point).toBeInstanceOf(GeoPoint);
    expect(decoded.nested.reference).toMatchObject({ path: 'lessons/lesson-1' });
    expect(decoded.values[0]).toBeInstanceOf(Timestamp);
    expect(decoded.values[1].point).toBeInstanceOf(GeoPoint);
    expect(decoded.values[2][0]).toMatchObject({ path: 'vocabulary_pools/pool-1' });
  });
});
