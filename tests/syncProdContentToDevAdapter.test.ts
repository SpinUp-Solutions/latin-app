import {
  executeFirestoreOperations,
  assertFirestoreBeforeImageIntegrity,
  assertStorageBeforeImageIntegrity,
  executeStorageOperations,
  executeStorageRollbackOperations,
  ensureBackupBucket,
  listBucketObjects,
  rollbackPlan,
} from '../scripts/sync-prod-content-to-dev.mjs';
import {
  BACKUP_BUCKET,
  SOURCE_PROJECT_ID,
  SOURCE_STORAGE_BUCKET,
  TARGET_PROJECT_ID,
  TARGET_STORAGE_BUCKET,
  assertStorageScope,
  byteHash,
  buildExcludedFingerprint,
  buildManifest,
  dataHash,
  normalizeStorageRecord,
  safePathSegment,
  sha256,
} from '../scripts/sync-prod-content-to-dev-core.mjs';

type FakeDocument = { data: Record<string, unknown>; updateTime: string };
type FakeReference = { path: string; collection: string; id: string };
type FakeMutation = { action: 'create' | 'update' | 'delete'; ref: FakeReference; data?: Record<string, unknown> };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class FakeTransaction {
  readonly writes: FakeMutation[] = [];

  constructor(private readonly db: FakeFirestore) {}

  async getAll(...refs: FakeReference[]) {
    return refs.map(ref => {
      const current = this.db.documents.get(ref.path);
      return { exists: Boolean(current), updateTime: current?.updateTime };
    });
  }

  create(ref: FakeReference, data: Record<string, unknown>) {
    this.writes.push({ action: 'create', ref, data });
    return this;
  }

  set(ref: FakeReference, data: Record<string, unknown>) {
    this.writes.push({ action: 'update', ref, data });
    return this;
  }

  delete(ref: FakeReference) {
    this.writes.push({ action: 'delete', ref });
    return this;
  }

  commit() {
    for (const [index, write] of this.writes.entries()) {
      const current = this.db.documents.get(write.ref.path);
      if (write.action === 'create' && current) throw new Error('create precondition failed');
      if (write.action !== 'create' && !current) throw new Error('existing-document precondition failed');
      if (write.action === 'delete') this.db.documents.delete(write.ref.path);
      else {
        if (!write.data) throw new Error('missing write data');
        this.db.documents.set(write.ref.path, { data: clone(write.data), updateTime: `write-${this.db.transactionCalls}-${index}` });
      }
    }
  }
}

class FakeFirestore {
  readonly documents = new Map<string, FakeDocument>();
  readonly projectId: string;
  readonly databaseId = '(default)';
  transactionCalls = 0;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  collection(collection: string) {
    return {
      doc: (id: string): FakeReference => ({ collection, id, path: `${collection}/${id}` }),
    };
  }

  async runTransaction(callback: (transaction: FakeTransaction) => Promise<void>) {
    this.transactionCalls += 1;
    const transaction = new FakeTransaction(this);
    await callback(transaction);
    transaction.commit();
  }
}

type FakeObject = { bytes: Buffer; generation: string; metageneration: string; metadata: Record<string, unknown> };

class FakeBucket {
  readonly storage: { projectId: string };
  readonly objects = new Map<string, FakeObject>();
  readonly fileCalls: Array<{ name: string; options?: { generation?: string } }> = [];
  readonly downloadCalls: Array<{ name: string; options?: { validation?: string } }> = [];
  readonly saveCalls: Array<{ name: string; options: { preconditionOpts?: Record<string, string | number> } }> = [];
  readonly deleteCalls: Array<{ name: string; options: { preconditionOpts?: Record<string, string | number> } }> = [];
  readonly name: string;

  constructor(name: string, projectId: string) {
    this.name = name;
    this.storage = { projectId };
  }

