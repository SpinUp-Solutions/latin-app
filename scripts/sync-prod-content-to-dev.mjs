#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  BACKUP_BUCKET,
  BACKUP_LOCATION,
  EXIT_CODES,
  FIRESTORE_DATABASE,
  LIFECYCLE_DELETE_AGE_DAYS,
  MIRRORED_COLLECTIONS,
  RUN_SCHEMA_VERSION,
  SOURCE_PROJECT_ID,
  SOURCE_STORAGE_BUCKET,
  STORAGE_FOLDER_MARKER_NAME,
  TARGET_PROJECT_ID,
  TARGET_STORAGE_BUCKET,
  SyncError,
  affectedDocumentOperations,
  affectedStorageOperations,
  assertPlanHash,
  buildContentFingerprint,
  buildExcludedFingerprint,
  buildManifest,
  buildMirroredContentFingerprint,
  byteHash,
  chunkOperations,
  collectPoolIds,
  collectWordIds,
  createPlan,
  dataHash,
  decodeFirestoreValue,
  encodeFirestoreValue,
  formatTimeForHash,
  isZeroByteStorageFolderMarker,
  lessonIdFromStorageName,
  normalizeDocumentRecord,
  normalizeStorageRecord,
  operationsByCollection,
  rebaseLocalRevisionFields,
  runManifestPath,
  safePathSegment,
  sha256,
  storageContentHash,
  storageObjectHash,
  summarizeOperations,
  validateCurrentTargetState,
} from './sync-prod-content-to-dev-core.mjs';

const ALLOWED_ADC_PROJECTS = new Set([SOURCE_PROJECT_ID, TARGET_PROJECT_ID]);
const PROJECT_ENVIRONMENT_KEYS = [
  'GOOGLE_CLOUD_PROJECT',
  'GCLOUD_PROJECT',
  'CLOUDSDK_CORE_PROJECT',
  'GOOGLE_CLOUD_QUOTA_PROJECT',
];
const LESSONS_PREFIX = 'lessons/';
const SOFT_DELETE_RETENTION_SECONDS = 7 * 24 * 60 * 60;
let AdminTimestamp;
let AdminGeoPoint;

export function usage() {
  return [
    'Usage: npm run sync:prod-content -- [command]',
    '',
    'Commands:',
    '  (default)                         read-only dry-run; print JSON audit plan and planHash',
    '  --apply --plan-hash <hash>        guarded live apply to latin-app-dev only',
    '  --verify --run-id <id>            read-only verification of an applied run',
    '  --rollback --run-id <id>          read-only rollback plan',
    '  --rollback --run-id <id> --apply --rollback-token <token>',
    '                                    guarded rollback after exact post-sync match',
    '  --setup-backup                    explicitly provision/check the private dev backup bucket',
    '',
    'Production is always latin-app-prod and read-only. Project/bucket overrides are rejected.',
  ].join('\n');
}

export function parseArgs(argv) {
  const options = { mode: 'dry-run', apply: false, planHash: null, runId: null, rollbackToken: null, help: false };
  const selectMode = mode => {
    if (options.mode !== 'dry-run' && options.mode !== mode)
      throw new SyncError('USAGE', `Cannot combine ${options.mode} with ${mode}`);
    options.mode = mode;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      options.apply = true;
      continue;
    }
    if (argument === '--setup-backup') {
      selectMode('setup-backup');
      continue;
    }
    if (argument === '--verify') {
      selectMode('verify');
      continue;
    }
    if (argument === '--rollback') {
      selectMode('rollback');
      continue;
    }
    if (argument === '--plan-hash' || argument === '--run-id' || argument === '--rollback-token') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new SyncError('USAGE', `${argument} requires a value`);
      if (argument === '--plan-hash') options.planHash = value;
      else if (argument === '--run-id') options.runId = value;
      else options.rollbackToken = value;
      index += 1;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    throw new SyncError('USAGE', `Unknown argument ${argument}`);
  }
  if (options.mode === 'dry-run' && options.apply) {
    if (!options.planHash) throw new SyncError('USAGE', '--apply requires --plan-hash <hash>');
    options.mode = 'apply';
  }
  if (options.mode === 'apply' && (options.runId || options.rollbackToken))
    throw new SyncError('USAGE', '--apply cannot be combined with --run-id or --rollback-token');
  if (options.mode === 'verify' && options.apply)
    throw new SyncError('USAGE', '--verify cannot be combined with --apply');
  if (options.mode === 'verify' && (options.planHash || options.rollbackToken))
    throw new SyncError('USAGE', '--verify cannot be combined with plan or rollback tokens');
  if (options.mode === 'verify' && !options.runId) throw new SyncError('USAGE', '--verify requires --run-id <id>');
  if (options.mode === 'rollback' && !options.runId) throw new SyncError('USAGE', '--rollback requires --run-id <id>');
  if (options.mode === 'rollback' && options.planHash)
    throw new SyncError('USAGE', '--rollback cannot be combined with --plan-hash');
  if (options.mode === 'rollback' && !options.apply && options.rollbackToken)
    throw new SyncError('USAGE', 'Rollback token requires --apply');
  if (options.mode === 'rollback' && options.apply && !options.rollbackToken)
    throw new SyncError('USAGE', '--rollback --apply requires --rollback-token <token>');
  if (options.mode === 'setup-backup' && (options.apply || options.planHash || options.runId || options.rollbackToken))
    throw new SyncError('USAGE', '--setup-backup takes no other command options');
  if (options.mode === 'dry-run' && (options.planHash || options.runId || options.rollbackToken))
    throw new SyncError('USAGE', 'Plan, run, and rollback tokens require their corresponding command');
  return options;
}

export async function assertNoUnexpectedProjectOverrides() {
  for (const key of PROJECT_ENVIRONMENT_KEYS) {
    const value = process.env[key]?.trim();
    if (value && !ALLOWED_ADC_PROJECTS.has(value))
      throw new SyncError('UNEXPECTED_PROJECT_OVERRIDE', `${key} must name latin-app-prod or latin-app-dev`);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new SyncError('EMULATOR_NOT_ALLOWED', 'Live sync commands refuse emulator endpoints');
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) return;
  try {
    const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
    if (credentials.quota_project_id && !ALLOWED_ADC_PROJECTS.has(credentials.quota_project_id))
      throw new SyncError('UNEXPECTED_ADC_QUOTA_PROJECT', 'ADC quota project is not an approved project');
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError('ADC_CREDENTIALS_INVALID', 'Unable to inspect the configured ADC credentials');
  }
}

async function assertFirestoreLocation(projectId) {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/datastore.readonly'] });
  const client = await auth.getClient();
  const response = await client.request({
    method: 'GET',
    url: `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/%28default%29`,
  });
  const locationId = response.data?.locationId;
  if (locationId !== 'nam5')
    throw new SyncError('FIRESTORE_LOCATION_MISMATCH', `${projectId} Firestore database must be nam5`);
}

function assertSourceReadOnly(projectId) {
  if (projectId !== SOURCE_PROJECT_ID)
    throw new SyncError('SOURCE_READ_SCOPE_VIOLATION', `Source adapter must use ${SOURCE_PROJECT_ID}`);
}

export function assertWriteBoundary(projectId, resource) {
  if (projectId === SOURCE_PROJECT_ID)
    throw new SyncError('PRODUCTION_WRITE_FORBIDDEN', `Production is read-only: ${resource}`);
  if (projectId !== TARGET_PROJECT_ID)
    throw new SyncError('WRITE_SCOPE_VIOLATION', `Refusing to write outside ${TARGET_PROJECT_ID}`, { resource });
}

function assertFirestoreResource(resource, expectedProjectId, label) {
  const actualProjectId = resource?.db?.projectId;
  const actualDatabaseId = resource?.db?.databaseId;
  if (
    resource?.projectId !== expectedProjectId ||
    actualProjectId !== expectedProjectId ||
    actualDatabaseId !== FIRESTORE_DATABASE
  ) {
    throw new SyncError(
      'WRITE_SCOPE_VIOLATION',
      `${label} Firestore handle is not the expected ${expectedProjectId}/${FIRESTORE_DATABASE}`,
      {
        expectedProjectId,
        actualProjectId: resource?.projectId ?? actualProjectId ?? null,
        actualDatabaseId: actualDatabaseId ?? null,
      }
    );
  }
}

function assertStorageResource(resource, expectedProjectId, expectedBucketName, label) {
  const actualProjectId = resource?.bucket?.storage?.projectId;
  const actualBucketName = resource?.bucket?.name;
  if (
    resource?.projectId !== expectedProjectId ||
    actualProjectId !== expectedProjectId ||
    actualBucketName !== expectedBucketName
  ) {
    throw new SyncError(
      'WRITE_SCOPE_VIOLATION',
      `${label} Storage handle is not the expected ${expectedProjectId}/${expectedBucketName}`,
      {
        expectedProjectId,
        expectedBucketName,
        actualProjectId: resource?.projectId ?? actualProjectId ?? null,
        actualBucketName: actualBucketName ?? null,
      }
    );
  }
}

function assertStorageClient(resource, expectedProjectId, label) {
  const actualProjectId = resource?.storage?.projectId;
  if (resource?.projectId !== expectedProjectId || actualProjectId !== expectedProjectId) {
    throw new SyncError('WRITE_SCOPE_VIOLATION', `${label} Storage client is not for ${expectedProjectId}`, {
      expectedProjectId,
      actualProjectId: resource?.projectId ?? actualProjectId ?? null,
    });
  }
}

function assertBackupBucketHandle(bucket, label = 'Backup') {
  const actualProjectId = bucket?.storage?.projectId;
  const actualBucketName = bucket?.name;
  if (actualProjectId !== TARGET_PROJECT_ID || actualBucketName !== BACKUP_BUCKET) {
    throw new SyncError(
      'WRITE_SCOPE_VIOLATION',
      `${label} bucket is not the expected ${TARGET_PROJECT_ID}/${BACKUP_BUCKET}`,
      {
        expectedProjectId: TARGET_PROJECT_ID,
        expectedBucketName: BACKUP_BUCKET,
        actualProjectId: actualProjectId ?? null,
        actualBucketName: actualBucketName ?? null,
      }
    );
  }
}

