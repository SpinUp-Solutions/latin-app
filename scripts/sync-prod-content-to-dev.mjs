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
  TARGET_PROJECT_ID,
  TARGET_STORAGE_BUCKET,
  SyncError,
  affectedDocumentOperations,
  affectedStorageOperations,
  assertPlanHash,
  buildContentFingerprint,
  buildExcludedFingerprint,
  buildManifest,
  byteHash,
  chunkOperations,
  createPlan,
  dataHash,
  decodeFirestoreValue,
  encodeFirestoreValue,
  formatTimeForHash,
  normalizeDocumentRecord,
  normalizeStorageRecord,
  operationsByCollection,
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
    if (options.mode !== 'dry-run' && options.mode !== mode) throw new SyncError('USAGE', `Cannot combine ${options.mode} with ${mode}`);
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
  if (options.mode === 'apply' && (options.runId || options.rollbackToken)) throw new SyncError('USAGE', '--apply cannot be combined with --run-id or --rollback-token');
  if (options.mode === 'verify' && options.apply) throw new SyncError('USAGE', '--verify cannot be combined with --apply');
  if (options.mode === 'verify' && (options.planHash || options.rollbackToken)) throw new SyncError('USAGE', '--verify cannot be combined with plan or rollback tokens');
  if (options.mode === 'verify' && !options.runId) throw new SyncError('USAGE', '--verify requires --run-id <id>');
  if (options.mode === 'rollback' && !options.runId) throw new SyncError('USAGE', '--rollback requires --run-id <id>');
  if (options.mode === 'rollback' && options.planHash) throw new SyncError('USAGE', '--rollback cannot be combined with --plan-hash');
  if (options.mode === 'rollback' && !options.apply && options.rollbackToken) throw new SyncError('USAGE', 'Rollback token requires --apply');
  if (options.mode === 'rollback' && options.apply && !options.rollbackToken) throw new SyncError('USAGE', '--rollback --apply requires --rollback-token <token>');
  if (options.mode === 'setup-backup' && (options.apply || options.planHash || options.runId || options.rollbackToken)) throw new SyncError('USAGE', '--setup-backup takes no other command options');
  if (options.mode === 'dry-run' && (options.planHash || options.runId || options.rollbackToken)) throw new SyncError('USAGE', 'Plan, run, and rollback tokens require their corresponding command');
  return options;
}