  file(name: string, options?: { generation?: string }) {
    this.fileCalls.push({ name, options });
    const selectedGeneration = options?.generation;
    return {
      download: async (downloadOptions?: { validation?: string }) => {
        this.downloadCalls.push({ name, options: downloadOptions });
        const object = this.objects.get(name);
        if (!object) throw new Error(`missing object ${name}`);
        if (selectedGeneration !== undefined && object.generation !== selectedGeneration) throw new Error('source generation drift');
        return [Buffer.from(object.bytes)] as [Buffer];
      },
      save: async (bytes: Buffer, saveOptions: { preconditionOpts?: Record<string, string | number>; metadata?: Record<string, unknown> }) => {
        const current = this.objects.get(name);
        const precondition = saveOptions.preconditionOpts ?? {};
        if (precondition.ifGenerationMatch === 0 && current) throw new Error('create generation precondition failed');
        if (precondition.ifGenerationMatch !== undefined && precondition.ifGenerationMatch !== 0 && String(precondition.ifGenerationMatch) !== current?.generation) throw new Error('generation precondition failed');
        if (precondition.ifMetagenerationMatch !== undefined && String(precondition.ifMetagenerationMatch) !== current?.metageneration) throw new Error('metageneration precondition failed');
        this.saveCalls.push({ name, options: saveOptions });
        this.objects.set(name, {
          bytes: Buffer.from(bytes),
          generation: current ? `${Number(current.generation) + 1}` : '1',
          metageneration: current ? `${Number(current.metageneration) + 1}` : '1',
          metadata: (saveOptions.metadata?.metadata as Record<string, unknown> | undefined) ?? {},
        });
      },
      delete: async (deleteOptions: { preconditionOpts?: Record<string, string | number> }) => {
        const current = this.objects.get(name);
        const precondition = deleteOptions.preconditionOpts ?? {};
        if (!current || String(precondition.ifGenerationMatch) !== current.generation || String(precondition.ifMetagenerationMatch) !== current.metageneration) throw new Error('delete precondition failed');
        this.deleteCalls.push({ name, options: deleteOptions });
        this.objects.delete(name);
      },
    };
  }
}

function storageRecord(name: string, generation: string, metageneration: string) {
  return normalizeStorageRecord({ name, generation, metageneration, size: '3', md5Hash: 'hash', crc32c: null, contentType: 'audio/mpeg', metadata: {} });
}

function lessonRecord(id: string, title: string, updateTime: string) {
  return {
    id,
    data: {
      id,
      kind: 'lesson',
      title,
      description: 'rollback test',
      type: 'normal',
      pages: [{ id: `${id}-page`, items: [{ id: `${id}-item`, type: 'text' }] }],
    },
    createTime: '2026-08-03T10:00:00.000Z',
    updateTime,
  };
}

function rollbackFixture() {
  const oldUpdate = storageRecord('lessons/original-update/audio.mp3', '5', '1');
  const oldDelete = storageRecord('lessons/original-delete/audio.mp3', '6', '1');
  const target = {
    projectId: TARGET_PROJECT_ID,
    storageBucket: TARGET_STORAGE_BUCKET,
    database: '(default)',
    capturedAt: '2026-08-03T10:00:00.000Z',
    collections: {
      lessons: [lessonRecord('original-create', 'created by sync', 'post-create'), lessonRecord('original-update', 'updated by sync', 'post-update')],
      learningPaths: [],
      vocabulary_pools: [],
      vocabulary_words_v5: [],
    },
    excludedCollections: {},
    storage: [storageRecord('lessons/original-create/audio.mp3', '10', '1'), storageRecord('lessons/original-update/audio.mp3', '11', '1')],
    excludedStorage: [],
    authFingerprint: { count: 0, hash: sha256('auth') },
  };
  const runManifest = {
    runId: 'rollback-test',
    status: 'applied',
    target: {
      postSyncManifestHash: buildManifest(target).manifestHash,
      preSyncExcludedFingerprint: buildExcludedFingerprint(target),
      preSyncAuthFingerprint: target.authFingerprint,
    },
    beforeImages: {
      firestoreEntries: [
        { collection: 'lessons', id: 'original-create', path: 'lessons/original-create', exists: false, backupPath: null },
        { collection: 'lessons', id: 'original-update', path: 'lessons/original-update', exists: true, backupPath: 'runs/rollback/before/firestore/original-update.json' },
        { collection: 'lessons', id: 'original-delete', path: 'lessons/original-delete', exists: true, backupPath: 'runs/rollback/before/firestore/original-delete.json' },
      ],
      storageEntries: [
        { name: 'lessons/original-create/audio.mp3', exists: false, backupPath: null },
        { name: 'lessons/original-update/audio.mp3', exists: true, backupPath: 'runs/rollback/before/storage/original-update.bin', hash: oldUpdate.hash, contentHash: oldUpdate.contentHash, bytesHash: byteHash(Buffer.from('old-update')) },
        { name: 'lessons/original-delete/audio.mp3', exists: true, backupPath: 'runs/rollback/before/storage/original-delete.bin', hash: oldDelete.hash, contentHash: oldDelete.contentHash, bytesHash: byteHash(Buffer.from('old-delete')) },
      ],
    },
  };
  return { target, runManifest };
}