function userFingerprintRecord(user) {
  return {
    uid: user.uid,
    disabled: Boolean(user.disabled),
    email: user.email ?? null,
    phoneNumber: user.phoneNumber ?? null,
    emailVerified: Boolean(user.emailVerified),
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    customClaims: user.customClaims ?? null,
    metadata: {
      creationTime: user.metadata?.creationTime ?? null,
      lastSignInTime: user.metadata?.lastSignInTime ?? null,
      lastRefreshTime: user.metadata?.lastRefreshTime ?? null,
    },
    providerData: (user.providerData ?? [])
      .map(provider => ({
        providerId: provider.providerId ?? null,
        uid: provider.uid ?? null,
        email: provider.email ?? null,
        phoneNumber: provider.phoneNumber ?? null,
        displayName: provider.displayName ?? null,
        photoURL: provider.photoURL ?? null,
      }))
      .sort((left, right) => `${left.providerId}:${left.uid}`.localeCompare(`${right.providerId}:${right.uid}`)),
  };
}

export async function captureAuthFingerprint(auth) {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users.map(userFingerprintRecord));
    pageToken = page.pageToken;
  } while (pageToken);
  users.sort((left, right) => left.uid.localeCompare(right.uid));
  return { count: users.length, hash: sha256({ kind: 'auth-fingerprint', users }) };
}

async function listFirestoreCollection(db, collection) {
  const snapshot = await db.collection(collection).get();
  return snapshot.docs.map(document =>
    normalizeDocumentRecord(collection, {
      id: document.id,
      data: document.data(),
      createTime: document.createTime,
      updateTime: document.updateTime,
    })
  );
}

async function listRootCollectionNames(db) {
  const collections = await db.listCollections();
  return collections.map(collection => collection.id).sort();
}

export async function listBucketObjects(bucket) {
  const [files] = await bucket.getFiles();
  const records = [];
  for (const file of files) {
    const [metadata] = await file.getMetadata();
    const captured = {
      name: metadata.name ?? file.name,
      generation: metadata.generation,
      metageneration: metadata.metageneration,
      size: metadata.size,
      md5Hash: metadata.md5Hash,
      crc32c: metadata.crc32c,
      contentType: metadata.contentType,
      cacheControl: metadata.cacheControl,
      contentEncoding: metadata.contentEncoding,
      contentDisposition: metadata.contentDisposition,
      contentLanguage: metadata.contentLanguage,
      metadata: metadata.metadata ?? {},
    };
    // Inspect the raw SDK metadata so a missing size cannot be normalized to
    // zero and accidentally treated as the approved non-content marker.
    if (!isZeroByteStorageFolderMarker(captured)) records.push(normalizeStorageRecord(captured));
  }
  return records.sort((left, right) => left.name.localeCompare(right.name));
}

async function captureState({ projectId, storageBucket, db, bucket, auth, includeExcluded }) {
  if (projectId === SOURCE_PROJECT_ID) assertSourceReadOnly(projectId);
  else assertWriteBoundary(projectId, 'target read');
  assertFirestoreResource({ projectId, db }, projectId, 'State capture');
  assertStorageResource({ projectId, bucket }, projectId, storageBucket, 'State capture');
  const collections = {};
  for (const collection of MIRRORED_COLLECTIONS)
    collections[collection] = await listFirestoreCollection(db, collection);
  const excludedCollections = {};
  if (includeExcluded) {
    for (const collection of await listRootCollectionNames(db)) {
      if (!MIRRORED_COLLECTIONS.includes(collection))
        excludedCollections[collection] = await listFirestoreCollection(db, collection);
    }
  }
  const allObjects = await listBucketObjects(bucket);
  const storage = allObjects.filter(record => record.name.startsWith(LESSONS_PREFIX));
  const excludedStorage = includeExcluded ? allObjects.filter(record => !record.name.startsWith(LESSONS_PREFIX)) : [];
  const authFingerprint = includeExcluded ? await captureAuthFingerprint(auth) : null;
  return {
    projectId,
    storageBucket,
    database: FIRESTORE_DATABASE,
    capturedAt: new Date().toISOString(),
    collections,
    excludedCollections,
    storage,
    excludedStorage,
    authFingerprint,
  };
}

async function captureSourceState(resources) {
  assertSourceReadOnly(resources.projectId);
  return captureState({ ...resources, includeExcluded: false });
}

async function captureTargetState(resources) {
  assertWriteBoundary(resources.projectId, 'target read');
  return withoutContentSyncOperationalState(await captureState({ ...resources, includeExcluded: true }));
}

function backupBucketMetadata() {
  return {
    location: BACKUP_LOCATION,
    storageClass: 'STANDARD',
    iamConfiguration: {
      uniformBucketLevelAccess: { enabled: true },
      publicAccessPrevention: 'enforced',
    },
    softDeletePolicy: { retentionDurationSeconds: SOFT_DELETE_RETENTION_SECONDS },
    lifecycle: { rule: [{ action: { type: 'Delete' }, condition: { age: LIFECYCLE_DELETE_AGE_DAYS } }] },
  };
}

export async function ensureBackupBucket(storageResource, { allowProvision = false } = {}) {
  assertWriteBoundary(storageResource?.projectId, BACKUP_BUCKET);
  assertStorageClient(storageResource, TARGET_PROJECT_ID, 'Backup');
  const bucket = storageResource.storage.bucket(BACKUP_BUCKET);
  assertBackupBucketHandle(bucket);
  const [exists] = await bucket.exists();
  if (!exists) {
    if (!allowProvision)
      throw new SyncError(
        'BACKUP_BUCKET_MISSING',
        `Backup bucket ${BACKUP_BUCKET} is not provisioned; use --setup-backup or --apply`
      );
    await storageResource.storage.createBucket(BACKUP_BUCKET, backupBucketMetadata());
  }
  if (allowProvision) await bucket.setMetadata(backupBucketMetadata());
  const [metadata] = await bucket.getMetadata();
  const uniform = metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled === true;
  const publicPrevention = metadata.iamConfiguration?.publicAccessPrevention === 'enforced';
  const softDelete = Number(metadata.softDeletePolicy?.retentionDurationSeconds) === SOFT_DELETE_RETENTION_SECONDS;
  const lifecycle = metadata.lifecycle?.rule?.some(
    rule => rule.action?.type === 'Delete' && Number(rule.condition?.age) === LIFECYCLE_DELETE_AGE_DAYS
  );
  if (metadata.location !== BACKUP_LOCATION || !uniform || !publicPrevention || !softDelete || !lifecycle)
    throw new SyncError(
      'BACKUP_BUCKET_POLICY_MISMATCH',
      `Backup bucket ${BACKUP_BUCKET} does not meet the required private retention policy`
    );
  return bucket;
}

async function writeBackupJson(bucket, path, value) {
  assertBackupBucketHandle(bucket, 'Backup write');
  await bucket.file(path).save(`${JSON.stringify(value)}\n`, {
    resumable: false,
    contentType: 'application/json',
    metadata: { cacheControl: 'no-store' },
  });
}

async function readBackupJson(bucket, path) {
  assertBackupBucketHandle(bucket, 'Backup read');
  const [contents] = await bucket.file(path).download();
  try {
    return JSON.parse(contents.toString('utf8'));
  } catch {
    throw new SyncError('INVALID_BACKUP', `Backup artifact ${path} is not valid JSON`);
  }
}

function assertRunManifestSchema(runManifest) {
  if (runManifest?.schemaVersion !== RUN_SCHEMA_VERSION)
    throw new SyncError('INVALID_BACKUP', `Run manifest schema must be ${RUN_SCHEMA_VERSION}`);
}

function createRunId() {
  return `${new Date()
    .toISOString()
    .replaceAll(/[-:.TZ]/g, '')
    .slice(0, 14)}-${randomBytes(6).toString('hex')}`;
}

function createRollbackToken() {
  return randomBytes(24).toString('base64url');
}

function serializeBeforeImage(record) {
  return {
    formatVersion: RUN_SCHEMA_VERSION,
    path: record.path,
    id: record.id,
    exists: true,
    createTime: formatTimeForHash(record.createTime),
    updateTime: formatTimeForHash(record.updateTime),
    data: encodeFirestoreValue(record.data),
  };
}

async function backupBeforeImages(plan, targetResource, backupBucket, runId) {
  assertWriteBoundary(targetResource?.projectId, 'backup before-images');
  assertFirestoreResource(targetResource, TARGET_PROJECT_ID, 'Backup target');
  assertStorageResource(targetResource, TARGET_PROJECT_ID, TARGET_STORAGE_BUCKET, 'Backup target');
  assertBackupBucketHandle(backupBucket, 'Before-image backup');
  const firestoreEntries = [];
  for (const operation of affectedDocumentOperations(plan)) {
    const entry = {
      kind: 'firestore',
      collection: operation.collection,
      id: operation.id,
      path: `${operation.collection}/${operation.id}`,
      exists: Boolean(operation.target),
      createTime: formatTimeForHash(operation.target?.createTime),
      updateTime: formatTimeForHash(operation.target?.updateTime),
      dataHash: operation.target?.exactDataHash ?? (operation.target ? dataHash(operation.target.data) : null),
      syncHash: operation.target?.hash ?? null,
      backupPath: null,
    };
    if (operation.target) {
      entry.backupPath = `runs/${runId}/before/firestore/${operation.collection}/${safePathSegment(operation.id)}.json`;
      await writeBackupJson(backupBucket, entry.backupPath, serializeBeforeImage(operation.target));
    }
    firestoreEntries.push(entry);
  }

  const storageEntries = [];
  for (const operation of affectedStorageOperations(plan)) {
    const entry = {
      kind: 'storage',
      name: operation.name,
      exists: Boolean(operation.target),
      generation: operation.target?.generation ?? null,
      metageneration: operation.target?.metageneration ?? null,
      hash: operation.target?.hash ?? null,
      contentHash: operation.target?.contentHash ?? null,
      bytesHash: null,
      backupPath: null,
    };
    if (operation.target) {
      const targetFile = targetResource.bucket.file(operation.name, { generation: operation.target.generation });
      const [bytes] = await targetFile.download(storageDownloadOptions(operation.target));
      entry.bytesHash = byteHash(bytes);
      entry.backupPath = `runs/${runId}/before/storage/${safePathSegment(operation.name)}.bin`;
      await backupBucket.file(entry.backupPath).save(bytes, {
        resumable: false,
        metadata: {
          contentType: operation.target.contentType ?? 'application/octet-stream',
          metadata: { originalName: operation.name, originalHash: operation.target.hash ?? '' },
        },
      });
      await writeBackupJson(
        backupBucket,
        `runs/${runId}/before/storage/${safePathSegment(operation.name)}.json`,
        operation.target
      );
    }
    storageEntries.push(entry);
  }
  return { firestoreEntries, storageEntries };
}

