import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  executeFirestoreOperations,
  emitApplyRecoveryAuthority,
  finalizeApplyLock,
  advanceVocabularyContentRevision,
  assertLockedTargetMatchesPlan,
  assertRollbackProtectedDependenciesPreserved,
  assertNoVocabularyPoolTombstoneCollisions,
  acquireContentSyncLock,
  claimContentSyncRecoveryLock,
  releaseContentSyncRecoveryAttempt,
  releaseContentSyncLock,
  assertFirestoreBeforeImageIntegrity,
  assertStorageBeforeImageIntegrity,
  executeStorageOperations,
  executeStorageRollbackOperations,
  ensureBackupBucket,
  listBucketObjects,
  markContentSyncLockManifestDurable,
  rollbackPlan,
  publishAppliedRun,
  runManifestForBackup,
  upgradeStorageRecoveryContentHashes,
  withoutContentSyncOperationalState,
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
  createPlan,
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
      return { exists: Boolean(current), updateTime: current?.updateTime, data: () => clone(current?.data ?? {}) };
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
        this.db.documents.set(write.ref.path, {
          data: clone(write.data),
          updateTime: `write-${this.db.transactionCalls}-${index}`,
        });
      }
    }
  }
}

class FakeFirestore {
  readonly documents = new Map<string, FakeDocument>();
  readonly projectId: string;
  readonly databaseId = '(default)';
  transactionCalls = 0;
  failAfterCommitOnce = false;

  constructor(
    projectId: string,
    private readonly maxWritesPerTransaction?: number
  ) {
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
    if (this.maxWritesPerTransaction !== undefined && transaction.writes.length > this.maxWritesPerTransaction) {
      throw Object.assign(new Error('3 INVALID_ARGUMENT: Transaction too big. Decrease transaction size.'), {
        code: 3,
      });
    }
    transaction.commit();
    if (this.failAfterCommitOnce) {
      this.failAfterCommitOnce = false;
      throw new Error('commit response was lost');
    }
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
        if (selectedGeneration !== undefined && object.generation !== selectedGeneration)
          throw new Error('source generation drift');
        return [Buffer.from(object.bytes)] as [Buffer];
      },
      save: async (
        bytes: Buffer,
        saveOptions: { preconditionOpts?: Record<string, string | number>; metadata?: Record<string, unknown> }
      ) => {
        const current = this.objects.get(name);
        const precondition = saveOptions.preconditionOpts ?? {};
        if (precondition.ifGenerationMatch === 0 && current) throw new Error('create generation precondition failed');
        if (
          precondition.ifGenerationMatch !== undefined &&
          precondition.ifGenerationMatch !== 0 &&
          String(precondition.ifGenerationMatch) !== current?.generation
        )
          throw new Error('generation precondition failed');
        if (
          precondition.ifMetagenerationMatch !== undefined &&
          String(precondition.ifMetagenerationMatch) !== current?.metageneration
        )
          throw new Error('metageneration precondition failed');
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
        if (
          !current ||
          String(precondition.ifGenerationMatch) !== current.generation ||
          String(precondition.ifMetagenerationMatch) !== current.metageneration
        )
          throw new Error('delete precondition failed');
        this.deleteCalls.push({ name, options: deleteOptions });
        this.objects.delete(name);
      },
    };
  }
}

function storageRecord(name: string, generation: string, metageneration: string) {
  return normalizeStorageRecord({
    name,
    generation,
    metageneration,
    size: '3',
    md5Hash: 'hash',
    crc32c: null,
    contentType: 'audio/mpeg',
    metadata: {},
  });
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
      lessons: [
        lessonRecord('original-create', 'created by sync', 'post-create'),
        lessonRecord('original-update', 'updated by sync', 'post-update'),
      ],
      learningPaths: [],
      vocabulary_pools: [],
      vocabulary_words_v5: [],
    },
    excludedCollections: {},
    storage: [
      storageRecord('lessons/original-create/audio.mp3', '10', '1'),
      storageRecord('lessons/original-update/audio.mp3', '11', '1'),
    ],
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
        {
          collection: 'lessons',
          id: 'original-create',
          path: 'lessons/original-create',
          exists: false,
          backupPath: null,
        },
        {
          collection: 'lessons',
          id: 'original-update',
          path: 'lessons/original-update',
          exists: true,
          backupPath: 'runs/rollback/before/firestore/original-update.json',
        },
        {
          collection: 'lessons',
          id: 'original-delete',
          path: 'lessons/original-delete',
          exists: true,
          backupPath: 'runs/rollback/before/firestore/original-delete.json',
        },
      ],
      storageEntries: [
        { name: 'lessons/original-create/audio.mp3', exists: false, backupPath: null },
        {
          name: 'lessons/original-update/audio.mp3',
          exists: true,
          backupPath: 'runs/rollback/before/storage/original-update.bin',
          hash: oldUpdate.hash,
          contentHash: oldUpdate.contentHash,
          bytesHash: byteHash(Buffer.from('old-update')),
        },
        {
          name: 'lessons/original-delete/audio.mp3',
          exists: true,
          backupPath: 'runs/rollback/before/storage/original-delete.bin',
          hash: oldDelete.hash,
          contentHash: oldDelete.contentHash,
          bytesHash: byteHash(Buffer.from('old-delete')),
        },
      ],
    },
  };
  return { target, runManifest };
}