export async function assertNoUnexpectedProjectOverrides() {
  for (const key of PROJECT_ENVIRONMENT_KEYS) {
    const value = process.env[key]?.trim();
    if (value && !ALLOWED_ADC_PROJECTS.has(value)) throw new SyncError('UNEXPECTED_PROJECT_OVERRIDE', `${key} must name latin-app-prod or latin-app-dev`);
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new SyncError('EMULATOR_NOT_ALLOWED', 'Live sync commands refuse emulator endpoints');
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) return;
  try {
    const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
    if (credentials.quota_project_id && !ALLOWED_ADC_PROJECTS.has(credentials.quota_project_id)) throw new SyncError('UNEXPECTED_ADC_QUOTA_PROJECT', 'ADC quota project is not an approved project');
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
  if (locationId !== 'nam5') throw new SyncError('FIRESTORE_LOCATION_MISMATCH', `${projectId} Firestore database must be nam5`);
}

function assertSourceReadOnly(projectId) {
  if (projectId !== SOURCE_PROJECT_ID) throw new SyncError('SOURCE_READ_SCOPE_VIOLATION', `Source adapter must use ${SOURCE_PROJECT_ID}`);
}

export function assertWriteBoundary(projectId, resource) {
  if (projectId === SOURCE_PROJECT_ID) throw new SyncError('PRODUCTION_WRITE_FORBIDDEN', `Production is read-only: ${resource}`);
  if (projectId !== TARGET_PROJECT_ID) throw new SyncError('WRITE_SCOPE_VIOLATION', `Refusing to write outside ${TARGET_PROJECT_ID}`, { resource });
}

function assertFirestoreResource(resource, expectedProjectId, label) {
  const actualProjectId = resource?.db?.projectId;
  const actualDatabaseId = resource?.db?.databaseId;
  if (resource?.projectId !== expectedProjectId || actualProjectId !== expectedProjectId || actualDatabaseId !== FIRESTORE_DATABASE) {
    throw new SyncError('WRITE_SCOPE_VIOLATION', `${label} Firestore handle is not the expected ${expectedProjectId}/${FIRESTORE_DATABASE}`, {
      expectedProjectId,
      actualProjectId: resource?.projectId ?? actualProjectId ?? null,
      actualDatabaseId: actualDatabaseId ?? null,
    });
  }
}

function assertStorageResource(resource, expectedProjectId, expectedBucketName, label) {
  const actualProjectId = resource?.bucket?.storage?.projectId;
  const actualBucketName = resource?.bucket?.name;
  if (resource?.projectId !== expectedProjectId || actualProjectId !== expectedProjectId || actualBucketName !== expectedBucketName) {
    throw new SyncError('WRITE_SCOPE_VIOLATION', `${label} Storage handle is not the expected ${expectedProjectId}/${expectedBucketName}`, {
      expectedProjectId,
      expectedBucketName,
      actualProjectId: resource?.projectId ?? actualProjectId ?? null,
      actualBucketName: actualBucketName ?? null,
    });
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
    throw new SyncError('WRITE_SCOPE_VIOLATION', `${label} bucket is not the expected ${TARGET_PROJECT_ID}/${BACKUP_BUCKET}`, {
      expectedProjectId: TARGET_PROJECT_ID,
      expectedBucketName: BACKUP_BUCKET,
      actualProjectId: actualProjectId ?? null,
      actualBucketName: actualBucketName ?? null,
    });
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

async function listBucketObjects(bucket) {
  const [files] = await bucket.getFiles();
  const records = [];
  for (const file of files) {
    const [metadata] = await file.getMetadata();
    records.push(
      normalizeStorageRecord({
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
      })
    );
  }
  return records.sort((left, right) => left.name.localeCompare(right.name));
}

async function captureState({ projectId, storageBucket, db, bucket, auth, includeExcluded }) {
  if (projectId === SOURCE_PROJECT_ID) assertSourceReadOnly(projectId);
  else assertWriteBoundary(projectId, 'target read');
  assertFirestoreResource({ projectId, db }, projectId, 'State capture');
  assertStorageResource({ projectId, bucket }, projectId, storageBucket, 'State capture');
  const collections = {};
  for (const collection of MIRRORED_COLLECTIONS) collections[collection] = await listFirestoreCollection(db, collection);
  const excludedCollections = {};
  if (includeExcluded) {
    for (const collection of await listRootCollectionNames(db)) {
      if (!MIRRORED_COLLECTIONS.includes(collection)) excludedCollections[collection] = await listFirestoreCollection(db, collection);
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
  return captureState({ ...resources, includeExcluded: true });
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
    if (!allowProvision) throw new SyncError('BACKUP_BUCKET_MISSING', `Backup bucket ${BACKUP_BUCKET} is not provisioned; use --setup-backup or --apply`);
    await storageResource.storage.createBucket(BACKUP_BUCKET, backupBucketMetadata());
  }
  if (allowProvision) await bucket.setMetadata(backupBucketMetadata());
  const [metadata] = await bucket.getMetadata();
  const uniform = metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled === true;
  const publicPrevention = metadata.iamConfiguration?.publicAccessPrevention === 'enforced';
  const softDelete = Number(metadata.softDeletePolicy?.retentionDurationSeconds) === SOFT_DELETE_RETENTION_SECONDS;
  const lifecycle = metadata.lifecycle?.rule?.some(rule => rule.action?.type === 'Delete' && Number(rule.condition?.age) === LIFECYCLE_DELETE_AGE_DAYS);
  if (metadata.location !== BACKUP_LOCATION || !uniform || !publicPrevention || !softDelete || !lifecycle) throw new SyncError('BACKUP_BUCKET_POLICY_MISMATCH', `Backup bucket ${BACKUP_BUCKET} does not meet the required private retention policy`);
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
  if (runManifest?.schemaVersion !== RUN_SCHEMA_VERSION) throw new SyncError('INVALID_BACKUP', `Run manifest schema must be ${RUN_SCHEMA_VERSION}`);
}

function createRunId() {
  return `${new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(6).toString('hex')}`;
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
      dataHash: operation.target?.hash ?? null,
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
      await writeBackupJson(backupBucket, `runs/${runId}/before/storage/${safePathSegment(operation.name)}.json`, operation.target);
    }
    storageEntries.push(entry);
  }
  return { firestoreEntries, storageEntries };
}

function runManifestForBackup(plan, runId, beforeImages, rollbackToken) {
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
      preSyncExcludedFingerprint: buildExcludedFingerprint(plan.targetState),
      preSyncAuthFingerprint: plan.targetState.authFingerprint,
      expectedPostSyncContentFingerprint: buildContentFingerprint(plan.projectedState),
      postSyncManifestHash: null,
      postSyncContentFingerprint: null,
      postSyncExcludedFingerprint: null,
      postSyncAuthFingerprint: null,
    },
    planHash: plan.planHash,
    plan: plan.audit,
    beforeImages,
    rollbackTokenHash: sha256(rollbackToken),
    backupBucket: BACKUP_BUCKET,
    sourceAfter: null,
    sourceDriftAfterRun: null,
  };
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
  if (targetRecord?.generation && !targetRecord?.metageneration) throw new SyncError('TARGET_DRIFT', 'Target Storage update is missing a metageneration precondition');
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
    if (!operation.name.startsWith(LESSONS_PREFIX)) throw new SyncError('WRITE_SCOPE_VIOLATION', `Refusing to write Storage object ${operation.name}`);
  }
  for (const operation of operations) {
    const targetFile = targetResource.bucket.file(operation.name);
    if (operation.action === 'delete') {
      if (!operation.target?.generation || !operation.target?.metageneration) throw new SyncError('TARGET_DRIFT', `Storage object ${operation.name} has no generation/metageneration precondition`);
      await targetFile.delete({ preconditionOpts: { ifGenerationMatch: operation.target.generation, ifMetagenerationMatch: operation.target.metageneration } });
      continue;
    }
    if (!operation.source?.generation) throw new SyncError('SOURCE_DRIFT', `Source Storage object ${operation.name} has no generation precondition`);
    const [bytes] = await sourceResource.bucket.file(operation.name, { generation: operation.source.generation }).download(storageDownloadOptions(operation.source));
    await targetFile.save(bytes, storageSaveOptions(operation.source, operation.target));
  }
}