export function runManifestForBackup(plan, runId, beforeImages, rollbackToken, syncLockOwner = null) {
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    tool: 'sync-prod-content-to-dev',
    runId,
    status: 'backed-up',
    createdAt: new Date().toISOString(),
    source: {
      projectId: SOURCE_PROJECT_ID,
      storageBucket: SOURCE_STORAGE_BUCKET,
      manifestHash: plan.sourceManifest.manifestHash,
      contentFingerprint: plan.sourceContentFingerprint,
    },
    target: {
      projectId: TARGET_PROJECT_ID,
      storageBucket: TARGET_STORAGE_BUCKET,
      preSyncManifestHash: plan.targetManifest.manifestHash,
      preSyncContentFingerprint: plan.targetContentFingerprint,
      preSyncMirroredContentFingerprint: buildMirroredContentFingerprint(plan.targetState),
      preSyncExcludedFingerprint: buildExcludedFingerprint(plan.targetState),
      preSyncAuthFingerprint: plan.targetState.authFingerprint,
      expectedPostSyncContentFingerprint: buildContentFingerprint(plan.projectedState),
      expectedPostSyncMirroredContentFingerprint: buildMirroredContentFingerprint(plan.projectedState),
      postSyncManifestHash: null,
      postSyncContentFingerprint: null,
      postSyncMirroredContentFingerprint: null,
      postSyncExcludedFingerprint: null,
      postSyncAuthFingerprint: null,
    },
    planHash: plan.planHash,
    plan: plan.audit,
    beforeImages,
    rollbackTokenHash: sha256(rollbackToken),
    syncLockOwner,
    backupBucket: BACKUP_BUCKET,
    sourceAfter: null,
    sourceDriftAfterRun: null,
  };
}

export async function publishAppliedRun({ persistAppliedManifest, publishRevision, releaseLock }) {
  await persistAppliedManifest();
  await publishRevision();
  await releaseLock();
}

async function updateRunManifest(bucket, runManifest) {
  await writeBackupJson(bucket, runManifestPath(runManifest.runId), runManifest);
}

function redactRunManifestForOutput(runManifest) {
  return {
    runId: runManifest.runId,
    planHash: runManifest.planHash,
    status: runManifest.status,
    backupBucket: runManifest.backupBucket,
    expectedPostSyncContentFingerprint: runManifest.target.expectedPostSyncContentFingerprint,
    postSyncManifestHash: runManifest.target.postSyncManifestHash,
    postSyncContentFingerprint: runManifest.target.postSyncContentFingerprint,
    sourceDriftAfterRun: runManifest.sourceDriftAfterRun,
  };
}

function storageSaveOptions(sourceRecord, targetRecord) {
  if (targetRecord?.generation && !targetRecord?.metageneration)
    throw new SyncError('TARGET_DRIFT', 'Target Storage update is missing a metageneration precondition');
  return {
    resumable: false,
    metadata: {
      contentType: sourceRecord.contentType ?? undefined,
      cacheControl: sourceRecord.cacheControl ?? undefined,
      contentEncoding: sourceRecord.contentEncoding ?? undefined,
      contentDisposition: sourceRecord.contentDisposition ?? undefined,
      contentLanguage: sourceRecord.contentLanguage ?? undefined,
      metadata: sourceRecord.metadata ?? {},
    },
    preconditionOpts: targetRecord?.generation
      ? { ifGenerationMatch: targetRecord.generation, ifMetagenerationMatch: targetRecord.metageneration }
      : { ifGenerationMatch: 0 },
  };
}

function storageDownloadOptions(record) {
  if (record?.md5Hash) return { validation: 'md5' };
  if (record?.crc32c) return { validation: 'crc32c' };
  throw new SyncError('MISSING_STORAGE_CHECKSUM', 'Storage download requires a captured checksum');
}

export async function executeStorageOperations(sourceResource, targetResource, operations) {
  assertSourceReadOnly(sourceResource?.projectId);
  assertStorageResource(sourceResource, SOURCE_PROJECT_ID, SOURCE_STORAGE_BUCKET, 'Source');
  assertWriteBoundary(targetResource?.projectId, 'Storage');
  assertStorageResource(targetResource, TARGET_PROJECT_ID, TARGET_STORAGE_BUCKET, 'Target');
  for (const operation of operations) {
    if (!operation.name.startsWith(LESSONS_PREFIX) || operation.name === STORAGE_FOLDER_MARKER_NAME) {
      throw new SyncError('WRITE_SCOPE_VIOLATION', `Refusing to write Storage object ${operation.name}`);
    }
  }
  for (const operation of operations) {
    const targetFile = targetResource.bucket.file(operation.name);
    if (operation.action === 'delete') {
      if (!operation.target?.generation || !operation.target?.metageneration)
        throw new SyncError(
          'TARGET_DRIFT',
          `Storage object ${operation.name} has no generation/metageneration precondition`
        );
      await targetFile.delete({
        preconditionOpts: {
          ifGenerationMatch: operation.target.generation,
          ifMetagenerationMatch: operation.target.metageneration,
        },
      });
      continue;
    }
    if (!operation.source?.generation)
      throw new SyncError('SOURCE_DRIFT', `Source Storage object ${operation.name} has no generation precondition`);
    const [bytes] = await sourceResource.bucket
      .file(operation.name, { generation: operation.source.generation })
      .download(storageDownloadOptions(operation.source));
    await targetFile.save(bytes, storageSaveOptions(operation.source, operation.target));
  }
}

function assertTransactionSnapshot(operation, snapshot) {
  if (operation.action === 'create') {
    if (snapshot.exists)
      throw new SyncError(
        'TARGET_DRIFT',
        `Firestore document ${operation.collection}/${operation.id} appeared after planning`
      );
    return;
  }
  if (!snapshot.exists)
    throw new SyncError(
      'TARGET_DRIFT',
      `Firestore document ${operation.collection}/${operation.id} disappeared after planning`
    );
  const expectedUpdateTime = formatTimeForHash(operation.target?.updateTime);
  const actualUpdateTime = formatTimeForHash(snapshot.updateTime);
  if (!expectedUpdateTime || actualUpdateTime !== expectedUpdateTime) {
    throw new SyncError(
      'TARGET_DRIFT',
      `Firestore document ${operation.collection}/${operation.id} changed after planning`,
      {
        expectedUpdateTime,
        actualUpdateTime,
      }
    );
  }
}

async function executeFirestoreChunk(targetResource, operations) {
  const db = targetResource.db;
  await db.runTransaction(async transaction => {
    const refs = operations.map(operation => db.collection(operation.collection).doc(operation.id));
    const protectedPoolOperations = operations.filter(
      operation => operation.collection === 'vocabulary_pools' && operation.action !== 'delete'
    );
    const tombstoneRefs = protectedPoolOperations.map(operation =>
      db.collection('deleted_vocabulary_pools').doc(operation.id)
    );
    const snapshots = await transaction.getAll(...refs, ...tombstoneRefs);
    for (const [index, operation] of operations.entries()) assertTransactionSnapshot(operation, snapshots[index]);
    for (const [index, operation] of protectedPoolOperations.entries()) {
      if (snapshots[refs.length + index].exists) {
        throw new SyncError(
          'VOCABULARY_POOL_TOMBSTONE_COLLISION',
          `Refusing to recreate archived vocabulary pool ${operation.id}; explicitly restore the archive or remap the production pool ID first`
        );
      }
    }
    for (const [index, operation] of operations.entries()) {
      const ref = refs[index];
      const writeData = operation.preserveSourceLocalRevisions
        ? operation.source?.data
        : rebaseLocalRevisionFields(operation.collection, operation.source?.data, operation.target?.data);
      if (operation.action === 'create') transaction.create(ref, writeData);
      else if (operation.action === 'update') transaction.set(ref, writeData);
      else if (operation.action === 'delete') transaction.delete(ref);
      else throw new SyncError('INVALID_WRITE_OPERATION', `Unsupported Firestore operation ${operation.action}`);
    }
  });
}

export async function assertNoVocabularyPoolTombstoneCollisions(plan, targetResource) {
  assertWriteBoundary(targetResource?.projectId, 'vocabulary pool tombstone preflight');
  assertFirestoreResource(targetResource, TARGET_PROJECT_ID, 'Target');
  const poolOperations = operationsByCollection(plan, 'vocabulary_pools').filter(
    operation => operation.action !== 'delete'
  );
  if (poolOperations.length === 0) return;

  await targetResource.db.runTransaction(async transaction => {
    const refs = poolOperations.map(operation =>
      targetResource.db.collection('deleted_vocabulary_pools').doc(operation.id)
    );
    const snapshots = await transaction.getAll(...refs);
    const collisions = poolOperations.filter((_, index) => snapshots[index].exists).map(operation => operation.id);
    if (collisions.length > 0) {
      throw new SyncError(
        'VOCABULARY_POOL_TOMBSTONE_COLLISION',
        `Refusing to recreate archived vocabulary ${collisions.length === 1 ? 'pool' : 'pools'} ${collisions.join(', ')}; explicitly restore the archive or remap the production pool ID first`,
        { poolIds: collisions }
      );
    }
  });
}

const CONTENT_SYNC_LOCK_COLLECTION = 'content_sync_locks';
const CONTENT_SYNC_LOCK_ID = 'prod-content-to-dev';
const VOCABULARY_CONTENT_STATE_COLLECTION = 'vocabulary_content_state';
const VOCABULARY_CONTENT_STATE_ID = 'global';
const RECOVERY_ATTEMPT_LEASE_MS = 24 * 60 * 60 * 1000;
const PRIMARY_SYNC_LOCK_LEASE_MS = 24 * 60 * 60 * 1000;

export function withoutContentSyncOperationalState(state) {
  const excludedCollections = { ...(state.excludedCollections ?? {}) };
  const remainingLocks = (excludedCollections[CONTENT_SYNC_LOCK_COLLECTION] ?? []).filter(
    record => record.id !== CONTENT_SYNC_LOCK_ID
  );
  if (remainingLocks.length > 0) excludedCollections[CONTENT_SYNC_LOCK_COLLECTION] = remainingLocks;
  else delete excludedCollections[CONTENT_SYNC_LOCK_COLLECTION];
  const remainingContentState = (excludedCollections[VOCABULARY_CONTENT_STATE_COLLECTION] ?? []).filter(
    record => record.id !== VOCABULARY_CONTENT_STATE_ID
  );
  if (remainingContentState.length > 0)
    excludedCollections[VOCABULARY_CONTENT_STATE_COLLECTION] = remainingContentState;
  else delete excludedCollections[VOCABULARY_CONTENT_STATE_COLLECTION];
  return { ...state, excludedCollections };
}