describe('production content sync adapter safety', () => {
  it('uses full transactional replacement and rejects update-time drift', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    db.documents.set('lessons/lesson-1', { data: { id: 'lesson-1', stale: 'remove', keep: 'old' }, updateTime: 't1' });
    const target = { projectId: TARGET_PROJECT_ID, db };
    await executeFirestoreOperations(target, [{ collection: 'lessons', id: 'lesson-1', action: 'update', source: { data: { id: 'lesson-1', keep: 'new' } }, target: { updateTime: 't1' } }]);
    expect(db.documents.get('lessons/lesson-1')?.data).toEqual({ id: 'lesson-1', keep: 'new' });

    db.documents.set('lessons/lesson-1', { data: { id: 'lesson-1', keep: 'drifted' }, updateTime: 't2' });
    await expect(executeFirestoreOperations(target, [{ collection: 'lessons', id: 'lesson-1', action: 'update', source: { data: { id: 'lesson-1', keep: 'new' } }, target: { updateTime: 't1' } }])).rejects.toThrow(/changed after planning/);
    expect(db.documents.get('lessons/lesson-1')?.data.keep).toBe('drifted');
  });

  it('pins the captured source generation and rejects metadata-only target drift', async () => {
    const sourceBucket = new FakeBucket(SOURCE_STORAGE_BUCKET, SOURCE_PROJECT_ID);
    const targetBucket = new FakeBucket(TARGET_STORAGE_BUCKET, TARGET_PROJECT_ID);
    sourceBucket.objects.set('lessons/lesson-1/audio.mp3', { bytes: Buffer.from('audio'), generation: 'source-new', metageneration: '1', metadata: {} });
    const operation = { name: 'lessons/lesson-1/audio.mp3', action: 'create', source: { ...storageRecord('lessons/lesson-1/audio.mp3', 'source-old', '1') }, target: null };
    await expect(executeStorageOperations({ projectId: SOURCE_PROJECT_ID, bucket: sourceBucket }, { projectId: TARGET_PROJECT_ID, bucket: targetBucket }, [operation])).rejects.toThrow(/generation drift/);
    expect(targetBucket.saveCalls).toHaveLength(0);
    expect(sourceBucket.fileCalls[0]).toMatchObject({ name: operation.name, options: { generation: 'source-old' } });

    sourceBucket.objects.set(operation.name, { bytes: Buffer.from('audio'), generation: 'source-old', metageneration: '1', metadata: {} });
    targetBucket.objects.set(operation.name, { bytes: Buffer.from('old'), generation: '9', metageneration: '2', metadata: {} });
    const update = { ...operation, action: 'update', target: storageRecord(operation.name, '9', '1') };
    await expect(executeStorageOperations({ projectId: SOURCE_PROJECT_ID, bucket: sourceBucket }, { projectId: TARGET_PROJECT_ID, bucket: targetBucket }, [update])).rejects.toThrow(/metageneration precondition/);
  });

  it('filters only the exact zero-byte folder marker during bucket capture', async () => {
    const listed = (metadata: Record<string, unknown>) => ({
      name: metadata.name,
      getMetadata: async () => [metadata],
    });
    const bucket = {
      getFiles: async () => [[
        listed({ name: 'lessons/', size: '0', generation: '1', metageneration: '1', md5Hash: null, crc32c: null, contentType: null, metadata: {} }),
        listed({ name: 'lessons/', size: '1', generation: '2', metageneration: '1', md5Hash: 'marker-md5', crc32c: null, contentType: null, metadata: {} }),
        listed({ name: 'lessons/', generation: '3', metageneration: '1', md5Hash: null, crc32c: null, contentType: null, metadata: {} }),
        listed({ name: 'lessons', size: '0', generation: '1', metageneration: '1', md5Hash: 'root-md5', crc32c: null, contentType: null, metadata: {} }),
        listed({ name: 'other/lessons/audio.mp3', size: '1', generation: '1', metageneration: '1', md5Hash: 'other-md5', crc32c: null, contentType: 'audio/mpeg', metadata: {} }),
      ]],
    };
    const records = await listBucketObjects(bucket);
    expect(records.map(record => record.name)).toEqual(['lessons', 'lessons/', 'lessons/', 'other/lessons/audio.mp3']);
    expect(records.filter(record => record.name === 'lessons/')).toHaveLength(2);
    expect(() => assertStorageScope(records, 'captured')).toThrow(/outside lessons/);
  });

  it('rejects source-labeled or swapped handles before SDK mutation methods', async () => {
    const sourceDb = new FakeFirestore(SOURCE_PROJECT_ID);
    const targetDb = new FakeFirestore(TARGET_PROJECT_ID);
    const sourceBucket = new FakeBucket(SOURCE_STORAGE_BUCKET, SOURCE_PROJECT_ID);
    const targetBucket = new FakeBucket(TARGET_STORAGE_BUCKET, TARGET_PROJECT_ID);
    await expect(executeFirestoreOperations({ projectId: SOURCE_PROJECT_ID, db: sourceDb }, [])).rejects.toThrow(/read-only/);
    await expect(executeFirestoreOperations({ projectId: TARGET_PROJECT_ID, db: sourceDb }, [])).rejects.toThrow(/expected/);
    await expect(executeFirestoreOperations({ projectId: TARGET_PROJECT_ID, db: targetDb }, [])).resolves.toBeUndefined();
    await expect(executeStorageOperations({ projectId: SOURCE_PROJECT_ID, bucket: sourceBucket }, { projectId: TARGET_PROJECT_ID, bucket: sourceBucket }, [])).rejects.toThrow(/expected/);
    await expect(ensureBackupBucket({ projectId: SOURCE_PROJECT_ID, storage: { bucket: () => { throw new Error('must not call SDK'); } } }, { allowProvision: true })).rejects.toThrow(/read-only/);
    await expect(executeStorageRollbackOperations({ projectId: SOURCE_PROJECT_ID, bucket: sourceBucket }, targetBucket, [], new Map())).rejects.toThrow(/read-only/);
    await expect(executeStorageRollbackOperations({ projectId: TARGET_PROJECT_ID, bucket: targetBucket }, sourceBucket, [], new Map())).rejects.toThrow(/bucket/);
  });

  it('maps rollback of original creates, updates, and deletes for Firestore and Storage', () => {
    const { target, runManifest } = rollbackFixture();
    const plan = rollbackPlan(runManifest, target);
    const firestoreOperations = plan.firestore.operations as Array<{ id: string; action: string }>;
    const storageOperations = plan.storage.operations as Array<{ name: string; action: string }>;
    expect(firestoreOperations.map(operation => operation.action)).toEqual(['delete', 'restore', 'create']);
    expect(storageOperations.map(operation => operation.action)).toEqual(['delete', 'restore', 'create']);
  });

  it('executes rollback creates with the same transactional and generation guards', async () => {
    const { target, runManifest } = rollbackFixture();
    const plan = rollbackPlan(runManifest, target);
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    db.documents.set('lessons/original-create', { data: target.collections.lessons[0].data, updateTime: 'post-create' });
    db.documents.set('lessons/original-update', { data: target.collections.lessons[1].data, updateTime: 'post-update' });
    await executeFirestoreOperations({ projectId: TARGET_PROJECT_ID, db }, [
      { collection: 'lessons', id: 'original-create', action: 'delete', target: { updateTime: 'post-create' } },
      { collection: 'lessons', id: 'original-update', action: 'update', source: { data: lessonRecord('original-update', 'before update', 'before').data }, target: { updateTime: 'post-update' } },
      { collection: 'lessons', id: 'original-delete', action: 'create', source: { data: lessonRecord('original-delete', 'before delete', 'before').data }, target: null },
    ]);
    expect(db.documents.has('lessons/original-create')).toBe(false);
    expect(db.documents.get('lessons/original-update')?.data.title).toBe('before update');
    expect(db.documents.get('lessons/original-delete')?.data.title).toBe('before delete');
    const firestoreOperations = plan.firestore.operations as Array<{ id: string; action: string }>;
    expect(firestoreOperations.find(operation => operation.id === 'original-delete')?.action).toBe('create');
  });

  it('restores storage create, update, and delete cases with generation and metageneration preconditions', async () => {
    const { target, runManifest } = rollbackFixture();
    const plan = rollbackPlan(runManifest, target);
    const targetBucket = new FakeBucket(TARGET_STORAGE_BUCKET, TARGET_PROJECT_ID);
    targetBucket.objects.set('lessons/original-create/audio.mp3', { bytes: Buffer.from('new-create'), generation: '10', metageneration: '1', metadata: {} });
    targetBucket.objects.set('lessons/original-update/audio.mp3', { bytes: Buffer.from('new-update'), generation: '11', metageneration: '1', metadata: {} });
    const backupBucket = new FakeBucket(BACKUP_BUCKET, TARGET_PROJECT_ID);
    const oldUpdate = storageRecord('lessons/original-update/audio.mp3', '5', '1');
    const oldDelete = storageRecord('lessons/original-delete/audio.mp3', '6', '1');
    const backupEntries: Array<[string, ReturnType<typeof storageRecord>, string]> = [
      ['original-update', oldUpdate, 'old-update'],
      ['original-delete', oldDelete, 'old-delete'],
    ];
    for (const [base, record, bytes] of backupEntries) {
      const prefix = `runs/rollback/before/storage/${base}`;
      backupBucket.objects.set(`${prefix}.bin`, { bytes: Buffer.from(bytes), generation: '1', metageneration: '1', metadata: {} });
      backupBucket.objects.set(`${prefix}.json`, { bytes: Buffer.from(JSON.stringify(record)), generation: '1', metageneration: '1', metadata: {} });
    }
    await executeStorageRollbackOperations(
      { projectId: TARGET_PROJECT_ID, bucket: targetBucket },
      backupBucket,
      plan.storage.operations,
      new Map(target.storage.map(record => [record.name, record]))
    );
    expect(targetBucket.objects.has('lessons/original-create/audio.mp3')).toBe(false);
    expect(targetBucket.objects.get('lessons/original-update/audio.mp3')?.bytes.toString()).toBe('old-update');
    expect(targetBucket.objects.get('lessons/original-delete/audio.mp3')?.bytes.toString()).toBe('old-delete');
    expect(targetBucket.saveCalls.map(call => call.options.preconditionOpts)).toEqual([
      { ifGenerationMatch: '11', ifMetagenerationMatch: '1' },
      { ifGenerationMatch: 0 },
    ]);
    expect(targetBucket.deleteCalls[0].options.preconditionOpts).toEqual({ ifGenerationMatch: '10', ifMetagenerationMatch: '1' });
  });

  it('rejects corrupt before-images before restoring Firestore or Storage', async () => {
    const oldDocument = { id: 'lesson-1', title: 'before' };
    expect(() => assertFirestoreBeforeImageIntegrity({ exists: true, path: 'lessons/lesson-1', dataHash: dataHash(oldDocument) }, { ...oldDocument, title: 'corrupt' })).toThrow(/integrity/);

    const metadata = storageRecord('lessons/lesson-1/audio.mp3', '5', '1');
    const expectedBytes = Buffer.from('original-audio');
    const storageEntry = {
      exists: true,
      name: metadata.name,
      hash: metadata.hash,
      contentHash: metadata.contentHash,
      bytesHash: byteHash(expectedBytes),
    };
    expect(() => assertStorageBeforeImageIntegrity(storageEntry, metadata, Buffer.from('corrupt-audio'))).toThrow(/integrity/);
    expect(() => assertStorageBeforeImageIntegrity(storageEntry, { ...metadata, metadata: { altered: true } }, expectedBytes)).toThrow(/integrity/);

    const targetBucket = new FakeBucket(TARGET_STORAGE_BUCKET, TARGET_PROJECT_ID);
    targetBucket.objects.set(metadata.name, { bytes: Buffer.from('new-audio'), generation: '10', metageneration: '1', metadata: {} });
    const backupBucket = new FakeBucket(BACKUP_BUCKET, TARGET_PROJECT_ID);
    const prefix = `runs/corrupt/before/storage/${safePathSegment(metadata.name)}`;
    backupBucket.objects.set(`${prefix}.bin`, { bytes: Buffer.from('corrupt-audio'), generation: '1', metageneration: '1', metadata: {} });
    backupBucket.objects.set(`${prefix}.json`, { bytes: Buffer.from(JSON.stringify(metadata)), generation: '1', metageneration: '1', metadata: {} });
    await expect(executeStorageRollbackOperations(
      { projectId: TARGET_PROJECT_ID, bucket: targetBucket },
      backupBucket,
      [{ action: 'restore', name: metadata.name, backupPath: `${prefix}.bin`, exists: true, hash: metadata.hash, contentHash: metadata.contentHash, bytesHash: byteHash(expectedBytes) }],
      new Map([[metadata.name, { ...metadata, generation: '10', metageneration: '1' }]]),
    )).rejects.toThrow(/integrity/);
    expect(targetBucket.saveCalls).toHaveLength(0);
    expect(targetBucket.objects.get(metadata.name)?.bytes.toString()).toBe('new-audio');
  });
});