describe('production content sync adapter safety', () => {
  it('holds an exclusive target lock across the mutating sync phases', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    const target = { projectId: TARGET_PROJECT_ID, db };

    await acquireContentSyncLock(target, 'owner-1');
    expect(db.documents.has('content_sync_locks/prod-content-to-dev')).toBe(true);
    await expect(acquireContentSyncLock(target, 'owner-2')).rejects.toMatchObject({ code: 'SYNC_ALREADY_RUNNING' });
    await releaseContentSyncLock(target, 'owner-1');
    expect(db.documents.has('content_sync_locks/prod-content-to-dev')).toBe(false);
  });

  it('invalidates pre-maintenance deletion challenges before releasing the sync lock', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    db.documents.set('vocabulary_content_state/global', { data: { revision: 7 }, updateTime: 't1' });
    const target = { projectId: TARGET_PROJECT_ID, db };
    const challengeRevision = 7;

    await acquireContentSyncLock(target, 'owner-1');
    expect(db.documents.has('content_sync_locks/prod-content-to-dev')).toBe(true);
    await advanceVocabularyContentRevision(target, 'sync:run-1');
    await advanceVocabularyContentRevision(target, 'sync:run-1');
    expect(db.documents.get('vocabulary_content_state/global')?.data.revision).toBe(8);
    expect(db.documents.get('vocabulary_content_state/global')?.data.revision).not.toBe(challengeRevision);
    await releaseContentSyncLock(target, 'owner-1');
    expect(db.documents.has('content_sync_locks/prod-content-to-dev')).toBe(false);
  });

  it('uses a distinct rollback revision epoch while deletion remains locked', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    const target = { projectId: TARGET_PROJECT_ID, db };

    await acquireContentSyncLock(target, 'owner-1');
    await advanceVocabularyContentRevision(target, 'rollback:run-1');
    expect(db.documents.has('content_sync_locks/prod-content-to-dev')).toBe(true);
    expect(db.documents.get('vocabulary_content_state/global')?.data).toMatchObject({
      revision: 1,
      lastMaintenanceOperationId: 'rollback:run-1',
    });
    await releaseContentSyncLock(target, 'owner-1');
  });

  it('advances the revision again for a later retry of the same rollback run', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    const target = { projectId: TARGET_PROJECT_ID, db };

    await advanceVocabularyContentRevision(target, 'rollback:run-1:attempt-1');
    const challengeRevision = db.documents.get('vocabulary_content_state/global')?.data.revision;
    await advanceVocabularyContentRevision(target, 'rollback:run-1:attempt-2');

    expect(challengeRevision).toBe(1);
    expect(db.documents.get('vocabulary_content_state/global')?.data.revision).toBe(2);
  });

  it('excludes tool-owned lock and revision documents from apply, verify, and rollback fingerprints', () => {
    const base = rollbackFixture().target;
    const withOperationalState = {
      ...base,
      excludedCollections: {
        content_sync_locks: [{ id: 'prod-content-to-dev', data: { ownerId: 'owner-1' } }],
        vocabulary_content_state: [{ id: 'global', data: { revision: 9 } }],
      },
    };
    const normalized = withoutContentSyncOperationalState(withOperationalState);

    expect(buildExcludedFingerprint(normalized)).toBe(buildExcludedFingerprint(base));
    expect(buildManifest(normalized).manifestHash).toBe(buildManifest(base).manifestHash);
  });

  it('checks mirrored authoring under the apply lock while treating progress and Auth drift as observational', () => {
    const { target } = rollbackFixture();
    const plan = { targetState: target };
    expect(() =>
      assertLockedTargetMatchesPlan(plan, {
        ...target,
        excludedCollections: {
          ...target.excludedCollections,
          userProgress: [{ id: 'progress-1', data: { completed: true } }],
        },
        authFingerprint: { count: 1, hash: 'new-login' },
      })
    ).not.toThrow();
    expect(() =>
      assertLockedTargetMatchesPlan(plan, {
        ...target,
        collections: {
          ...target.collections,
          lessons: [lessonRecord('lesson-1', 'concurrent-authoring-edit', 'new-time')],
        },
      })
    ).toThrow(/mirrored content changed/i);
  });

  it('rejects a protected fixture assignment created between apply capture and lock acquisition', () => {
    const source = {
      projectId: SOURCE_PROJECT_ID,
      storageBucket: SOURCE_STORAGE_BUCKET,
      database: '(default)',
      capturedAt: '2026-08-03T10:00:00.000Z',
      collections: { lessons: [], learningPaths: [], vocabulary_pools: [], vocabulary_words_v5: [] },
      excludedCollections: {},
      storage: [],
      excludedStorage: [],
      authFingerprint: { count: 0, hash: sha256('auth') },
    };
    const poolRecord = {
      id: 'pool-about-to-be-deleted',
      data: { id: 'pool-about-to-be-deleted', name: 'Dev pool', wordDocIds: [], _assignmentRevision: 1 },
      createTime: '2026-08-03T10:00:00.000Z',
      updateTime: '2026-08-03T10:00:00.000Z',
    };
    const target = {
      ...rollbackFixture().target,
      collections: {
        lessons: [],
        learningPaths: [],
        vocabulary_pools: [poolRecord],
        vocabulary_words_v5: [],
      },
      excludedCollections: { testVersions: [], testVersionDrafts: [], practiceCategoryMemberships: [] },
      storage: [],
    };
    const plan = createPlan(source, target);
    const lockedTarget = {
      ...clone(target),
      collections: {
        ...clone(target).collections,
        vocabulary_pools: [{ ...poolRecord, data: { ...poolRecord.data, _assignmentRevision: 2 } }],
      },
      excludedCollections: {
        ...clone(target).excludedCollections,
        testVersions: [
          {
            id: 'new-version',
            data: { id: 'new-version', vocabularyPoolId: 'pool-about-to-be-deleted', pages: [] },
            createTime: '2026-08-03T10:00:01.000Z',
            updateTime: '2026-08-03T10:00:01.000Z',
          },
        ],
      },
    };

    expect(() => assertLockedTargetMatchesPlan(plan, lockedTarget)).toThrow(/fixture dependencies changed/i);
  });

  it('refuses to apply while a bounded word cleanup is pending', () => {
    const { target } = rollbackFixture();
    const lockedTarget = {
      ...clone(target),
      collections: {
        ...clone(target).collections,
        vocabulary_words_v5: [
          {
            id: 'word-1',
            data: { id: 'word-1', word: 'amo', _deletionPending: { actorUid: 'admin-1', tokenHash: 'hash' } },
            createTime: '2026-08-03T10:00:00.000Z',
            updateTime: '2026-08-03T10:00:01.000Z',
          },
        ],
      },
    };
    expect(() => assertLockedTargetMatchesPlan({ targetState: target }, lockedTarget)).toThrow(
      /still being removed from vocabulary pools/i
    );
  });

  it.each([
    {
      label: 'pool required by a test version',
      target: {
        collections: {
          vocabulary_pools: [
            {
              id: 'pool-created',
              data: { id: 'pool-created', wordDocIds: ['word-created'] },
            },
          ],
        },
        excludedCollections: {
          testVersions: [{ id: 'version-1', data: { vocabularyPoolId: 'pool-created', pages: [] } }],
        },
      },
      operations: [{ collection: 'vocabulary_pools', id: 'pool-created', action: 'delete' }],
    },
    {
      label: 'word required directly by a test draft',
      target: {
        collections: { vocabulary_pools: [] },
        excludedCollections: {
          testVersionDrafts: [{ id: 'draft-1', data: { pages: [{ items: [{ wordId: 'word-created' }] }] } }],
        },
      },
      operations: [{ collection: 'vocabulary_words_v5', id: 'word-created', action: 'delete' }],
    },
    {
      label: 'lesson required by a practice-category membership',
      target: {
        collections: {},
        excludedCollections: {
          practiceCategoryMemberships: [{ id: 'membership-1', data: { lessonId: 'lesson-created' } }],
        },
      },
      operations: [{ collection: 'lessons', id: 'lesson-created', action: 'delete' }],
    },
  ])('rejects rollback before writes when it would change a $label', ({ target, operations }) => {
    expect(() => assertRollbackProtectedDependenciesPreserved(target, operations)).toThrow(/current protected dev/i);
  });

  it('rejects rollback of Storage used by a newly protected lesson', () => {
    const target = {
      collections: {
        lessons: [{ id: 'lesson-created', data: { id: 'lesson-created', kind: 'lesson' } }],
      },
      excludedCollections: {
        practiceCategoryMemberships: [{ id: 'membership-1', data: { lessonId: 'lesson-created' } }],
      },
    };
    const storageOperations = [
      { kind: 'storage', name: 'lessons/lesson-created/audio.mp3', action: 'restore' },
    ];

    expect(() => assertRollbackProtectedDependenciesPreserved(target, [], storageOperations)).toThrow(
      /current protected dev lesson data/i
    );
  });

  it('keeps only the rollback token hash in the private run manifest', () => {
    const { target } = rollbackFixture();
    const plan = {
      sourceManifest: { manifestHash: 'source-manifest' },
      sourceContentFingerprint: 'source-content',
      targetManifest: { manifestHash: 'target-manifest' },
      targetContentFingerprint: 'target-content',
      targetState: target,
      projectedState: target,
      planHash: 'plan-hash',
      audit: { fixtureClosure: {} },
    };

    const manifest = runManifestForBackup(plan, 'run-1', { firestoreEntries: [], storageEntries: [] }, 'secret');

    expect(manifest.status).toBe('backed-up');
    expect(manifest).not.toHaveProperty('rollbackTokenRecovery');
    expect(manifest.rollbackTokenHash).toBe(sha256('secret'));
  });

  it('emits rollback authority after the durable manifest and before the first mutation', () => {
    const writes: string[] = [];
    emitApplyRecoveryAuthority({ runId: 'run-1', rollbackToken: 'one-time-secret' }, value => {
      writes.push(value);
    });
    expect(JSON.parse(writes.join(''))).toMatchObject({
      event: 'sync-rollback-authority',
      runId: 'run-1',
      rollbackToken: 'one-time-secret',
    });

    const source = readFileSync(join(process.cwd(), 'scripts/sync-prod-content-to-dev.mjs'), 'utf8');
    const applyBody = source.slice(
      source.indexOf('export async function applyPlan'),
      source.indexOf('function targetManifestCheck')
    );
    const durableManifest = applyBody.indexOf('await updateRunManifest(backupBucket, runManifest)');
    const authority = applyBody.indexOf('emitApplyRecoveryAuthority', durableManifest);
    const armedLock = applyBody.indexOf('await markContentSyncLockManifestDurable', authority);
    const mutation = applyBody.indexOf('mutationStarted = true', armedLock);
    expect(durableManifest).toBeGreaterThan(-1);
    expect(authority).toBeGreaterThan(durableManifest);
    expect(armedLock).toBeGreaterThan(authority);
    expect(mutation).toBeGreaterThan(armedLock);
  });

  it('reclaims only an expired primary lock that was never armed for mutation', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    const target = { projectId: TARGET_PROJECT_ID, db };
    await acquireContentSyncLock(target, 'owner-1', { runId: 'run-1', now: 1_000, leaseMs: 100 });
    await expect(
      acquireContentSyncLock(target, 'owner-2', { runId: 'run-2', now: 1_099, leaseMs: 100 })
    ).rejects.toMatchObject({ code: 'SYNC_ALREADY_RUNNING' });
    await acquireContentSyncLock(target, 'owner-2', { runId: 'run-2', now: 1_100, leaseMs: 100 });
    expect(db.documents.get('content_sync_locks/prod-content-to-dev')?.data.ownerId).toBe('owner-2');

    await markContentSyncLockManifestDurable(target, 'owner-2', 'run-2');
    await expect(
      acquireContentSyncLock(target, 'owner-3', { runId: 'run-3', now: 9_999, leaseMs: 100 })
    ).rejects.toMatchObject({ code: 'SYNC_ALREADY_RUNNING' });
  });

  it('orders durable applied recovery metadata before revision publication and unlock', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/sync-prod-content-to-dev.mjs'), 'utf8');
    const applyBody = source.slice(
      source.indexOf('export async function applyPlan'),
      source.indexOf('function targetManifestCheck')
    );
    const appliedStatus = applyBody.indexOf("runManifest.status = 'applied'");
    const durableManifest = applyBody.indexOf('await updateRunManifest(backupBucket, runManifest)', appliedStatus);
    const revision = applyBody.indexOf('await advanceVocabularyContentRevision', durableManifest);
    const unlock = applyBody.indexOf('await releaseContentSyncLock', revision);

    expect(appliedStatus).toBeGreaterThan(-1);
    expect(durableManifest).toBeGreaterThan(appliedStatus);
    expect(revision).toBeGreaterThan(durableManifest);
    expect(unlock).toBeGreaterThan(revision);
    expect(applyBody).toContain("runManifest?.status === 'applied' && !appliedManifestPersisted");
  });

  it('does not publish a revision or unlock when the applied manifest write fails', async () => {
    const publishRevision = jest.fn();
    const releaseLock = jest.fn();

    await expect(
      publishAppliedRun({
        persistAppliedManifest: jest.fn().mockRejectedValue(new Error('manifest write failed')),
        publishRevision,
        releaseLock,
      })
    ).rejects.toThrow('manifest write failed');
    expect(publishRevision).not.toHaveBeenCalled();
    expect(releaseLock).not.toHaveBeenCalled();
  });

  it("cannot release a replacement process's sync lock", async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    const target = { projectId: TARGET_PROJECT_ID, db };
    await acquireContentSyncLock(target, 'owner-1');
    db.documents.set('content_sync_locks/prod-content-to-dev', {
      data: { ownerId: 'owner-2' },
      updateTime: 'replacement',
    });

    await expect(releaseContentSyncLock(target, 'owner-1')).rejects.toMatchObject({
      code: 'SYNC_LOCK_OWNERSHIP_LOST',
    });
    expect(db.documents.get('content_sync_locks/prod-content-to-dev')?.data.ownerId).toBe('owner-2');
  });

  it('treats a committed lock delete with a lost response as an idempotent successful unlock', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    const target = { projectId: TARGET_PROJECT_ID, db };
    await acquireContentSyncLock(target, 'owner-1');
    db.failAfterCommitOnce = true;

    await expect(releaseContentSyncLock(target, 'owner-1')).resolves.toBeUndefined();
    expect(db.documents.has('content_sync_locks/prod-content-to-dev')).toBe(false);
  });

  it('unlocks a failed preflight without depending on revision publication', async () => {
    const publishRevision = jest.fn().mockRejectedValue(new Error('revision unavailable'));
    const releaseLock = jest.fn().mockResolvedValue(undefined);

    await finalizeApplyLock({ mutationStarted: false, publishRevision, releaseLock });

    expect(publishRevision).not.toHaveBeenCalled();
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  it('atomically transfers a retained lock only to an authorized recovery attempt', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    const target = { projectId: TARGET_PROJECT_ID, db };
    await acquireContentSyncLock(target, 'apply-owner');

    await claimContentSyncRecoveryLock(target, 'apply-owner', 'rollback-owner', {
      attemptId: 'attempt-1',
      now: 1_000,
    });
    expect(db.documents.get('content_sync_locks/prod-content-to-dev')?.data.ownerId).toBe('rollback-owner');
    await expect(
      claimContentSyncRecoveryLock(target, 'apply-owner', 'rollback-owner', {
        attemptId: 'attempt-2',
        now: 1_001,
      })
    ).rejects.toMatchObject({ code: 'SYNC_ALREADY_RUNNING' });
    await releaseContentSyncRecoveryAttempt(target, 'rollback-owner', 'attempt-1');
    // A manifest write can fail after the owner transfer. The retry still has
    // the old durable owner, so the same stable recovery owner remains usable
    // once the prior exclusive attempt lease is released.
    await expect(
      claimContentSyncRecoveryLock(target, 'apply-owner', 'rollback-owner', {
        attemptId: 'attempt-2',
        now: 1_002,
      })
    ).resolves.toBeUndefined();
    await expect(
      claimContentSyncRecoveryLock(target, 'apply-owner', 'attacker', {
        attemptId: 'attacker-attempt',
        now: 1_003,
      })
    ).rejects.toMatchObject({
      code: 'SYNC_LOCK_OWNERSHIP_LOST',
    });
    await releaseContentSyncRecoveryAttempt(target, 'rollback-owner', 'attempt-2');
    await releaseContentSyncLock(target, 'rollback-owner');
  });

  it('allows recovery from an abandoned attempt only after its exclusive lease expires', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    const target = { projectId: TARGET_PROJECT_ID, db };
    await acquireContentSyncLock(target, 'apply-owner');
    await claimContentSyncRecoveryLock(target, 'apply-owner', 'rollback-owner', {
      attemptId: 'crashed-attempt',
      now: 1_000,
      leaseMs: 100,
    });

    await expect(
      claimContentSyncRecoveryLock(target, 'apply-owner', 'rollback-owner', {
        attemptId: 'retry-attempt',
        now: 1_099,
      })
    ).rejects.toMatchObject({ code: 'SYNC_ALREADY_RUNNING' });
    await expect(
      claimContentSyncRecoveryLock(target, 'apply-owner', 'rollback-owner', {
        attemptId: 'retry-attempt',
        now: 1_100,
      })
    ).resolves.toBeUndefined();
  });

  it('creates an exclusive recovery lock for a legacy applied v3 manifest with no recorded owner', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    const target = { projectId: TARGET_PROJECT_ID, db };

    await expect(
      claimContentSyncRecoveryLock(target, undefined, 'rollback-recovery:legacy-run', {
        allowMissing: true,
        attemptId: 'legacy-attempt',
      })
    ).resolves.toBeUndefined();
    expect(db.documents.get('content_sync_locks/prod-content-to-dev')?.data).toMatchObject({
      ownerId: 'rollback-recovery:legacy-run',
      activeAttemptId: 'legacy-attempt',
    });

    const occupiedDb = new FakeFirestore(TARGET_PROJECT_ID);
    const occupiedTarget = { projectId: TARGET_PROJECT_ID, db: occupiedDb };
    await acquireContentSyncLock(occupiedTarget, 'other-run');
    await expect(
      claimContentSyncRecoveryLock(occupiedTarget, undefined, 'rollback-recovery:legacy-run', {
        allowMissing: true,
        attemptId: 'legacy-attempt',
      })
    ).rejects.toMatchObject({ code: 'SYNC_LOCK_OWNERSHIP_LOST' });
  });

  it('plans a hash-validated rollback from mixed pre/post states after partial commits', () => {
    const beforeLesson = lessonRecord('lesson-1', 'before', 'before-time');
    const afterLesson = lessonRecord('lesson-1', 'after', 'after-time');
    const beforeStorage = storageRecord('lessons/lesson-1/audio.mp3', '1', '1');
    const afterStorage = { ...storageRecord('lessons/lesson-1/audio.mp3', '2', '1'), contentHash: 'after-storage' };
    const createdStorage = { ...storageRecord('lessons/created/audio.mp3', '1', '1'), contentHash: 'created-storage' };
    const deletedStorage = { ...storageRecord('lessons/deleted/audio.mp3', '1', '1'), contentHash: 'deleted-storage' };
    const targetState = {
      projectId: TARGET_PROJECT_ID,
      storageBucket: TARGET_STORAGE_BUCKET,
      database: '(default)',
      capturedAt: '2026-08-11T00:00:00.000Z',
      collections: {
        lessons: [afterLesson],
        learningPaths: [],
        vocabulary_pools: [],
        vocabulary_words_v5: [],
      },
      excludedCollections: {},
      storage: [beforeStorage, createdStorage],
      excludedStorage: [],
      authFingerprint: { count: 0, hash: sha256('auth') },
    };
    const manifest = {
      runId: 'partial-run',
      status: 'recovery-required',
      target: {
        postSyncManifestHash: null,
        preSyncExcludedFingerprint: buildExcludedFingerprint(targetState),
        preSyncAuthFingerprint: targetState.authFingerprint,
      },
      plan: {
        firestore: {
          operations: [
            {
              collection: 'lessons',
              id: 'lesson-1',
              sourceHash: dataHash(afterLesson.data),
              targetHash: dataHash(beforeLesson.data),
            },
          ],
        },
        storage: {
          operations: [
            {
              name: beforeStorage.name,
              sourceHash: afterStorage.hash,
              targetHash: beforeStorage.hash,
              sourceContentHash: afterStorage.contentHash,
              targetContentHash: beforeStorage.contentHash,
            },
            {
              name: createdStorage.name,
              sourceHash: createdStorage.hash,
              targetHash: null,
              sourceContentHash: createdStorage.contentHash,
              targetContentHash: null,
            },
            {
              name: deletedStorage.name,
              sourceHash: null,
              targetHash: deletedStorage.hash,
              sourceContentHash: null,
              targetContentHash: deletedStorage.contentHash,
            },
          ],
        },
      },
      beforeImages: {
        firestoreEntries: [
          {
            collection: 'lessons',
            id: 'lesson-1',
            path: 'lessons/lesson-1',
            exists: true,
            dataHash: dataHash(beforeLesson.data),
            backupPath: 'before.json',
          },
        ],
        storageEntries: [
          {
            name: beforeStorage.name,
            exists: true,
            contentHash: beforeStorage.contentHash,
            backupPath: 'before.bin',
          },
          {
            name: createdStorage.name,
            exists: false,
            contentHash: null,
            backupPath: null,
          },
          {
            name: deletedStorage.name,
            exists: true,
            contentHash: deletedStorage.contentHash,
            backupPath: 'deleted-before.bin',
          },
        ],
      },
    };

    expect(() => rollbackPlan(manifest, targetState)).not.toThrow();
    // The apply catch-path manifest write may fail after a real mutation. The
    // durable manifest then remains backed-up, but the token + retained owner
    // still authorize the same hash-validated recovery plan.
    expect(() => rollbackPlan({ ...manifest, status: 'backed-up' }, targetState)).not.toThrow();
    expect(() =>
      rollbackPlan(manifest, {
        ...targetState,
        collections: { ...targetState.collections, lessons: [lessonRecord('lesson-1', 'unrelated', 'drift')] },
      })
    ).toThrow(/unrelated drift/);

    const legacyManifest = clone(manifest);
    for (const operation of legacyManifest.plan.storage.operations) {
      Reflect.deleteProperty(operation, 'sourceContentHash');
      Reflect.deleteProperty(operation, 'targetContentHash');
    }
    const legacyPostState = {
      ...targetState,
      excludedCollections: { userProgress: [{ id: 'progress-1', data: { completed: true } }] },
      authFingerprint: { count: 1, hash: 'unrelated-login-drift' },
      storage: [afterStorage, createdStorage],
    };
    upgradeStorageRecoveryContentHashes(legacyManifest, legacyPostState);
    expect(legacyManifest.plan.storage.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: beforeStorage.name,
          sourceContentHash: afterStorage.contentHash,
          targetContentHash: beforeStorage.contentHash,
        }),
        expect.objectContaining({
          name: createdStorage.name,
          sourceContentHash: createdStorage.contentHash,
          targetContentHash: null,
        }),
        expect.objectContaining({
          name: deletedStorage.name,
          sourceContentHash: null,
          targetContentHash: deletedStorage.contentHash,
        }),
      ])
    );
    expect(() => rollbackPlan(legacyManifest, legacyPostState)).not.toThrow();

    const driftedLegacyManifest = clone(manifest);
    for (const operation of driftedLegacyManifest.plan.storage.operations) {
      Reflect.deleteProperty(operation, 'sourceContentHash');
      Reflect.deleteProperty(operation, 'targetContentHash');
    }
    const driftedStorageState = {
      ...legacyPostState,
      storage: [
        { ...afterStorage, hash: 'unrelated-object-hash', contentHash: 'unrelated-content-hash' },
        createdStorage,
      ],
    };
    upgradeStorageRecoveryContentHashes(driftedLegacyManifest, driftedStorageState);
    expect(() => rollbackPlan(driftedLegacyManifest, driftedStorageState)).toThrow(/unrelated drift/i);
  });

  it('refuses to recreate a vocabulary pool whose dev tombstone requires restore or remapping', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    db.documents.set('deleted_vocabulary_pools/pool-1', { data: { archiveId: 'archive-1' }, updateTime: 't1' });
    const plan = {
      firestoreOperations: [
        { collection: 'vocabulary_pools', id: 'pool-1', action: 'create', source: { data: { id: 'pool-1' } } },
      ],
    };

    await expect(
      assertNoVocabularyPoolTombstoneCollisions(plan, { projectId: TARGET_PROJECT_ID, db })
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_TOMBSTONE_COLLISION' });
    await expect(
      executeFirestoreOperations({ projectId: TARGET_PROJECT_ID, db }, plan.firestoreOperations)
    ).rejects.toMatchObject({ code: 'VOCABULARY_POOL_TOMBSTONE_COLLISION' });
    expect(db.documents.has('vocabulary_pools/pool-1')).toBe(false);
  });

  it('uses full transactional replacement and rejects update-time drift', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID);
    db.documents.set('lessons/lesson-1', { data: { id: 'lesson-1', stale: 'remove', keep: 'old' }, updateTime: 't1' });
    const target = { projectId: TARGET_PROJECT_ID, db };
    await executeFirestoreOperations(target, [
      {
        collection: 'lessons',
        id: 'lesson-1',
        action: 'update',
        source: { data: { id: 'lesson-1', keep: 'new' } },
        target: { updateTime: 't1' },
      },
    ]);
    expect(db.documents.get('lessons/lesson-1')?.data).toEqual({ id: 'lesson-1', keep: 'new' });

    db.documents.set('lessons/lesson-1', { data: { id: 'lesson-1', keep: 'drifted' }, updateTime: 't2' });
    await expect(
      executeFirestoreOperations(target, [
        {
          collection: 'lessons',
          id: 'lesson-1',
          action: 'update',
          source: { data: { id: 'lesson-1', keep: 'new' } },
          target: { updateTime: 't1' },
        },
      ])
    ).rejects.toThrow(/changed after planning/);
    expect(db.documents.get('lessons/lesson-1')?.data.keep).toBe('drifted');
  });

  it('halves only Firestore transaction-too-big chunks and preserves every write', async () => {
    const db = new FakeFirestore(TARGET_PROJECT_ID, 2);
    const operations = Array.from({ length: 5 }, (_, index) => ({
      collection: 'vocabulary_words_v5',
      id: `word-${index}`,
      action: 'create',
      source: { data: { id: `word-${index}`, value: `value-${index}` } },
      target: null,
    }));

    await executeFirestoreOperations({ projectId: TARGET_PROJECT_ID, db }, operations);

    expect(db.transactionCalls).toBe(5);
    expect([...db.documents.keys()].sort()).toEqual(
      operations.map(operation => `${operation.collection}/${operation.id}`).sort()
    );
  });

  it('pins the captured source generation and rejects metadata-only target drift', async () => {
    const sourceBucket = new FakeBucket(SOURCE_STORAGE_BUCKET, SOURCE_PROJECT_ID);
    const targetBucket = new FakeBucket(TARGET_STORAGE_BUCKET, TARGET_PROJECT_ID);
    sourceBucket.objects.set('lessons/lesson-1/audio.mp3', {
      bytes: Buffer.from('audio'),
      generation: 'source-new',
      metageneration: '1',
      metadata: {},
    });
    const operation = {
      name: 'lessons/lesson-1/audio.mp3',
      action: 'create',
      source: { ...storageRecord('lessons/lesson-1/audio.mp3', 'source-old', '1') },
      target: null,
    };
    await expect(
      executeStorageOperations(
        { projectId: SOURCE_PROJECT_ID, bucket: sourceBucket },
        { projectId: TARGET_PROJECT_ID, bucket: targetBucket },
        [operation]
      )
    ).rejects.toThrow(/generation drift/);
    expect(targetBucket.saveCalls).toHaveLength(0);
    expect(sourceBucket.fileCalls[0]).toMatchObject({ name: operation.name, options: { generation: 'source-old' } });

    sourceBucket.objects.set(operation.name, {
      bytes: Buffer.from('audio'),
      generation: 'source-old',
      metageneration: '1',
      metadata: {},
    });
    targetBucket.objects.set(operation.name, {
      bytes: Buffer.from('old'),
      generation: '9',
      metageneration: '2',
      metadata: {},
    });
    const update = { ...operation, action: 'update', target: storageRecord(operation.name, '9', '1') };
    await expect(
      executeStorageOperations(
        { projectId: SOURCE_PROJECT_ID, bucket: sourceBucket },
        { projectId: TARGET_PROJECT_ID, bucket: targetBucket },
        [update]
      )
    ).rejects.toThrow(/metageneration precondition/);
  });

  it('filters only the exact zero-byte folder marker during bucket capture', async () => {
    const listed = (metadata: Record<string, unknown>) => ({
      name: metadata.name,
      getMetadata: async () => [metadata],
    });
    const bucket = {
      getFiles: async () => [
        [
          listed({
            name: 'lessons/',
            size: '0',
            generation: '1',
            metageneration: '1',
            md5Hash: null,
            crc32c: null,
            contentType: null,
            metadata: {},
          }),
          listed({
            name: 'lessons/',
            size: '1',
            generation: '2',
            metageneration: '1',
            md5Hash: 'marker-md5',
            crc32c: null,
            contentType: null,
            metadata: {},
          }),
          listed({
            name: 'lessons/',
            generation: '3',
            metageneration: '1',
            md5Hash: null,
            crc32c: null,
            contentType: null,
            metadata: {},
          }),
          listed({
            name: 'lessons',
            size: '0',
            generation: '1',
            metageneration: '1',
            md5Hash: 'root-md5',
            crc32c: null,
            contentType: null,
            metadata: {},
          }),
          listed({
            name: 'other/lessons/audio.mp3',
            size: '1',
            generation: '1',
            metageneration: '1',
            md5Hash: 'other-md5',
            crc32c: null,
            contentType: 'audio/mpeg',
            metadata: {},
          }),
        ],
      ],
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
    await expect(executeFirestoreOperations({ projectId: SOURCE_PROJECT_ID, db: sourceDb }, [])).rejects.toThrow(
      /read-only/
    );
    await expect(executeFirestoreOperations({ projectId: TARGET_PROJECT_ID, db: sourceDb }, [])).rejects.toThrow(
      /expected/
    );
    await expect(
      executeFirestoreOperations({ projectId: TARGET_PROJECT_ID, db: targetDb }, [])
    ).resolves.toBeUndefined();
    await expect(
      executeStorageOperations(
        { projectId: SOURCE_PROJECT_ID, bucket: sourceBucket },
        { projectId: TARGET_PROJECT_ID, bucket: sourceBucket },
        []
      )
    ).rejects.toThrow(/expected/);
    await expect(
      ensureBackupBucket(
        {
          projectId: SOURCE_PROJECT_ID,
          storage: {
            bucket: () => {
              throw new Error('must not call SDK');
            },
          },
        },
        { allowProvision: true }
      )
    ).rejects.toThrow(/read-only/);
    await expect(
      executeStorageRollbackOperations(
        { projectId: SOURCE_PROJECT_ID, bucket: sourceBucket },
        targetBucket,
        [],
        new Map()
      )
    ).rejects.toThrow(/read-only/);
    await expect(
      executeStorageRollbackOperations(
        { projectId: TARGET_PROJECT_ID, bucket: targetBucket },
        sourceBucket,
        [],
        new Map()
      )
    ).rejects.toThrow(/bucket/);
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
    db.documents.set('lessons/original-create', {
      data: target.collections.lessons[0].data,
      updateTime: 'post-create',
    });
    db.documents.set('lessons/original-update', {
      data: target.collections.lessons[1].data,
      updateTime: 'post-update',
    });
    await executeFirestoreOperations({ projectId: TARGET_PROJECT_ID, db }, [
      { collection: 'lessons', id: 'original-create', action: 'delete', target: { updateTime: 'post-create' } },
      {
        collection: 'lessons',
        id: 'original-update',
        action: 'update',
        source: { data: lessonRecord('original-update', 'before update', 'before').data },
        target: { updateTime: 'post-update' },
      },
      {
        collection: 'lessons',
        id: 'original-delete',
        action: 'create',
        source: { data: lessonRecord('original-delete', 'before delete', 'before').data },
        target: null,
      },
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
    targetBucket.objects.set('lessons/original-create/audio.mp3', {
      bytes: Buffer.from('new-create'),
      generation: '10',
      metageneration: '1',
      metadata: {},
    });
    targetBucket.objects.set('lessons/original-update/audio.mp3', {
      bytes: Buffer.from('new-update'),
      generation: '11',
      metageneration: '1',
      metadata: {},
    });
    const backupBucket = new FakeBucket(BACKUP_BUCKET, TARGET_PROJECT_ID);
    const oldUpdate = storageRecord('lessons/original-update/audio.mp3', '5', '1');
    const oldDelete = storageRecord('lessons/original-delete/audio.mp3', '6', '1');
    const backupEntries: Array<[string, ReturnType<typeof storageRecord>, string]> = [
      ['original-update', oldUpdate, 'old-update'],
      ['original-delete', oldDelete, 'old-delete'],
    ];
    for (const [base, record, bytes] of backupEntries) {
      const prefix = `runs/rollback/before/storage/${base}`;
      backupBucket.objects.set(`${prefix}.bin`, {
        bytes: Buffer.from(bytes),
        generation: '1',
        metageneration: '1',
        metadata: {},
      });
      backupBucket.objects.set(`${prefix}.json`, {
        bytes: Buffer.from(JSON.stringify(record)),
        generation: '1',
        metageneration: '1',
        metadata: {},
      });
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
    expect(targetBucket.deleteCalls[0].options.preconditionOpts).toEqual({
      ifGenerationMatch: '10',
      ifMetagenerationMatch: '1',
    });
  });

  it('rejects corrupt before-images before restoring Firestore or Storage', async () => {
    const oldDocument = { id: 'lesson-1', title: 'before' };
    expect(() =>
      assertFirestoreBeforeImageIntegrity(
        { exists: true, path: 'lessons/lesson-1', dataHash: dataHash(oldDocument) },
        { ...oldDocument, title: 'corrupt' }
      )
    ).toThrow(/integrity/);
    const poolBeforeImage = { name: 'Pool', _assignmentRevision: 7, _wordContentRevision: 9 };
    expect(() =>
      assertFirestoreBeforeImageIntegrity(
        {
          exists: true,
          collection: 'vocabulary_pools',
          path: 'vocabulary_pools/pool-1',
          dataHash: dataHash(poolBeforeImage),
        },
        { ...poolBeforeImage, _assignmentRevision: 8 }
      )
    ).toThrow(/integrity/);

    const metadata = storageRecord('lessons/lesson-1/audio.mp3', '5', '1');
    const expectedBytes = Buffer.from('original-audio');
    const storageEntry = {
      exists: true,
      name: metadata.name,
      hash: metadata.hash,
      contentHash: metadata.contentHash,
      bytesHash: byteHash(expectedBytes),
    };
    expect(() => assertStorageBeforeImageIntegrity(storageEntry, metadata, Buffer.from('corrupt-audio'))).toThrow(
      /integrity/
    );
    expect(() =>
      assertStorageBeforeImageIntegrity(storageEntry, { ...metadata, metadata: { altered: true } }, expectedBytes)
    ).toThrow(/integrity/);

    const targetBucket = new FakeBucket(TARGET_STORAGE_BUCKET, TARGET_PROJECT_ID);
    targetBucket.objects.set(metadata.name, {
      bytes: Buffer.from('new-audio'),
      generation: '10',
      metageneration: '1',
      metadata: {},
    });
    const backupBucket = new FakeBucket(BACKUP_BUCKET, TARGET_PROJECT_ID);
    const prefix = `runs/corrupt/before/storage/${safePathSegment(metadata.name)}`;
    backupBucket.objects.set(`${prefix}.bin`, {
      bytes: Buffer.from('corrupt-audio'),
      generation: '1',
      metageneration: '1',
      metadata: {},
    });
    backupBucket.objects.set(`${prefix}.json`, {
      bytes: Buffer.from(JSON.stringify(metadata)),
      generation: '1',
      metageneration: '1',
      metadata: {},
    });
    await expect(
      executeStorageRollbackOperations(
        { projectId: TARGET_PROJECT_ID, bucket: targetBucket },
        backupBucket,
        [
          {
            action: 'restore',
            name: metadata.name,
            backupPath: `${prefix}.bin`,
            exists: true,
            hash: metadata.hash,
            contentHash: metadata.contentHash,
            bytesHash: byteHash(expectedBytes),
          },
        ],
        new Map([[metadata.name, { ...metadata, generation: '10', metageneration: '1' }]])
      )
    ).rejects.toThrow(/integrity/);
    expect(targetBucket.saveCalls).toHaveLength(0);
    expect(targetBucket.objects.get(metadata.name)?.bytes.toString()).toBe('new-audio');
  });
});