export async function acquireContentSyncLock(
  targetResource,
  ownerId,
  { runId = ownerId, now = Date.now(), leaseMs = PRIMARY_SYNC_LOCK_LEASE_MS } = {}
) {
  assertWriteBoundary(targetResource?.projectId, 'content sync lock');
  assertFirestoreResource(targetResource, TARGET_PROJECT_ID, 'Target');
  if (!ownerId) throw new SyncError('INVALID_SYNC_LOCK_OWNER', 'A unique sync lock owner is required');
  const ref = targetResource.db.collection(CONTENT_SYNC_LOCK_COLLECTION).doc(CONTENT_SYNC_LOCK_ID);
  await targetResource.db.runTransaction(async transaction => {
    const current = await transaction.getAll(ref);
    const currentData = current[0].exists ? (current[0].data?.() ?? {}) : {};
    const leaseExpiresAt = Date.parse(String(currentData.leaseExpiresAt ?? ''));
    const reclaimable =
      current[0].exists &&
      currentData.manifestDurable !== true &&
      Number.isFinite(leaseExpiresAt) &&
      leaseExpiresAt <= now;
    if (current[0].exists && !reclaimable)
      throw new SyncError('SYNC_ALREADY_RUNNING', 'Another production content sync is already running');
    const data = {
      ownerId,
      runId,
      manifestDurable: false,
      createdAt: new Date(now).toISOString(),
      leaseExpiresAt: new Date(now + leaseMs).toISOString(),
      processId: process.pid,
    };
    if (current[0].exists) transaction.set(ref, data);
    else transaction.create(ref, data);
  });
}

export async function markContentSyncLockManifestDurable(targetResource, ownerId, runId) {
  assertWriteBoundary(targetResource?.projectId, 'content sync manifest lock');
  assertFirestoreResource(targetResource, TARGET_PROJECT_ID, 'Target');
  const ref = targetResource.db.collection(CONTENT_SYNC_LOCK_COLLECTION).doc(CONTENT_SYNC_LOCK_ID);
  await targetResource.db.runTransaction(async transaction => {
    const current = (await transaction.getAll(ref))[0];
    if (!current.exists || current.data()?.ownerId !== ownerId || current.data()?.runId !== runId)
      throw new SyncError('SYNC_LOCK_OWNERSHIP_LOST', 'Cannot arm a sync lock owned by another run');
    transaction.set(ref, { ...current.data(), manifestDurable: true, manifestDurableAt: new Date().toISOString() });
  });
}

export function emitApplyRecoveryAuthority(
  { runId, rollbackToken },
  write = value => {
    process.stderr.write(value);
  }
) {
  write(
    `${JSON.stringify({
      event: 'sync-rollback-authority',
      runId,
      rollbackToken,
      warning: 'Store this token securely now; it is required for rollback and is not stored.',
    })}\n`
  );
}

export async function releaseContentSyncLock(targetResource, ownerId) {
  assertWriteBoundary(targetResource?.projectId, 'content sync unlock');
  assertFirestoreResource(targetResource, TARGET_PROJECT_ID, 'Target');
  if (!ownerId) throw new SyncError('INVALID_SYNC_LOCK_OWNER', 'The sync lock owner is required for release');
  const ref = targetResource.db.collection(CONTENT_SYNC_LOCK_COLLECTION).doc(CONTENT_SYNC_LOCK_ID);
  const releaseOnce = () =>
    targetResource.db.runTransaction(async transaction => {
      const current = await transaction.getAll(ref);
      if (!current[0].exists) return;
      if (current[0].data()?.ownerId !== ownerId)
        throw new SyncError('SYNC_LOCK_OWNERSHIP_LOST', 'Refusing to release a sync lock owned by another process');
      transaction.delete(ref);
    });
  try {
    await releaseOnce();
  } catch (firstError) {
    if (firstError instanceof SyncError && firstError.code === 'SYNC_LOCK_OWNERSHIP_LOST') throw firstError;
    // Firestore may commit the delete and lose the response. Retrying is safe:
    // a missing lock is success, and a replacement owner is never deleted.
    try {
      await releaseOnce();
    } catch (retryError) {
      // A different owner can only acquire after our original lock disappeared;
      // never delete it, but treat our prior ambiguous delete as complete.
      if (retryError instanceof SyncError && retryError.code === 'SYNC_LOCK_OWNERSHIP_LOST') return;
      throw retryError;
    }
  }
}

export async function finalizeApplyLock({ mutationStarted, publishRevision, releaseLock }) {
  if (mutationStarted) await publishRevision();
  await releaseLock();
}

export async function claimContentSyncRecoveryLock(
  targetResource,
  expectedOwnerId,
  nextOwnerId,
  { allowMissing = false, attemptId = '', now = Date.now(), leaseMs = RECOVERY_ATTEMPT_LEASE_MS } = {}
) {
  assertWriteBoundary(targetResource?.projectId, 'content sync recovery lock');
  assertFirestoreResource(targetResource, TARGET_PROJECT_ID, 'Target');
  if ((!expectedOwnerId && !allowMissing) || !nextOwnerId || !attemptId)
    throw new SyncError('INVALID_SYNC_LOCK_OWNER', 'Recovery requires expected, replacement, and attempt owners');
  const ref = targetResource.db.collection(CONTENT_SYNC_LOCK_COLLECTION).doc(CONTENT_SYNC_LOCK_ID);
  await targetResource.db.runTransaction(async transaction => {
    const current = (await transaction.getAll(ref))[0];
    const currentOwnerId = current.exists ? current.data()?.ownerId : null;
    if (!current.exists && !allowMissing)
      throw new SyncError('SYNC_LOCK_OWNERSHIP_LOST', 'The retained recovery lock is missing');
    if (current.exists && currentOwnerId !== expectedOwnerId && currentOwnerId !== nextOwnerId)
      throw new SyncError('SYNC_LOCK_OWNERSHIP_LOST', 'Recovery lock is owned by another process');
    const currentData = current.exists ? (current.data?.() ?? {}) : {};
    const leaseExpiresAt = Date.parse(String(currentData.attemptLeaseExpiresAt ?? ''));
    if (
      currentOwnerId === nextOwnerId &&
      currentData.activeAttemptId &&
      currentData.activeAttemptId !== attemptId &&
      (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt > now)
    ) {
      throw new SyncError('SYNC_ALREADY_RUNNING', 'Another rollback recovery attempt is still active');
    }
    const data = {
      ...currentData,
      ownerId: nextOwnerId,
      recoveredFromOwnerId: expectedOwnerId,
      activeAttemptId: attemptId,
      attemptLeaseExpiresAt: new Date(now + leaseMs).toISOString(),
      createdAt: currentData.createdAt ?? new Date(now).toISOString(),
    };
    if (current.exists) transaction.set(ref, data, { merge: true });
    else transaction.create(ref, data);
  });
}

export async function releaseContentSyncRecoveryAttempt(targetResource, ownerId, attemptId) {
  assertWriteBoundary(targetResource?.projectId, 'content sync recovery attempt release');
  assertFirestoreResource(targetResource, TARGET_PROJECT_ID, 'Target');
  if (!ownerId || !attemptId)
    throw new SyncError('INVALID_SYNC_LOCK_OWNER', 'Recovery attempt release requires owner and attempt IDs');
  const ref = targetResource.db.collection(CONTENT_SYNC_LOCK_COLLECTION).doc(CONTENT_SYNC_LOCK_ID);
  await targetResource.db.runTransaction(async transaction => {
    const current = (await transaction.getAll(ref))[0];
    if (!current.exists) return;
    const data = current.data?.() ?? {};
    if (data.ownerId !== ownerId || data.activeAttemptId !== attemptId)
      throw new SyncError('SYNC_LOCK_OWNERSHIP_LOST', 'Refusing to release another rollback attempt lease');
    transaction.set(ref, { ...data, activeAttemptId: null, attemptLeaseExpiresAt: null });
  });
}

export async function advanceVocabularyContentRevision(targetResource, operationId) {
  assertWriteBoundary(targetResource?.projectId, 'vocabulary content revision');
  assertFirestoreResource(targetResource, TARGET_PROJECT_ID, 'Target');
  if (!operationId) throw new SyncError('INVALID_REVISION_OPERATION', 'A maintenance operation ID is required');
  const ref = targetResource.db.collection(VOCABULARY_CONTENT_STATE_COLLECTION).doc(VOCABULARY_CONTENT_STATE_ID);
  await targetResource.db.runTransaction(async transaction => {
    const snapshot = (await transaction.getAll(ref))[0];
    const current = snapshot.exists ? (snapshot.data?.() ?? {}) : {};
    if (current.lastMaintenanceOperationId === operationId) return;
    const revision = Number.isSafeInteger(current.revision) && current.revision >= 0 ? current.revision + 1 : 1;
    const data = {
      revision,
      lastMaintenanceOperationId: operationId,
      updatedAt: new Date().toISOString(),
    };
    if (snapshot.exists) transaction.set(ref, data, { merge: true });
    else transaction.create(ref, data);
  });
}

function isFirestoreTransactionTooBig(error) {
  const code = error && typeof error === 'object' ? error.code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return Number(code) === 3 && /transaction too big/i.test(message);
}

async function executeFirestoreChunkWithSplit(targetResource, operations) {
  try {
    await executeFirestoreChunk(targetResource, operations);
  } catch (error) {
    if (!isFirestoreTransactionTooBig(error) || operations.length <= 1) throw error;
    const midpoint = Math.ceil(operations.length / 2);
    await executeFirestoreChunkWithSplit(targetResource, operations.slice(0, midpoint));
    await executeFirestoreChunkWithSplit(targetResource, operations.slice(midpoint));
  }
}

export async function executeFirestoreOperations(targetResource, operations) {
  assertWriteBoundary(targetResource?.projectId, 'Firestore');
  assertFirestoreResource(targetResource, TARGET_PROJECT_ID, 'Target');
  for (const operation of operations) {
    if (!MIRRORED_COLLECTIONS.includes(operation.collection))
      throw new SyncError('WRITE_SCOPE_VIOLATION', `Refusing to write collection ${operation.collection}`);
  }
  for (const chunk of chunkOperations(operations)) {
    await executeFirestoreChunkWithSplit(targetResource, chunk);
  }
}