function assertTransactionSnapshot(operation, snapshot) {
  if (operation.action === 'create') {
    if (snapshot.exists) throw new SyncError('TARGET_DRIFT', `Firestore document ${operation.collection}/${operation.id} appeared after planning`);
    return;
  }
  if (!snapshot.exists) throw new SyncError('TARGET_DRIFT', `Firestore document ${operation.collection}/${operation.id} disappeared after planning`);
  const expectedUpdateTime = formatTimeForHash(operation.target?.updateTime);
  const actualUpdateTime = formatTimeForHash(snapshot.updateTime);
  if (!expectedUpdateTime || actualUpdateTime !== expectedUpdateTime) {
    throw new SyncError('TARGET_DRIFT', `Firestore document ${operation.collection}/${operation.id} changed after planning`, {
      expectedUpdateTime,
      actualUpdateTime,
    });
  }
}

async function executeFirestoreChunk(targetResource, operations) {
  const db = targetResource.db;
  await db.runTransaction(async transaction => {
    const refs = operations.map(operation => db.collection(operation.collection).doc(operation.id));
    const snapshots = await transaction.getAll(...refs);
    for (const [index, operation] of operations.entries()) assertTransactionSnapshot(operation, snapshots[index]);
    for (const [index, operation] of operations.entries()) {
      const ref = refs[index];
      if (operation.action === 'create') transaction.create(ref, operation.source.data);
      else if (operation.action === 'update') transaction.set(ref, operation.source.data);
      else if (operation.action === 'delete') transaction.delete(ref);
      else throw new SyncError('INVALID_WRITE_OPERATION', `Unsupported Firestore operation ${operation.action}`);
    }
  });
}