export function assertLockedTargetMatchesPlan(plan, lockedTarget) {
  const pendingWordDeletion = (lockedTarget.collections?.vocabulary_words_v5 ?? []).find(
    record => record.data?._deletionPending
  );
  if (pendingWordDeletion) {
    throw new SyncError(
      'PENDING_WORD_DELETION',
      `Development word ${pendingWordDeletion.id} is still being removed from vocabulary pools`
    );
  }
  const plannedTargetFingerprint = buildMirroredContentFingerprint(plan.targetState);
  const lockedTargetFingerprint = buildMirroredContentFingerprint(withoutContentSyncOperationalState(lockedTarget));
  if (lockedTargetFingerprint !== plannedTargetFingerprint) {
    throw new SyncError('PLAN_STALE', 'Development mirrored content changed before the apply lock was acquired', {
      plannedTargetFingerprint,
      lockedTargetFingerprint,
    });
  }
  if (plan.sourceState) {
    const lockedPlan = createPlan(plan.sourceState, withoutContentSyncOperationalState(lockedTarget));
    if (lockedPlan.planHash !== plan.planHash) {
      throw new SyncError('PLAN_STALE', 'Development fixture dependencies changed before the apply lock was acquired', {
        plannedPlanHash: plan.planHash,
        lockedPlanHash: lockedPlan.planHash,
      });
    }
  }
}

export async function applyPlan(plan, resources, suppliedPlanHash) {
  assertPlanHash(plan.planHash, suppliedPlanHash);
  const runId = createRunId();
  const syncLockOwner = `sync:${runId}:${randomBytes(16).toString('hex')}`;
  await acquireContentSyncLock(resources.target, syncLockOwner, { runId });
  let syncLockHeld = true;
  let backupBucket;
  const rollbackToken = createRollbackToken();
  const revisionOperationId = `sync:${runId}`;
  let revisionAdvanced = false;
  let appliedManifestPersisted = false;
  let mutationStarted = false;
  let recoveryRequired = false;
  let runManifest;
  try {
    const lockedTarget = withoutContentSyncOperationalState(await captureTargetState(resources.target));
    assertLockedTargetMatchesPlan(plan, lockedTarget);
    await assertNoVocabularyPoolTombstoneCollisions(plan, resources.target);
    backupBucket = await ensureBackupBucket(resources.backupStorage, { allowProvision: true });
    const beforeImages = await backupBeforeImages(plan, resources.target, backupBucket, runId);
    runManifest = runManifestForBackup(plan, runId, beforeImages, rollbackToken, syncLockOwner);
    await updateRunManifest(backupBucket, runManifest);
    emitApplyRecoveryAuthority({ runId, rollbackToken });
    await markContentSyncLockManifestDurable(resources.target, syncLockOwner, runId);

    mutationStarted = true;
    await executeStorageOperations(
      resources.source,
      resources.target,
      affectedStorageOperations(plan).filter(operation => ['create', 'update'].includes(operation.action))
    );
    await executeFirestoreOperations(
      resources.target,
      operationsByCollection(plan, 'vocabulary_words_v5').filter(operation => operation.action !== 'delete')
    );
    await executeFirestoreOperations(
      resources.target,
      operationsByCollection(plan, 'vocabulary_pools').filter(operation => operation.action !== 'delete')
    );
    await executeFirestoreOperations(
      resources.target,
      operationsByCollection(plan, 'lessons').filter(operation => operation.action !== 'delete')
    );
    await executeFirestoreOperations(
      resources.target,
      plan.firestoreOperations.filter(
        operation => operation.action === 'delete' && operation.collection !== 'learningPaths'
      )
    );
    await executeStorageOperations(
      resources.source,
      resources.target,
      affectedStorageOperations(plan).filter(operation => operation.action === 'delete')
    );
    await executeFirestoreOperations(resources.target, operationsByCollection(plan, 'learningPaths'));

    const [sourceAfter, capturedTargetAfter] = await Promise.all([
      captureSourceState(resources.source),
      captureTargetState(resources.target),
    ]);
    const targetAfter = withoutContentSyncOperationalState(capturedTargetAfter);
    const sourceAfterManifest = buildManifest(sourceAfter);
    const targetAfterManifest = buildManifest(targetAfter);
    const targetAfterContentFingerprint = buildContentFingerprint(targetAfter);
    const targetAfterMirroredContentFingerprint = buildMirroredContentFingerprint(targetAfter);
    const excludedUnchanged = buildExcludedFingerprint(targetAfter) === runManifest.target.preSyncExcludedFingerprint;
    const authUnchanged = sha256(targetAfter.authFingerprint) === sha256(runManifest.target.preSyncAuthFingerprint);
    if (targetAfterMirroredContentFingerprint !== runManifest.target.expectedPostSyncMirroredContentFingerprint) {
      throw new SyncError(
        'POST_SYNC_VERIFY_FAILED',
        'Development mirrored content does not match the expected post-sync fingerprint',
        {
          expectedPostSyncMirroredContentFingerprint: runManifest.target.expectedPostSyncMirroredContentFingerprint,
          actualPostSyncMirroredContentFingerprint: targetAfterMirroredContentFingerprint,
          excludedUnchanged,
          authUnchanged,
        }
      );
    }
    runManifest.status = 'applied';
    runManifest.sourceAfter = {
      manifestHash: sourceAfterManifest.manifestHash,
      contentFingerprint: buildContentFingerprint(sourceAfter),
    };
    runManifest.sourceDriftAfterRun = {
      detected: sourceAfterManifest.manifestHash !== plan.sourceManifest.manifestHash,
      beforeManifestHash: plan.sourceManifest.manifestHash,
      afterManifestHash: sourceAfterManifest.manifestHash,
    };
    runManifest.target.postSyncManifestHash = targetAfterManifest.manifestHash;
    runManifest.target.postSyncContentFingerprint = targetAfterContentFingerprint;
    runManifest.target.postSyncMirroredContentFingerprint = targetAfterMirroredContentFingerprint;
    runManifest.target.postSyncExcludedFingerprint = buildExcludedFingerprint(targetAfter);
    runManifest.target.postSyncAuthFingerprint = targetAfter.authFingerprint;
    await publishAppliedRun({
      persistAppliedManifest: async () => {
        await updateRunManifest(backupBucket, runManifest);
        appliedManifestPersisted = true;
      },
      publishRevision: async () => {
        await advanceVocabularyContentRevision(resources.target, revisionOperationId);
        revisionAdvanced = true;
      },
      releaseLock: async () => {
        await releaseContentSyncLock(resources.target, syncLockOwner);
        syncLockHeld = false;
      },
    });
    return {
      ok: true,
      mode: 'apply',
      ...redactRunManifestForOutput(runManifest),
      rollbackAuthorityEmitted: true,
      warning: 'The rollback token was emitted before mutation and is not repeated or stored.',
    };
  } catch (error) {
    if (runManifest) {
      recoveryRequired = mutationStarted || runManifest.status === 'applied';
      runManifest.status = recoveryRequired ? 'recovery-required' : 'failed';
      runManifest.failure = { code: error.code ?? 'APPLY_FAILURE', message: error.message };
      try {
        await updateRunManifest(backupBucket, runManifest);
      } catch {
        // Preserve the original error; all mirror writes already failed closed.
      }
    }
    if (recoveryRequired) {
      throw new SyncError('APPLY_RECOVERY_REQUIRED', 'Apply stopped after mutation; rollback recovery is required', {
        runId,
        rollbackAuthorityEmitted: true,
        originalCode: error.code ?? 'APPLY_FAILURE',
      });
    }
    if (error instanceof SyncError) throw error;
    throw new SyncError('APPLY_FAILURE', error instanceof Error ? error.message : String(error));
  } finally {
    if (syncLockHeld) {
      if (recoveryRequired || (runManifest?.status === 'applied' && !appliedManifestPersisted)) {
        // A recoverable partial/apply transition retains its owned lock.
      } else {
        try {
          await finalizeApplyLock({
            mutationStarted,
            publishRevision: async () => {
              if (!revisionAdvanced) {
                await advanceVocabularyContentRevision(resources.target, revisionOperationId);
                revisionAdvanced = true;
              }
            },
            releaseLock: async () => {
              await releaseContentSyncLock(resources.target, syncLockOwner);
              syncLockHeld = false;
            },
          });
        } catch {
          // Preserve the original failure. A post-mutation revision failure
          // retains the lock; a no-mutation path attempts only idempotent unlock.
        }
      }
    }
  }
}

function targetManifestCheck(targetState, runManifest) {
  targetState = withoutContentSyncOperationalState(targetState);
  const currentManifest = buildManifest(targetState);
  const currentAuthHash = sha256(targetState.authFingerprint);
  const recordedAuthHash = sha256(runManifest.target.preSyncAuthFingerprint);
  const currentContentFingerprint = buildContentFingerprint(targetState);
  const currentMirroredContentFingerprint = buildMirroredContentFingerprint(targetState);
  return {
    currentManifest,
    currentContentFingerprint,
    currentMirroredContentFingerprint,
    exactPostSyncMatch: currentManifest.manifestHash === runManifest.target.postSyncManifestHash,
    expectedPostSyncContentMatch: currentContentFingerprint === runManifest.target.expectedPostSyncContentFingerprint,
    expectedPostSyncMirroredContentMatch:
      currentMirroredContentFingerprint ===
      (runManifest.target.expectedPostSyncMirroredContentFingerprint ??
        runManifest.target.expectedPostSyncContentFingerprint),
    excludedUnchanged: buildExcludedFingerprint(targetState) === runManifest.target.preSyncExcludedFingerprint,
    authUnchanged: currentAuthHash === recordedAuthHash,
  };
}

function documentRecordsByPath(targetState) {
  const currentDocuments = new Map();
  for (const collection of MIRRORED_COLLECTIONS) {
    for (const record of targetState.collections?.[collection] ?? [])
      currentDocuments.set(`${collection}/${record.id}`, record);
  }
  return currentDocuments;
}

export function upgradeStorageRecoveryContentHashes(runManifest, targetState) {
  const currentStorage = new Map((targetState.storage ?? []).map(record => [record.name, record]));
  const beforeEntries = new Map((runManifest.beforeImages?.storageEntries ?? []).map(entry => [entry.name, entry]));
  for (const operation of runManifest.plan?.storage?.operations ?? []) {
    const targetContentHash = beforeEntries.get(operation.name)?.contentHash ?? null;
    if (!Object.prototype.hasOwnProperty.call(operation, 'targetContentHash'))
      operation.targetContentHash = targetContentHash;
    if (!Object.prototype.hasOwnProperty.call(operation, 'sourceContentHash')) {
      const currentRecord = currentStorage.get(operation.name);
      const currentContentHash = currentRecord?.contentHash ?? null;
      // In a partial retry, a resource already at its before-image does not
      // need its unknown legacy post hash. Every resource still at post-state
      // may be upgraded only when its exact object hash still matches the
      // source hash recorded by the reviewed schema-v3 plan. Never bless
      // arbitrary current bytes as an expected post-sync state.
      if (currentContentHash === targetContentHash) operation.sourceContentHash = null;
      else if (currentRecord && operation.sourceHash && currentRecord.hash === operation.sourceHash)
        operation.sourceContentHash = currentContentHash;
      else if (!currentRecord && !operation.sourceHash) operation.sourceContentHash = null;
    }
  }
  return runManifest;
}

export function assertRollbackAffectedResourcesRestored(runManifest, targetState) {
  const currentDocuments = documentRecordsByPath(targetState);
  const currentStorage = new Map((targetState.storage ?? []).map(record => [record.name, record]));
  for (const entry of runManifest.beforeImages?.firestoreEntries ?? []) {
    const current = currentDocuments.get(entry.path);
    const currentHash = current ? (current.exactDataHash ?? dataHash(current.data)) : null;
    const expectedHash = entry.exists ? entry.dataHash : null;
    if (currentHash !== expectedHash)
      throw new SyncError('ROLLBACK_VERIFY_FAILED', `Rollback did not restore ${entry.path}`, {
        path: entry.path,
      });
  }
  for (const entry of runManifest.beforeImages?.storageEntries ?? []) {
    const currentHash = currentStorage.get(entry.name)?.contentHash ?? null;
    const expectedHash = entry.exists ? entry.contentHash : null;
    if (currentHash !== expectedHash)
      throw new SyncError('ROLLBACK_VERIFY_FAILED', `Rollback did not restore ${entry.name}`, {
        name: entry.name,
      });
  }
}

/**
 * Protected dev fixtures may start referencing mirrored content after a sync.
 * A rollback must not delete or restore those newly required dependencies.
 */
export function assertRollbackProtectedDependenciesPreserved(
  targetState,
  firestoreOperations,
  storageOperations = []
) {
  const collections = targetState.collections ?? {};
  const excluded = targetState.excludedCollections ?? {};
  const records = name => [...(collections[name] ?? []), ...(excluded[name] ?? [])];
  const operations = new Map(
    firestoreOperations.map(operation => [`${operation.collection}/${operation.id}`, operation])
  );
  const requiredLessonIds = new Set();
  const protectedLessonIds = new Set();
  const requiredPoolIds = new Set();
  const requiredWordIds = new Set();

  for (const membership of records('practiceCategoryMemberships')) {
    const lessonId = membership.data?.lessonId;
    if (typeof lessonId === 'string' && lessonId) requiredLessonIds.add(lessonId);
  }
  const lessons = new Map(records('lessons').map(record => [record.id, record]));
  for (const id of requiredLessonIds) protectedLessonIds.add(id);
  for (const record of records('lessons')) {
    if (record.data?.kind !== 'test') continue;
    const operation = operations.get(`lessons/${record.id}`);
    if (!operation || operation.action === 'preserve') protectedLessonIds.add(record.id);
  }
  const protectedDocuments = [
    ...[...requiredLessonIds].map(id => lessons.get(id)).filter(Boolean),
    ...records('lessons').filter(record => {
      if (record.data?.kind !== 'test') return false;
      const operation = operations.get(`lessons/${record.id}`);
      return !operation || operation.action === 'preserve';
    }),
    ...records('testVersions'),
    ...records('testVersionDrafts'),
  ];
  for (const record of protectedDocuments) {
    for (const poolId of collectPoolIds(record.data)) requiredPoolIds.add(poolId);
    for (const wordId of collectWordIds(record.data)) requiredWordIds.add(wordId);
  }
  const pools = new Map(records('vocabulary_pools').map(record => [record.id, record]));
  for (const poolId of requiredPoolIds) {
    const pool = pools.get(poolId);
    for (const wordId of pool?.data?.wordDocIds ?? []) {
      if (typeof wordId === 'string' && wordId) requiredWordIds.add(wordId);
    }
  }

  const assertUnchanged = (collection, id, dependencyKind) => {
    const operation = operations.get(`${collection}/${id}`);
    if (operation && operation.action !== 'preserve') {
      throw new SyncError(
        'ROLLBACK_PROTECTED_DEPENDENCY',
        `Rollback would ${operation.action} ${collection}/${id}, which current protected dev ${dependencyKind} requires`,
        { collection, id, action: operation.action, dependencyKind }
      );
    }
  };
  for (const id of requiredLessonIds) assertUnchanged('lessons', id, 'practice-category data');
  for (const id of requiredPoolIds) assertUnchanged('vocabulary_pools', id, 'test data');
  for (const id of requiredWordIds) assertUnchanged('vocabulary_words_v5', id, 'test data');
  for (const operation of storageOperations) {
    if (operation.action === 'preserve') continue;
    const lessonId = lessonIdFromStorageName(operation.name);
    if (!lessonId || !protectedLessonIds.has(lessonId)) continue;
    throw new SyncError(
      'ROLLBACK_PROTECTED_DEPENDENCY',
      `Rollback would ${operation.action} ${operation.name}, which current protected dev lesson data requires`,
      { name: operation.name, lessonId, action: operation.action, dependencyKind: 'lesson data' }
    );
  }
}

export function rollbackPlan(runManifest, targetState) {
  const current = targetManifestCheck(targetState, runManifest);
  const partialRecovery = new Set([
    'backed-up',
    'recovery-required',
    'rollback-in-progress',
    'rollback-recovery-required',
  ]).has(runManifest.status);
  const currentDocuments = documentRecordsByPath(targetState);
  const currentStorage = new Map((targetState.storage ?? []).map(record => [record.name, record]));
  const validateAffectedState = partialRecovery || !current.exactPostSyncMatch;
  if (validateAffectedState) {
    const firestoreAudits = new Map(
      (runManifest.plan?.firestore?.operations ?? []).map(operation => [
        `${operation.collection}/${operation.id}`,
        operation,
      ])
    );
    for (const entry of runManifest.beforeImages?.firestoreEntries ?? []) {
      const operation = firestoreAudits.get(entry.path);
      const currentDocument = currentDocuments.get(entry.path);
      const currentHash = currentDocument ? (currentDocument.hash ?? dataHash(currentDocument.data)) : null;
      const allowedHashes = new Set([operation?.sourceHash ?? null, operation?.targetHash ?? entry.syncHash ?? null]);
      if (!allowedHashes.has(currentHash))
        throw new SyncError('ROLLBACK_PRECONDITION_FAILED', `Recovery document ${entry.path} has unrelated drift`, {
          path: entry.path,
        });
    }
    const storageAudits = new Map(
      (runManifest.plan?.storage?.operations ?? []).map(operation => [operation.name, operation])
    );
    for (const entry of runManifest.beforeImages?.storageEntries ?? []) {
      const operation = storageAudits.get(entry.name);
      const currentHash = currentStorage.get(entry.name)?.contentHash ?? null;
      const allowedHashes = new Set([
        operation?.sourceContentHash ?? null,
        operation?.targetContentHash ?? entry.contentHash ?? null,
      ]);
      if (!allowedHashes.has(currentHash))
        throw new SyncError('ROLLBACK_PRECONDITION_FAILED', `Recovery object ${entry.name} has unrelated drift`, {
          name: entry.name,
        });
    }
  }
  const firestoreOperations = (runManifest.beforeImages?.firestoreEntries ?? []).map(entry => ({
    kind: 'firestore',
    collection: entry.collection,
    id: entry.id,
    action: entry.exists
      ? currentDocuments.has(entry.path)
        ? 'restore'
        : 'create'
      : currentDocuments.has(entry.path)
        ? 'delete'
        : 'preserve',
    path: entry.path,
    backupPath: entry.backupPath,
  }));
  const storageOperations = (runManifest.beforeImages?.storageEntries ?? []).map(entry => ({
    kind: 'storage',
    name: entry.name,
    action: entry.exists
      ? currentStorage.has(entry.name)
        ? 'restore'
        : 'create'
      : currentStorage.has(entry.name)
        ? 'delete'
        : 'preserve',
    backupPath: entry.backupPath,
    hash: entry.hash ?? null,
    contentHash: entry.contentHash ?? null,
    bytesHash: entry.bytesHash ?? null,
  }));
  assertRollbackProtectedDependenciesPreserved(targetState, firestoreOperations, storageOperations);
  return {
    mode: 'rollback-dry-run',
    readOnly: true,
    runId: runManifest.runId,
    status: runManifest.status,
    precondition: {
      expectedPostSyncManifestHash: runManifest.target.postSyncManifestHash,
      currentManifestHash: current.currentManifest.manifestHash,
      matched: current.exactPostSyncMatch || validateAffectedState,
      scope: current.exactPostSyncMatch ? 'exact-post-sync' : 'affected-resources-only',
      protectedDataDriftObserved: !current.excludedUnchanged,
      authDriftObserved: !current.authUnchanged,
    },
    firestore: {
      operations: firestoreOperations,
      summary: summarizeOperations(
        firestoreOperations.map(operation => ({ action: operation.action === 'restore' ? 'update' : operation.action }))
      ),
    },
    storage: {
      operations: storageOperations,
      summary: summarizeOperations(
        storageOperations.map(operation => ({ action: operation.action === 'restore' ? 'update' : operation.action }))
      ),
    },
    applyRequires: '--apply --rollback-token <token>',
  };
}

export function assertFirestoreBeforeImageIntegrity(entry, decodedData) {
  if (!entry.exists) return;
  const actualDataHash = dataHash(decodedData);
  if (!entry.dataHash || actualDataHash !== entry.dataHash) {
    throw new SyncError('BACKUP_INTEGRITY_FAILED', `Firestore before-image integrity check failed for ${entry.path}`, {
      path: entry.path,
      expectedDataHash: entry.dataHash ?? null,
      actualDataHash,
    });
  }
}