export async function executeFirestoreOperations(targetResource, operations) {
  assertWriteBoundary(targetResource?.projectId, 'Firestore');
  assertFirestoreResource(targetResource, TARGET_PROJECT_ID, 'Target');
  for (const operation of operations) {
    if (!MIRRORED_COLLECTIONS.includes(operation.collection)) throw new SyncError('WRITE_SCOPE_VIOLATION', `Refusing to write collection ${operation.collection}`);
  }
  for (const chunk of chunkOperations(operations)) {
    await executeFirestoreChunk(targetResource, chunk);
  }
}

export async function applyPlan(plan, resources, suppliedPlanHash) {
  assertPlanHash(plan.planHash, suppliedPlanHash);
  const backupBucket = await ensureBackupBucket(resources.backupStorage, { allowProvision: true });
  const runId = createRunId();
  const rollbackToken = createRollbackToken();
  let runManifest;
  try {
    const beforeImages = await backupBeforeImages(plan, resources.target, backupBucket, runId);
    runManifest = runManifestForBackup(plan, runId, beforeImages, rollbackToken);
    await updateRunManifest(backupBucket, runManifest);

    await executeStorageOperations(resources.source, resources.target, affectedStorageOperations(plan).filter(operation => ['create', 'update'].includes(operation.action)));
    await executeFirestoreOperations(resources.target, operationsByCollection(plan, 'vocabulary_words_v5').filter(operation => operation.action !== 'delete'));
    await executeFirestoreOperations(resources.target, operationsByCollection(plan, 'vocabulary_pools').filter(operation => operation.action !== 'delete'));
    await executeFirestoreOperations(resources.target, operationsByCollection(plan, 'lessons').filter(operation => operation.action !== 'delete'));
    await executeFirestoreOperations(resources.target, plan.firestoreOperations.filter(operation => operation.action === 'delete' && operation.collection !== 'learningPaths'));
    await executeStorageOperations(resources.source, resources.target, affectedStorageOperations(plan).filter(operation => operation.action === 'delete'));
    await executeFirestoreOperations(resources.target, operationsByCollection(plan, 'learningPaths'));

    const [sourceAfter, targetAfter] = await Promise.all([captureSourceState(resources.source), captureTargetState(resources.target)]);
    const sourceAfterManifest = buildManifest(sourceAfter);
    const targetAfterManifest = buildManifest(targetAfter);
    const targetAfterContentFingerprint = buildContentFingerprint(targetAfter);
    const excludedUnchanged = buildExcludedFingerprint(targetAfter) === runManifest.target.preSyncExcludedFingerprint;
    const authUnchanged = sha256(targetAfter.authFingerprint) === sha256(runManifest.target.preSyncAuthFingerprint);
    if (targetAfterContentFingerprint !== runManifest.target.expectedPostSyncContentFingerprint || !excludedUnchanged || !authUnchanged) {
      throw new SyncError('POST_SYNC_VERIFY_FAILED', 'Dev post-sync state does not match the expected mirror or protected-data fingerprints', {
        expectedPostSyncContentFingerprint: runManifest.target.expectedPostSyncContentFingerprint,
        actualPostSyncContentFingerprint: targetAfterContentFingerprint,
        excludedUnchanged,
        authUnchanged,
      });
    }
    runManifest.status = 'applied';
    runManifest.sourceAfter = { manifestHash: sourceAfterManifest.manifestHash, contentFingerprint: buildContentFingerprint(sourceAfter) };
    runManifest.sourceDriftAfterRun = {
      detected: sourceAfterManifest.manifestHash !== plan.sourceManifest.manifestHash,
      beforeManifestHash: plan.sourceManifest.manifestHash,
      afterManifestHash: sourceAfterManifest.manifestHash,
    };
    runManifest.target.postSyncManifestHash = targetAfterManifest.manifestHash;
    runManifest.target.postSyncContentFingerprint = targetAfterContentFingerprint;
    runManifest.target.postSyncExcludedFingerprint = buildExcludedFingerprint(targetAfter);
    runManifest.target.postSyncAuthFingerprint = targetAfter.authFingerprint;
    await updateRunManifest(backupBucket, runManifest);
    return { ok: true, mode: 'apply', ...redactRunManifestForOutput(runManifest), rollbackToken, warning: 'Store the rollback token securely; it is required for rollback apply.' };
  } catch (error) {
    if (runManifest) {
      runManifest.status = 'failed';
      runManifest.failure = { code: error.code ?? 'APPLY_FAILURE', message: error.message };
      try {
        await updateRunManifest(backupBucket, runManifest);
      } catch {
        // Preserve the original error; all mirror writes already failed closed.
      }
    }
    if (error instanceof SyncError) throw error;
    throw new SyncError('APPLY_FAILURE', error instanceof Error ? error.message : String(error));
  }
}