export function assertStorageBeforeImageIntegrity(entry, metadata, bytes) {
  if (!entry.exists) return;
  const actualObjectHash = storageObjectHash(metadata);
  const actualContentHash = storageContentHash(metadata);
  const actualBytesHash = byteHash(bytes);
  const valid =
    Boolean(entry.hash) &&
    Boolean(entry.contentHash) &&
    Boolean(entry.bytesHash) &&
    actualObjectHash === entry.hash &&
    actualContentHash === entry.contentHash &&
    actualBytesHash === entry.bytesHash;
  if (!valid) {
    throw new SyncError('BACKUP_INTEGRITY_FAILED', `Storage before-image integrity check failed for ${entry.name}`, {
      name: entry.name,
      expectedHash: entry.hash ?? null,
      actualHash: actualObjectHash,
      expectedContentHash: entry.contentHash ?? null,
      actualContentHash,
      expectedBytesHash: entry.bytesHash ?? null,
      actualBytesHash,
    });
  }
}

export async function executeStorageRollbackOperations(targetResource, backupBucket, operations, currentStorage) {
  assertWriteBoundary(targetResource?.projectId, 'Storage rollback');
  assertStorageResource(targetResource, TARGET_PROJECT_ID, TARGET_STORAGE_BUCKET, 'Rollback target');
  assertBackupBucketHandle(backupBucket, 'Rollback backup');
  const prepared = [];
  for (const operation of operations) {
    if (!operation.name.startsWith(LESSONS_PREFIX) || operation.name === STORAGE_FOLDER_MARKER_NAME) {
      throw new SyncError('WRITE_SCOPE_VIOLATION', `Refusing to write Storage object ${operation.name}`);
    }
    if (operation.action === 'preserve') continue;
    const current = currentStorage.get(operation.name);
    if (operation.action === 'delete') {
      if (!current?.generation || !current?.metageneration)
        throw new SyncError(
          'ROLLBACK_PRECONDITION_FAILED',
          `Current Storage object ${operation.name} is missing generation/metageneration`
        );
      prepared.push({ operation, current, targetFile: targetResource.bucket.file(operation.name) });
      continue;
    }
    if (!operation.backupPath) throw new SyncError('INVALID_BACKUP', `Missing Storage backup for ${operation.name}`);
    if (current?.generation && !current?.metageneration)
      throw new SyncError(
        'ROLLBACK_PRECONDITION_FAILED',
        `Current Storage object ${operation.name} is missing metageneration`
      );
    const metadata = await readBackupJson(backupBucket, operation.backupPath.replace(/\.bin$/, '.json'));
    const [bytes] = await backupBucket.file(operation.backupPath).download(storageDownloadOptions(metadata));
    assertStorageBeforeImageIntegrity(operation, metadata, bytes);
    prepared.push({ operation, current, bytes, metadata, targetFile: targetResource.bucket.file(operation.name) });
  }
  for (const item of prepared) {
    const { operation, current, targetFile } = item;
    if (operation.action === 'delete') {
      await targetFile.delete({
        preconditionOpts: { ifGenerationMatch: current.generation, ifMetagenerationMatch: current.metageneration },
      });
      continue;
    }
    await targetFile.save(item.bytes, {
      resumable: false,
      metadata: {
        contentType: item.metadata.contentType ?? 'application/octet-stream',
        cacheControl: item.metadata.cacheControl ?? undefined,
        contentEncoding: item.metadata.contentEncoding ?? undefined,
        contentDisposition: item.metadata.contentDisposition ?? undefined,
        contentLanguage: item.metadata.contentLanguage ?? undefined,
        metadata: item.metadata.metadata ?? {},
      },
      preconditionOpts: current?.generation
        ? { ifGenerationMatch: current.generation, ifMetagenerationMatch: current.metageneration }
        : { ifGenerationMatch: 0 },
    });
  }
}

export async function applyRollback(runManifest, _targetState, resources, rollbackToken) {
  const allowedStatuses = new Set([
    'applied',
    'backed-up',
    'recovery-required',
    'rollback-in-progress',
    'rollback-recovery-required',
  ]);
  if (!allowedStatuses.has(runManifest.status))
    throw new SyncError('ROLLBACK_NOT_ALLOWED', `Run ${runManifest.runId} is not in applied status`);
  if (!rollbackToken || sha256(rollbackToken) !== runManifest.rollbackTokenHash)
    throw new SyncError('ROLLBACK_TOKEN_REQUIRED', 'The exact rollback token from the apply result is required');
  // Recovery ownership is stable for the run. If Firestore accepts this owner
  // but the cross-service manifest update fails, the same authorized retry can
  // recognize and reuse the lock without trusting a stale manifest owner.
  const syncLockOwner = `rollback-recovery:${runManifest.runId}`;
  const rollbackAttemptId = randomBytes(16).toString('hex');
  const priorStatus = runManifest.status;
  const priorSyncLockOwner = runManifest.syncLockOwner;
  await claimContentSyncRecoveryLock(resources.target, runManifest.syncLockOwner, syncLockOwner, {
    allowMissing: priorStatus === 'applied',
    attemptId: rollbackAttemptId,
  });
  let syncLockHeld = true;
  const revisionOperationId = `${syncLockOwner}:${rollbackAttemptId}:revision`;
  let revisionAdvanced = false;
  let mutationStarted = false;
  let rollbackRecoveryRequired = false;
  let backupBucket;
  try {
    backupBucket = await ensureBackupBucket(resources.backupStorage, { allowProvision: false });
    const targetState = withoutContentSyncOperationalState(await captureTargetState(resources.target));
    upgradeStorageRecoveryContentHashes(runManifest, targetState);
    const plan = rollbackPlan(runManifest, targetState);
    runManifest.status = 'rollback-in-progress';
    runManifest.syncLockOwner = syncLockOwner;
    runManifest.rollbackAttemptStartedAt = new Date().toISOString();
    await updateRunManifest(backupBucket, runManifest);
    const currentStorage = new Map((targetState.storage ?? []).map(record => [record.name, record]));
    const currentDocuments = documentRecordsByPath(targetState);
    const entries = runManifest.beforeImages?.firestoreEntries ?? [];
    const orderedEntries = [...entries].sort((left, right) => {
      const order = { vocabulary_words_v5: 1, vocabulary_pools: 2, lessons: 3, learningPaths: 4 };
      return (
        (order[left.collection] ?? 9) - (order[right.collection] ?? 9) ||
        `${left.collection}/${left.id}`.localeCompare(`${right.collection}/${right.id}`)
      );
    });
    const restoreOperations = [];
    for (const entry of orderedEntries) {
      const current = currentDocuments.get(entry.path);
      if (entry.exists) {
        if (!entry.backupPath) throw new SyncError('INVALID_BACKUP', `Missing Firestore backup for ${entry.path}`);
        const encoded = await readBackupJson(backupBucket, entry.backupPath);
        if (encoded.path !== entry.path || encoded.id !== entry.id || encoded.exists !== true)
          throw new SyncError(
            'BACKUP_INTEGRITY_FAILED',
            `Firestore before-image identity check failed for ${entry.path}`
          );
        const decodedData = decodeFirestoreValue(encoded.data, resources.target.db, {
          Timestamp: AdminTimestamp,
          GeoPoint: AdminGeoPoint,
        });
        assertFirestoreBeforeImageIntegrity(entry, decodedData);
        restoreOperations.push({
          collection: entry.collection,
          id: entry.id,
          action: current ? 'update' : 'create',
          source: { data: decodedData },
          target: current ?? null,
          preserveSourceLocalRevisions: true,
        });
      } else if (current) {
        restoreOperations.push({ collection: entry.collection, id: entry.id, action: 'delete', target: current });
      }
    }
    // Validate every before-image before the first cross-service restore write.
    // Storage rollback performs the same complete preflight for its artifacts.
    mutationStarted = true;
    await executeStorageRollbackOperations(resources.target, backupBucket, plan.storage.operations, currentStorage);
    await executeFirestoreOperations(resources.target, restoreOperations);
    const after = withoutContentSyncOperationalState(await captureTargetState(resources.target));
    assertRollbackAffectedResourcesRestored(runManifest, after);
    const afterContentFingerprint = buildContentFingerprint(after);
    const fullPreSyncContentMatch = afterContentFingerprint === runManifest.target.preSyncContentFingerprint;
    runManifest.status = 'rolled-back';
    runManifest.rolledBackAt = new Date().toISOString();
    runManifest.rollback = {
      contentFingerprint: afterContentFingerprint,
      affectedResourcesRestored: true,
      fullPreSyncContentMatch,
    };
    runManifest.syncLockOwner = null;
    await updateRunManifest(backupBucket, runManifest);
    await advanceVocabularyContentRevision(resources.target, revisionOperationId);
    revisionAdvanced = true;
    await releaseContentSyncLock(resources.target, syncLockOwner);
    syncLockHeld = false;
    return {
      ok: true,
      mode: 'rollback-apply',
      runId: runManifest.runId,
      postRollbackContentFingerprint: afterContentFingerprint,
      affectedResourcesRestored: true,
      fullPreSyncContentMatch,
    };
  } catch (error) {
    rollbackRecoveryRequired = mutationStarted || priorStatus !== 'applied';
    if (!rollbackRecoveryRequired) {
      runManifest.status = priorStatus;
      runManifest.syncLockOwner = priorSyncLockOwner;
      delete runManifest.rollbackAttemptStartedAt;
      delete runManifest.rollbackFailure;
      try {
        backupBucket ??= await ensureBackupBucket(resources.backupStorage, { allowProvision: false });
        await updateRunManifest(backupBucket, runManifest);
      } catch {
        // The in-progress transition may already be durable. Retain the stable
        // lock and publish a recoverable state if a second manifest write works.
        rollbackRecoveryRequired = true;
      }
    }
    if (rollbackRecoveryRequired) {
      runManifest.status = 'rollback-recovery-required';
      runManifest.syncLockOwner = syncLockOwner;
      runManifest.rollbackFailure = { code: error.code ?? 'ROLLBACK_FAILURE', message: error.message };
      try {
        backupBucket ??= await ensureBackupBucket(resources.backupStorage, { allowProvision: false });
        await updateRunManifest(backupBucket, runManifest);
      } catch {
        // Retain the owned lock even if recovery bookkeeping also fails.
      }
      try {
        await releaseContentSyncRecoveryAttempt(resources.target, syncLockOwner, rollbackAttemptId);
      } catch {
        // A crashed/ambiguous attempt remains exclusive until its lease expires.
      }
    }
    throw error;
  } finally {
    if (syncLockHeld) {
      if (!rollbackRecoveryRequired) {
        try {
          if (!revisionAdvanced) {
            await advanceVocabularyContentRevision(resources.target, revisionOperationId);
            revisionAdvanced = true;
          }
          await releaseContentSyncLock(resources.target, syncLockOwner);
        } catch {
          // Keep the lock when revision advancement fails so deletion remains blocked.
        }
      }
    }
  }
}

async function verifyRun(runManifest, resources) {
  if (runManifest.status !== 'applied')
    throw new SyncError('RUN_NOT_APPLIED', `Run ${runManifest.runId} is not in applied status`);
  const [sourceState, targetState] = await Promise.all([
    captureSourceState(resources.source),
    captureTargetState(resources.target),
  ]);
  const current = targetManifestCheck(targetState, runManifest);
  let projected;
  let graphValid = true;
  try {
    projected = validateCurrentTargetState(targetState, {
      preservedLessonIds: new Set(runManifest.plan.fixtureClosure.preservedLessonIds),
      preservedPoolIds: new Set(runManifest.plan.fixtureClosure.preservedPoolIds),
      preservedWordIds: new Set(runManifest.plan.fixtureClosure.preservedWordIds),
      preservedStorageLessonIds: new Set(runManifest.plan.fixtureClosure.preservedStorageLessonIds),
    });
  } catch (error) {
    graphValid = false;
    projected = { error: error instanceof Error ? error.message : String(error) };
  }
  const checks = {
    exactPostSyncManifest: current.exactPostSyncMatch,
    expectedPostSyncContent: current.expectedPostSyncContentMatch,
    mirroredContent: current.expectedPostSyncMirroredContentMatch,
    strictLearningPathAndReferences: graphValid,
    excludedDevDataUnchanged: current.excludedUnchanged,
    authUnchanged: current.authUnchanged,
    controlledStorageChecksums: (targetState.storage ?? []).every(record => Boolean(record.md5Hash || record.crc32c)),
    sourceReadable: Boolean(buildManifest(sourceState).manifestHash),
  };
  const criticalChecks = new Set([
    'mirroredContent',
    'strictLearningPathAndReferences',
    'controlledStorageChecksums',
    'sourceReadable',
  ]);
  const failures = Object.entries(checks)
    .filter(([name, value]) => criticalChecks.has(name) && !value)
    .map(([name]) => name);
  const observations = Object.entries(checks)
    .filter(([name, value]) => !value && !criticalChecks.has(name))
    .map(([name]) => name);
  return {
    ok: failures.length === 0,
    mode: 'verify',
    runId: runManifest.runId,
    checks,
    failures,
    observations,
    currentTargetManifestHash: current.currentManifest.manifestHash,
    currentTargetContentFingerprint: current.currentContentFingerprint,
    currentTargetMirroredContentFingerprint: current.currentMirroredContentFingerprint,
    expectedPostSyncContentFingerprint: runManifest.target.expectedPostSyncContentFingerprint,
    recordedPostSyncManifestHash: runManifest.target.postSyncManifestHash,
    sourceDriftSinceApply: buildManifest(sourceState).manifestHash !== runManifest.sourceAfter?.manifestHash,
    projected,
  };
}

async function createLiveResources() {
  const [appModule, authModule, firestoreModule, gcsModule] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/auth'),
    import('firebase-admin/firestore'),
    import('@google-cloud/storage'),
  ]);
  AdminTimestamp = firestoreModule.Timestamp;
  AdminGeoPoint = firestoreModule.GeoPoint;
  const credential = appModule.applicationDefault();
  const sourceApp = appModule.initializeApp(
    { credential, projectId: SOURCE_PROJECT_ID, storageBucket: SOURCE_STORAGE_BUCKET },
    `sync-prod-content-source-${process.pid}`
  );
  const targetApp = appModule.initializeApp(
    { credential, projectId: TARGET_PROJECT_ID, storageBucket: TARGET_STORAGE_BUCKET },
    `sync-prod-content-target-${process.pid}`
  );
  const sourceStorage = new gcsModule.Storage({ projectId: SOURCE_PROJECT_ID });
  const targetStorage = new gcsModule.Storage({ projectId: TARGET_PROJECT_ID });
  const source = {
    projectId: SOURCE_PROJECT_ID,
    storageBucket: SOURCE_STORAGE_BUCKET,
    db: firestoreModule.getFirestore(sourceApp),
    bucket: sourceStorage.bucket(SOURCE_STORAGE_BUCKET),
    auth: authModule.getAuth(sourceApp),
    app: sourceApp,
  };
  const target = {
    projectId: TARGET_PROJECT_ID,
    storageBucket: TARGET_STORAGE_BUCKET,
    db: firestoreModule.getFirestore(targetApp),
    bucket: targetStorage.bucket(TARGET_STORAGE_BUCKET),
    auth: authModule.getAuth(targetApp),
    app: targetApp,
  };
  assertFirestoreResource(source, SOURCE_PROJECT_ID, 'Source');
  assertStorageResource(source, SOURCE_PROJECT_ID, SOURCE_STORAGE_BUCKET, 'Source');
  assertFirestoreResource(target, TARGET_PROJECT_ID, 'Target');
  assertStorageResource(target, TARGET_PROJECT_ID, TARGET_STORAGE_BUCKET, 'Target');
  return {
    source,
    target,
    backupStorage: { projectId: TARGET_PROJECT_ID, storage: new gcsModule.Storage({ projectId: TARGET_PROJECT_ID }) },
  };
}

async function closeLiveResources(resources) {
  const { deleteApp } = await import('firebase-admin/app');
  await Promise.all([deleteApp(resources.source.app), deleteApp(resources.target.app)]);
}

async function commandDryRun(resources) {
  const [sourceState, targetState] = await Promise.all([
    captureSourceState(resources.source),
    captureTargetState(resources.target),
  ]);
  const plan = createPlan(sourceState, targetState);
  return { ok: true, ...plan.audit, mode: 'dry-run', readOnly: true };
}

async function commandApply(resources, options) {
  const [sourceState, targetState] = await Promise.all([
    captureSourceState(resources.source),
    captureTargetState(resources.target),
  ]);
  const plan = createPlan(sourceState, targetState);
  return applyPlan(plan, resources, options.planHash);
}

async function commandSetupBackup(resources) {
  const bucket = await ensureBackupBucket(resources.backupStorage, { allowProvision: true });
  const [metadata] = await bucket.getMetadata();
  return {
    ok: true,
    mode: 'setup-backup',
    readOnly: false,
    projectId: TARGET_PROJECT_ID,
    bucket: BACKUP_BUCKET,
    location: metadata.location,
    policy: backupBucketMetadata(),
  };
}

async function commandVerify(resources, options) {
  const backupBucket = await ensureBackupBucket(resources.backupStorage, { allowProvision: false });
  const runManifest = await readBackupJson(backupBucket, runManifestPath(options.runId));
  assertRunManifestSchema(runManifest);
  if (runManifest.runId !== options.runId || runManifest.backupBucket !== BACKUP_BUCKET)
    throw new SyncError('INVALID_BACKUP', 'Run manifest identity does not match the requested run');
  return verifyRun(runManifest, resources);
}

async function commandRollback(resources, options) {
  const backupBucket = await ensureBackupBucket(resources.backupStorage, { allowProvision: false });
  const runManifest = await readBackupJson(backupBucket, runManifestPath(options.runId));
  assertRunManifestSchema(runManifest);
  if (runManifest.runId !== options.runId || runManifest.backupBucket !== BACKUP_BUCKET)
    throw new SyncError('INVALID_BACKUP', 'Run manifest identity does not match the requested run');
  const targetState = await captureTargetState(resources.target);
  if (!options.apply) {
    upgradeStorageRecoveryContentHashes(runManifest, targetState);
    return { ok: true, ...rollbackPlan(runManifest, targetState) };
  }
  return applyRollback(runManifest, targetState, resources, options.rollbackToken);
}

export async function run(options) {
  if (options.help) return { ok: true, mode: 'help', usage: usage() };
  await assertNoUnexpectedProjectOverrides();
  await Promise.all([assertFirestoreLocation(SOURCE_PROJECT_ID), assertFirestoreLocation(TARGET_PROJECT_ID)]);
  const resources = await createLiveResources();
  try {
    if (options.mode === 'dry-run') return await commandDryRun(resources);
    if (options.mode === 'apply') return await commandApply(resources, options);
    if (options.mode === 'setup-backup') return await commandSetupBackup(resources);
    if (options.mode === 'verify') return await commandVerify(resources, options);
    if (options.mode === 'rollback') return await commandRollback(resources, options);
    throw new SyncError('USAGE', `Unknown mode ${options.mode}`);
  } finally {
    await closeLiveResources(resources);
  }
}

function errorOutput(error) {
  const code = error instanceof SyncError ? error.code : 'UNHANDLED_ERROR';
  const exitCode =
    error instanceof SyncError
      ? code === 'USAGE' ||
        code.endsWith('VIOLATION') ||
        code.includes('PROJECT') ||
        code.includes('ADC') ||
        code === 'EMULATOR_NOT_ALLOWED'
        ? EXIT_CODES.USAGE_OR_SECURITY
        : code.includes('VERIFY') || code === 'RUN_NOT_APPLIED'
          ? EXIT_CODES.VERIFICATION_FAILURE
          : code.includes('APPLY') || code.includes('BACKUP_FAILURE')
            ? EXIT_CODES.APPLY_FAILURE
            : code.includes('READ') || code.includes('PERMISSION') || code.includes('BUCKET')
              ? EXIT_CODES.READ_OR_PERMISSION
              : EXIT_CODES.VALIDATION_OR_PRECONDITION
      : EXIT_CODES.READ_OR_PERMISSION;
  return {
    exitCode,
    output: {
      ok: false,
      tool: 'sync-prod-content-to-dev',
      error: {
        code,
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof SyncError && error.details ? { details: error.details } : {}),
      },
    },
  };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  void (async () => {
    try {
      const options = parseArgs(process.argv.slice(2));
      const result = options.help ? { ok: true, mode: 'help', usage: usage() } : await run(options);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (result.ok === false) process.exitCode = EXIT_CODES.VERIFICATION_FAILURE;
    } catch (error) {
      const failure = errorOutput(error);
      process.stdout.write(`${JSON.stringify(failure.output)}\n`);
      process.exitCode = failure.exitCode;
    }
  })();
}