function targetManifestCheck(targetState, runManifest) {
  const currentManifest = buildManifest(targetState);
  const currentAuthHash = sha256(targetState.authFingerprint);
  const recordedAuthHash = sha256(runManifest.target.preSyncAuthFingerprint);
  const currentContentFingerprint = buildContentFingerprint(targetState);
  return {
    currentManifest,
    currentContentFingerprint,
    exactPostSyncMatch: currentManifest.manifestHash === runManifest.target.postSyncManifestHash,
    expectedPostSyncContentMatch: currentContentFingerprint === runManifest.target.expectedPostSyncContentFingerprint,
    excludedUnchanged: buildExcludedFingerprint(targetState) === runManifest.target.preSyncExcludedFingerprint,
    authUnchanged: currentAuthHash === recordedAuthHash,
  };
}

function documentRecordsByPath(targetState) {
  const currentDocuments = new Map();
  for (const collection of MIRRORED_COLLECTIONS) {
    for (const record of targetState.collections?.[collection] ?? []) currentDocuments.set(`${collection}/${record.id}`, record);
  }
  return currentDocuments;
}

export function rollbackPlan(runManifest, targetState) {
  const current = targetManifestCheck(targetState, runManifest);
  if (!current.exactPostSyncMatch) throw new SyncError('ROLLBACK_PRECONDITION_FAILED', 'Dev no longer matches the recorded post-sync fingerprint', { expectedPostSyncManifestHash: runManifest.target.postSyncManifestHash, currentManifestHash: current.currentManifest.manifestHash });
  const currentDocuments = documentRecordsByPath(targetState);
  const currentStorage = new Map((targetState.storage ?? []).map(record => [record.name, record]));
  const firestoreOperations = (runManifest.beforeImages?.firestoreEntries ?? []).map(entry => ({
    kind: 'firestore',
    collection: entry.collection,
    id: entry.id,
    action: entry.exists ? (currentDocuments.has(entry.path) ? 'restore' : 'create') : (currentDocuments.has(entry.path) ? 'delete' : 'preserve'),
    path: entry.path,
    backupPath: entry.backupPath,
  }));
  const storageOperations = (runManifest.beforeImages?.storageEntries ?? []).map(entry => ({
    kind: 'storage',
    name: entry.name,
    action: entry.exists ? (currentStorage.has(entry.name) ? 'restore' : 'create') : (currentStorage.has(entry.name) ? 'delete' : 'preserve'),
    backupPath: entry.backupPath,
    hash: entry.hash ?? null,
    contentHash: entry.contentHash ?? null,
    bytesHash: entry.bytesHash ?? null,
  }));
  return {
    mode: 'rollback-dry-run',
    readOnly: true,
    runId: runManifest.runId,
    status: runManifest.status,
    precondition: { expectedPostSyncManifestHash: runManifest.target.postSyncManifestHash, currentManifestHash: current.currentManifest.manifestHash, matched: true },
    firestore: { operations: firestoreOperations, summary: summarizeOperations(firestoreOperations.map(operation => ({ action: operation.action === 'restore' ? 'update' : operation.action }))) },
    storage: { operations: storageOperations, summary: summarizeOperations(storageOperations.map(operation => ({ action: operation.action === 'restore' ? 'update' : operation.action }))) },
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
  const valid = Boolean(entry.hash)
    && Boolean(entry.contentHash)
    && Boolean(entry.bytesHash)
    && actualObjectHash === entry.hash
    && actualContentHash === entry.contentHash
    && actualBytesHash === entry.bytesHash;
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
    if (!operation.name.startsWith(LESSONS_PREFIX)) throw new SyncError('WRITE_SCOPE_VIOLATION', `Refusing to write Storage object ${operation.name}`);
    if (operation.action === 'preserve') continue;
    const current = currentStorage.get(operation.name);
    if (operation.action === 'delete') {
      if (!current?.generation || !current?.metageneration) throw new SyncError('ROLLBACK_PRECONDITION_FAILED', `Current Storage object ${operation.name} is missing generation/metageneration`);
      prepared.push({ operation, current, targetFile: targetResource.bucket.file(operation.name) });
      continue;
    }
    if (!operation.backupPath) throw new SyncError('INVALID_BACKUP', `Missing Storage backup for ${operation.name}`);
    if (current?.generation && !current?.metageneration) throw new SyncError('ROLLBACK_PRECONDITION_FAILED', `Current Storage object ${operation.name} is missing metageneration`);
    const metadata = await readBackupJson(backupBucket, operation.backupPath.replace(/\.bin$/, '.json'));
    const [bytes] = await backupBucket.file(operation.backupPath).download(storageDownloadOptions(metadata));
    assertStorageBeforeImageIntegrity(operation, metadata, bytes);
    prepared.push({ operation, current, bytes, metadata, targetFile: targetResource.bucket.file(operation.name) });
  }
  for (const item of prepared) {
    const { operation, current, targetFile } = item;
    if (operation.action === 'delete') {
      await targetFile.delete({ preconditionOpts: { ifGenerationMatch: current.generation, ifMetagenerationMatch: current.metageneration } });
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

async function applyRollback(runManifest, targetState, resources, rollbackToken) {
  if (runManifest.status !== 'applied') throw new SyncError('ROLLBACK_NOT_ALLOWED', `Run ${runManifest.runId} is not in applied status`);
  if (!rollbackToken || sha256(rollbackToken) !== runManifest.rollbackTokenHash) throw new SyncError('ROLLBACK_TOKEN_REQUIRED', 'The exact rollback token from the apply result is required');
  const plan = rollbackPlan(runManifest, targetState);
  const backupBucket = await ensureBackupBucket(resources.backupStorage, { allowProvision: false });
  const currentStorage = new Map((targetState.storage ?? []).map(record => [record.name, record]));
  const currentDocuments = documentRecordsByPath(targetState);
  const entries = runManifest.beforeImages?.firestoreEntries ?? [];
  const orderedEntries = [...entries].sort((left, right) => {
    const order = { vocabulary_words_v5: 1, vocabulary_pools: 2, lessons: 3, learningPaths: 4 };
    return (order[left.collection] ?? 9) - (order[right.collection] ?? 9) || `${left.collection}/${left.id}`.localeCompare(`${right.collection}/${right.id}`);
  });
  const restoreOperations = [];
  for (const entry of orderedEntries) {
    const current = currentDocuments.get(entry.path);
    if (entry.exists) {
      if (!entry.backupPath) throw new SyncError('INVALID_BACKUP', `Missing Firestore backup for ${entry.path}`);
      const encoded = await readBackupJson(backupBucket, entry.backupPath);
      if (encoded.path !== entry.path || encoded.id !== entry.id || encoded.exists !== true) throw new SyncError('BACKUP_INTEGRITY_FAILED', `Firestore before-image identity check failed for ${entry.path}`);
      const decodedData = decodeFirestoreValue(encoded.data, resources.target.db, { Timestamp: AdminTimestamp, GeoPoint: AdminGeoPoint });
      assertFirestoreBeforeImageIntegrity(entry, decodedData);
      restoreOperations.push({
        collection: entry.collection,
        id: entry.id,
        action: current ? 'update' : 'create',
        source: { data: decodedData },
        target: current ?? null,
      });
    } else if (current) {
      restoreOperations.push({ collection: entry.collection, id: entry.id, action: 'delete', target: current });
    }
  }
  // Validate every before-image before the first cross-service restore write.
  // Storage rollback performs the same complete preflight for its artifacts.
  await executeStorageRollbackOperations(resources.target, backupBucket, plan.storage.operations, currentStorage);
  await executeFirestoreOperations(resources.target, restoreOperations);
  const after = await captureTargetState(resources.target);
  const afterContentFingerprint = buildContentFingerprint(after);
  if (afterContentFingerprint !== runManifest.target.preSyncContentFingerprint) throw new SyncError('ROLLBACK_VERIFY_FAILED', 'Rollback completed but dev content does not match the pre-sync fingerprint', { expected: runManifest.target.preSyncContentFingerprint, actual: afterContentFingerprint });
  runManifest.status = 'rolled-back';
  runManifest.rolledBackAt = new Date().toISOString();
  runManifest.rollback = { contentFingerprint: afterContentFingerprint, restoredToPreSyncContent: true };
  await updateRunManifest(backupBucket, runManifest);
  return { ok: true, mode: 'rollback-apply', runId: runManifest.runId, postRollbackContentFingerprint: afterContentFingerprint, restoredToPreSyncContent: true };
}

async function verifyRun(runManifest, resources) {
  if (runManifest.status !== 'applied') throw new SyncError('RUN_NOT_APPLIED', `Run ${runManifest.runId} is not in applied status`);
  const [sourceState, targetState] = await Promise.all([captureSourceState(resources.source), captureTargetState(resources.target)]);
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
    mirroredContent: current.expectedPostSyncContentMatch,
    strictLearningPathAndReferences: graphValid,
    excludedDevDataUnchanged: current.excludedUnchanged,
    authUnchanged: current.authUnchanged,
    controlledStorageChecksums: (targetState.storage ?? []).every(record => Boolean(record.md5Hash || record.crc32c)),
    sourceReadable: Boolean(buildManifest(sourceState).manifestHash),
  };
  const failures = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name);
  return {
    ok: failures.length === 0,
    mode: 'verify',
    runId: runManifest.runId,
    checks,
    failures,
    currentTargetManifestHash: current.currentManifest.manifestHash,
    currentTargetContentFingerprint: current.currentContentFingerprint,
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
  const sourceApp = appModule.initializeApp({ credential, projectId: SOURCE_PROJECT_ID, storageBucket: SOURCE_STORAGE_BUCKET }, `sync-prod-content-source-${process.pid}`);
  const targetApp = appModule.initializeApp({ credential, projectId: TARGET_PROJECT_ID, storageBucket: TARGET_STORAGE_BUCKET }, `sync-prod-content-target-${process.pid}`);
  const sourceStorage = new gcsModule.Storage({ projectId: SOURCE_PROJECT_ID });
  const targetStorage = new gcsModule.Storage({ projectId: TARGET_PROJECT_ID });
  const source = { projectId: SOURCE_PROJECT_ID, storageBucket: SOURCE_STORAGE_BUCKET, db: firestoreModule.getFirestore(sourceApp), bucket: sourceStorage.bucket(SOURCE_STORAGE_BUCKET), auth: authModule.getAuth(sourceApp), app: sourceApp };
  const target = { projectId: TARGET_PROJECT_ID, storageBucket: TARGET_STORAGE_BUCKET, db: firestoreModule.getFirestore(targetApp), bucket: targetStorage.bucket(TARGET_STORAGE_BUCKET), auth: authModule.getAuth(targetApp), app: targetApp };
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
  const [sourceState, targetState] = await Promise.all([captureSourceState(resources.source), captureTargetState(resources.target)]);
  const plan = createPlan(sourceState, targetState);
  return { ok: true, ...plan.audit, mode: 'dry-run', readOnly: true };
}

async function commandApply(resources, options) {
  const [sourceState, targetState] = await Promise.all([captureSourceState(resources.source), captureTargetState(resources.target)]);
  const plan = createPlan(sourceState, targetState);
  return applyPlan(plan, resources, options.planHash);
}

async function commandSetupBackup(resources) {
  const bucket = await ensureBackupBucket(resources.backupStorage, { allowProvision: true });
  const [metadata] = await bucket.getMetadata();
  return { ok: true, mode: 'setup-backup', readOnly: false, projectId: TARGET_PROJECT_ID, bucket: BACKUP_BUCKET, location: metadata.location, policy: backupBucketMetadata() };
}

async function commandVerify(resources, options) {
  const backupBucket = await ensureBackupBucket(resources.backupStorage, { allowProvision: false });
  const runManifest = await readBackupJson(backupBucket, runManifestPath(options.runId));
  assertRunManifestSchema(runManifest);
  if (runManifest.runId !== options.runId || runManifest.backupBucket !== BACKUP_BUCKET) throw new SyncError('INVALID_BACKUP', 'Run manifest identity does not match the requested run');
  return verifyRun(runManifest, resources);
}

async function commandRollback(resources, options) {
  const backupBucket = await ensureBackupBucket(resources.backupStorage, { allowProvision: false });
  const runManifest = await readBackupJson(backupBucket, runManifestPath(options.runId));
  assertRunManifestSchema(runManifest);
  if (runManifest.runId !== options.runId || runManifest.backupBucket !== BACKUP_BUCKET) throw new SyncError('INVALID_BACKUP', 'Run manifest identity does not match the requested run');
  const targetState = await captureTargetState(resources.target);
  if (!options.apply) return { ok: true, ...rollbackPlan(runManifest, targetState) };
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
  const exitCode = error instanceof SyncError
    ? code === 'USAGE' || code.endsWith('VIOLATION') || code.includes('PROJECT') || code.includes('ADC') || code === 'EMULATOR_NOT_ALLOWED'
      ? EXIT_CODES.USAGE_OR_SECURITY
      : code.includes('VERIFY') || code === 'RUN_NOT_APPLIED'
        ? EXIT_CODES.VERIFICATION_FAILURE
        : code.includes('APPLY') || code.includes('BACKUP_FAILURE')
          ? EXIT_CODES.APPLY_FAILURE
          : code.includes('READ') || code.includes('PERMISSION') || code.includes('BUCKET')
            ? EXIT_CODES.READ_OR_PERMISSION
            : EXIT_CODES.VALIDATION_OR_PRECONDITION
    : EXIT_CODES.READ_OR_PERMISSION;
  return { exitCode, output: { ok: false, tool: 'sync-prod-content-to-dev', error: { code, message: error instanceof Error ? error.message : String(error), ...(error instanceof SyncError && error.details ? { details: error.details } : {}) } } };
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
