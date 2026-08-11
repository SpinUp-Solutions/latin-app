import { createHash } from 'node:crypto';

export const TOOL_NAME = 'sync-prod-content-to-dev';
export const PLAN_SCHEMA_VERSION = 3;
export const RUN_SCHEMA_VERSION = 3;
export const SOURCE_PROJECT_ID = 'latin-app-prod';
export const TARGET_PROJECT_ID = 'latin-app-dev';
export const SOURCE_STORAGE_BUCKET = 'latin-app-prod.firebasestorage.app';
export const TARGET_STORAGE_BUCKET = 'latin-app-dev.firebasestorage.app';
export const BACKUP_BUCKET = 'latin-app-dev-prod-content-sync-122256273781';
export const FIRESTORE_DATABASE = '(default)';
export const BACKUP_LOCATION = 'US';
export const SOFT_DELETE_RETENTION_SECONDS = 7 * 24 * 60 * 60;
export const LIFECYCLE_DELETE_AGE_DAYS = 30;
export const MIRRORED_COLLECTIONS = ['lessons', 'learningPaths', 'vocabulary_pools', 'vocabulary_words_v5'];
export const PRESERVED_REFERENCE_COLLECTIONS = ['practiceCategoryMemberships', 'testVersions', 'testVersionDrafts'];
export const EXPLICITLY_PROTECTED_COLLECTIONS = [
  'users',
  'userProgress',
  'attempts',
  'requests',
  'migrationRecords',
  'migrationSnapshots',
  'protectedMigrationSnapshots',
  'words-latin-dev',
  ...PRESERVED_REFERENCE_COLLECTIONS,
];
// Firestore's 10 MiB transaction limit includes more than the serialized
// document payload (reads, writes, and index-entry expansion all count). Keep
// the client-side ceiling deliberately conservative; the adapter also halves
// a chunk if Firestore still reports that a transaction is too large.
export const MAX_BATCH_WRITES = 100;
export const MAX_BATCH_BYTES = 1_500_000;
export const STORAGE_FOLDER_MARKER_NAME = 'lessons/';
export const EXIT_CODES = Object.freeze({
  OK: 0,
  USAGE_OR_SECURITY: 2,
  VALIDATION_OR_PRECONDITION: 3,
  READ_OR_PERMISSION: 4,
  APPLY_FAILURE: 5,
  VERIFICATION_FAILURE: 6,
});

const LESSONS_PREFIX = 'lessons/';
const VALUE_TAG = '__syncType';
const POOL_REFERENCE_KEYS = new Set(['vocabulary_pool', 'vocabularyPoolId', 'poolId', 'pool_id']);
const WORD_ID_ARRAY_KEYS = new Set(['wordDocIds', 'wordIds']);
const LOCAL_REVISION_FIELDS = Object.freeze({
  vocabulary_pools: ['_assignmentRevision', '_wordContentRevision'],
  vocabulary_words_v5: ['_poolReferenceRevision'],
});

export class SyncError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.details = details;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTimestampLike(value) {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    Number.isInteger(Number(value.seconds)) &&
    Number.isInteger(Number(value.nanoseconds)) &&
    typeof value.toDate === 'function'
  );
}

function isGeoPointLike(value) {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number' &&
    value.constructor?.name === 'GeoPoint'
  );
}

function isDocumentReferenceLike(value) {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof value.path === 'string' &&
    value.constructor?.name === 'DocumentReference'
  );
}

function canonicalNumber(value) {
  if (Number.isNaN(value)) return { [VALUE_TAG]: 'number', value: 'NaN' };
  if (value === Infinity) return { [VALUE_TAG]: 'number', value: 'Infinity' };
  if (value === -Infinity) return { [VALUE_TAG]: 'number', value: '-Infinity' };
  if (Object.is(value, -0)) return { [VALUE_TAG]: 'number', value: '-0' };
  return value;
}

/** Stable Firestore/Storage-safe JSON representation used for every hash. */
export function canonicalize(value, seen = new WeakSet()) {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return canonicalNumber(value);
  if (typeof value === 'bigint') return { [VALUE_TAG]: 'bigint', value: value.toString() };
  if (typeof value === 'function' || typeof value === 'symbol') return { [VALUE_TAG]: typeof value };
  if (value instanceof Date) return { [VALUE_TAG]: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { [VALUE_TAG]: 'bytes', base64: Buffer.from(value).toString('base64') };
  }
  if (isTimestampLike(value)) {
    return { [VALUE_TAG]: 'timestamp-parts', seconds: String(value.seconds), nanoseconds: Number(value.nanoseconds) };
  }
  if (isGeoPointLike(value)) return { [VALUE_TAG]: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (isDocumentReferenceLike(value)) return { [VALUE_TAG]: 'document-reference', path: value.path };
  if (seen.has(value)) throw new SyncError('NON_CANONICAL_VALUE', 'A cyclic value cannot be hashed');
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map(entry => canonicalize(entry, seen));
    const entries = [];
    for (const key of Object.keys(value).sort()) {
      const normalized = canonicalize(value[key], seen);
      if (normalized !== undefined) entries.push([key, normalized]);
    }
    return { [VALUE_TAG]: 'map', entries };
  } finally {
    seen.delete(value);
  }
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : canonicalJson(value))
    .digest('hex');
}

export function byteHash(value) {
  return createHash('sha256').update(Buffer.from(value)).digest('hex');
}

export function dataHash(value) {
  return sha256({ kind: 'firestore-document-data', value });
}

export function syncDocumentDataHash(collection, value) {
  if (!isObject(value)) return dataHash(value);
  const normalized = { ...value };
  for (const field of LOCAL_REVISION_FIELDS[collection] ?? []) delete normalized[field];
  return dataHash(normalized);
}

export function rebaseLocalRevisionFields(collection, sourceData, targetData = {}) {
  const rebased = { ...sourceData };
  for (const field of LOCAL_REVISION_FIELDS[collection] ?? []) {
    if (isObject(targetData) && Object.prototype.hasOwnProperty.call(targetData, field))
      rebased[field] = targetData[field];
    else delete rebased[field];
  }
  return rebased;
}

export function normalizeDocumentRecord(collection, input) {
  const id = typeof input?.id === 'string' ? input.id : undefined;
  const data = isObject(input?.data) ? input.data : input;
  if (!id || !isObject(data)) throw new SyncError('INVALID_DOCUMENT_RECORD', `Invalid ${collection} document record`);
  return {
    collection,
    id,
    path: `${collection}/${id}`,
    data,
    createTime: input.createTime ?? null,
    updateTime: input.updateTime ?? null,
    hash: syncDocumentDataHash(collection, data),
    exactDataHash: dataHash(data),
  };
}

function normalizeStorageInput(input) {
  if (!input || typeof input.name !== 'string' || !input.name)
    throw new SyncError('INVALID_STORAGE_RECORD', 'Invalid Storage object record');
  return {
    name: input.name,
    generation: input.generation == null ? null : String(input.generation),
    metageneration: input.metageneration == null ? null : String(input.metageneration),
    size: input.size == null ? null : String(input.size),
    md5Hash: input.md5Hash ?? null,
    crc32c: input.crc32c ?? null,
    contentType: input.contentType ?? null,
    cacheControl: input.cacheControl ?? null,
    contentEncoding: input.contentEncoding ?? null,
    contentDisposition: input.contentDisposition ?? null,
    contentLanguage: input.contentLanguage ?? null,
    // Keep the record representation idempotent. Hash callers canonicalize
    // this plain metadata object when constructing the stable digest; storing
    // a tagged canonical node here would cause every re-normalization to
    // encode that tag again.
    metadata: input.metadata ?? {},
  };
}

export function storageObjectHash(input) {
  return sha256({ kind: 'storage-object', ...normalizeStorageInput(input) });
}

export function storageContentHash(input) {
  const normalized = normalizeStorageInput(input);
  return sha256({
    kind: 'storage-content',
    ...normalized,
    generation: null,
    metageneration: null,
  });
}

export function normalizeStorageRecord(input) {
  const normalized = normalizeStorageInput(input);
  return {
    ...normalized,
    hash: storageObjectHash(normalized),
    contentHash: storageContentHash(normalized),
  };
}

/** Firebase/GCS may materialize this exact zero-byte folder marker. */
export function isZeroByteStorageFolderMarker(input) {
  return input?.name === STORAGE_FOLDER_MARKER_NAME && String(input?.size ?? '') === '0';
}

function contentStorageRecords(records = []) {
  return records.filter(record => !isZeroByteStorageFolderMarker(record));
}

export function formatTimeForHash(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (isTimestampLike(value)) return `${String(value.seconds)}:${String(value.nanoseconds).padStart(9, '0')}`;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function sortById(records = []) {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

function sortByName(records = []) {
  return [...records].sort((left, right) => left.name.localeCompare(right.name));
}

function normalizedCollections(collections = {}) {
  return Object.fromEntries(
    Object.keys(collections)
      .sort()
      .map(collection => [
        collection,
        sortById((collections[collection] ?? []).map(record => normalizeDocumentRecord(collection, record))),
      ])
  );
}

function normalizedExcludedCollections(collections = {}) {
  return normalizedCollections(collections);
}

function normalizedTargetCollections(state) {
  // Live captures keep non-mirrored root collections in excludedCollections,
  // while pure callers may provide preserved references in collections. Merge
  // both shapes so fixture closure and graph validation inspect the same data.
  return normalizedCollections({
    ...(state.excludedCollections ?? {}),
    ...(state.collections ?? {}),
  });
}

function collectionManifest(records, includeTimes) {
  return sortById(records).map(record => ({
    id: record.id,
    hash: record.hash ?? dataHash(record.data),
    ...(includeTimes
      ? { createTime: formatTimeForHash(record.createTime), updateTime: formatTimeForHash(record.updateTime) }
      : {}),
  }));
}

function storageManifest(records, includeGeneration) {
  return sortByName(records).map(record => ({
    name: record.name,
    hash: includeGeneration ? record.hash : record.contentHash,
    ...(includeGeneration ? { generation: record.generation, metageneration: record.metageneration } : {}),
  }));
}

/** Build a stable, timestamp-aware manifest; capture time is never hashed. */
export function buildManifest(state, { includeTimes = true, includeGeneration = true } = {}) {
  const collections = normalizedCollections(state.collections);
  const excludedCollections = normalizedExcludedCollections(state.excludedCollections);
  const storage = contentStorageRecords(state.storage ?? []).map(normalizeStorageRecord);
  const excludedStorage = contentStorageRecords(state.excludedStorage ?? []).map(normalizeStorageRecord);
  const payload = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    tool: TOOL_NAME,
    projectId: state.projectId,
    storageBucket: state.storageBucket,
    database: state.database ?? FIRESTORE_DATABASE,
    collections: Object.fromEntries(
      Object.entries(collections).map(([name, records]) => [name, collectionManifest(records, includeTimes)])
    ),
    storage: storageManifest(storage, includeGeneration),
    excludedCollections: Object.fromEntries(
      Object.entries(excludedCollections).map(([name, records]) => [name, collectionManifest(records, includeTimes)])
    ),
    excludedStorage: storageManifest(excludedStorage, includeGeneration),
    authFingerprint: state.authFingerprint ?? null,
  };
  return { ...payload, capturedAt: state.capturedAt ?? null, manifestHash: sha256(payload) };
}

export function buildContentFingerprint(state) {
  const manifest = buildManifest(state, { includeTimes: false, includeGeneration: false });
  const { capturedAt: _capturedAt, manifestHash: _manifestHash, ...payload } = manifest;
  return sha256(payload);
}

/** Hash only the mirrored Firestore collections and controlled lesson Storage. */
export function buildMirroredContentFingerprint(state) {
  const manifest = buildManifest(state, { includeTimes: false, includeGeneration: false });
  return sha256({
    schemaVersion: PLAN_SCHEMA_VERSION,
    collections: manifest.collections,
    storage: manifest.storage,
  });
}

export function buildExcludedFingerprint(state) {
  const manifest = buildManifest(state);
  return sha256({
    schemaVersion: PLAN_SCHEMA_VERSION,
    excludedCollections: manifest.excludedCollections,
    excludedStorage: manifest.excludedStorage,
    authFingerprint: manifest.authFingerprint,
  });
}

function recordsById(records = []) {
  return new Map(records.map(record => [record.id, normalizeDocumentRecord(record.collection, record)]));
}

function storageByName(records = []) {
  return new Map(contentStorageRecords(records).map(record => [record.name, normalizeStorageRecord(record)]));
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '')
    throw new SyncError('INVALID_SCHEMA', `${label} must be a non-empty string`);
  return value;
}

function assertRecord(value, label) {
  if (!isObject(value)) throw new SyncError('INVALID_SCHEMA', `${label} must be an object`);
}

export function validateStrictLearningPath(record, label = 'learningPath') {
  assertRecord(record, label);
  const allowed = new Set(['id', 'revision', 'unitIds', 'updatedAt', 'updatedBy']);
  const unknown = Object.keys(record).filter(key => !allowed.has(key));
  if (unknown.length) throw new SyncError('INVALID_LEARNING_PATH', `${label} has non-canonical fields`, { unknown });
  if (record.id !== 'default') throw new SyncError('INVALID_LEARNING_PATH', `${label}.id must be default`);
  if (!Number.isSafeInteger(record.revision) || record.revision < 0)
    throw new SyncError('INVALID_LEARNING_PATH', `${label}.revision must be non-negative`);
  if (
    !Array.isArray(record.unitIds) ||
    record.unitIds.some(id => typeof id !== 'string' || !id.trim()) ||
    new Set(record.unitIds).size !== record.unitIds.length
  ) {
    throw new SyncError('INVALID_LEARNING_PATH', `${label}.unitIds must be unique non-empty strings`);
  }
  requireString(record.updatedAt, `${label}.updatedAt`);
  if (!Number.isFinite(Date.parse(record.updatedAt)) || new Date(record.updatedAt).toISOString() !== record.updatedAt) {
    throw new SyncError('INVALID_LEARNING_PATH', `${label}.updatedAt must be canonical ISO-8601`);
  }
  requireString(record.updatedBy, `${label}.updatedBy`);
}

function validatePages(pages, label) {
  if (!Array.isArray(pages) || pages.length === 0)
    throw new SyncError('INVALID_SCHEMA', `${label}.pages must be non-empty`);
  const pageIds = new Set();
  const itemIds = new Set();
  for (const [pageIndex, page] of pages.entries()) {
    assertRecord(page, `${label}.pages[${pageIndex}]`);
    requireString(page.id, `${label}.pages[${pageIndex}].id`);
    if (pageIds.has(page.id)) throw new SyncError('INVALID_SCHEMA', `${label} has duplicate page ID ${page.id}`);
    pageIds.add(page.id);
    if (!Array.isArray(page.items))
      throw new SyncError('INVALID_SCHEMA', `${label}.pages[${pageIndex}].items must be an array`);
    for (const [itemIndex, item] of page.items.entries()) {
      assertRecord(item, `${label}.pages[${pageIndex}].items[${itemIndex}]`);
      requireString(item.id, `${label}.pages[${pageIndex}].items[${itemIndex}].id`);
      if (itemIds.has(item.id)) throw new SyncError('INVALID_SCHEMA', `${label} has duplicate item ID ${item.id}`);
      itemIds.add(item.id);
      requireString(item.type, `${label}.pages[${pageIndex}].items[${itemIndex}].type`);
    }
  }
}

function validateLessonRecord(data, label, fallbackId) {
  assertRecord(data, label);
  requireString(data.id ?? fallbackId, `${label}.id`);
  if (data.kind === undefined || data.kind === 'lesson') {
    requireString(data.title, `${label}.title`);
    if (data.description !== undefined && typeof data.description !== 'string')
      throw new SyncError('INVALID_SCHEMA', `${label}.description must be a string`);
    requireString(data.type, `${label}.type`);
    validatePages(data.pages, label);
  } else if (data.kind === 'test') {
    if (!Array.isArray(data.rotationVersions))
      throw new SyncError('INVALID_SCHEMA', `${label}.rotationVersions must be an array`);
    const ids = data.rotationVersions.map(reference => {
      assertRecord(reference, `${label}.rotationVersions entry`);
      return requireString(reference.versionId, `${label}.rotationVersions.versionId`);
    });
    if (new Set(ids).size !== ids.length)
      throw new SyncError('INVALID_SCHEMA', `${label} has duplicate version references`);
  } else {
    throw new SyncError('INVALID_SCHEMA', `${label}.kind must be lesson or test`);
  }
}

export function collectPoolIds(value) {
  const result = new Set();
  const visit = (current, key = '', parentKey = '') => {
    if (typeof current === 'string' && POOL_REFERENCE_KEYS.has(key)) {
      if (parentKey === 'generatorConfig' && ['poolId', 'pool_id'].includes(key)) return;
      result.add(current);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(entry => visit(entry, key, parentKey));
      return;
    }
    if (!isObject(current)) return;
    Object.entries(current).forEach(([childKey, childValue]) => {
      if (
        key === 'generatorConfig' &&
        ['poolId', 'pool_id'].includes(childKey) &&
        current.wordSource === 'pool' &&
        typeof childValue === 'string'
      ) {
        result.add(childValue);
        return;
      }
      visit(childValue, childKey, key);
    });
  };
  visit(value);
  return result;
}

export function collectWordIds(value) {
  const result = new Set();
  const visit = (current, key = '') => {
    if (typeof current === 'string' && key === 'wordId') {
      result.add(current);
      return;
    }
    if (Array.isArray(current)) {
      if (WORD_ID_ARRAY_KEYS.has(key)) {
        current.forEach(entry => {
          if (typeof entry === 'string' && entry.trim()) result.add(entry);
        });
        return;
      }
      current.forEach(entry => visit(entry, key));
      return;
    }
    if (!isObject(current)) return;
    Object.entries(current).forEach(([childKey, childValue]) => visit(childValue, childKey));
  };
  visit(value);
  return result;
}

function isOpaqueFirestoreValue(value) {
  return (
    value instanceof Date ||
    Buffer.isBuffer(value) ||
    value instanceof Uint8Array ||
    isTimestampLike(value) ||
    isGeoPointLike(value) ||
    isDocumentReferenceLike(value)
  );
}

function rewriteFixtureReferences(value, poolRemaps, wordRemaps, key = '') {
  if (typeof value === 'string') {
    if (POOL_REFERENCE_KEYS.has(key) && poolRemaps.has(value)) return poolRemaps.get(value);
    if (key === 'wordId' && wordRemaps.has(value)) return wordRemaps.get(value);
    return value;
  }
  if (Array.isArray(value)) {
    if (WORD_ID_ARRAY_KEYS.has(key)) {
      return value.map(entry => (typeof entry === 'string' && wordRemaps.has(entry) ? wordRemaps.get(entry) : entry));
    }
    return value.map(entry => rewriteFixtureReferences(entry, poolRemaps, wordRemaps, key));
  }
  if (!isObject(value) || isOpaqueFirestoreValue(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => {
      if (key === 'generatorConfig' && ['poolId', 'pool_id'].includes(childKey) && value.wordSource !== 'pool') {
        return [childKey, childValue];
      }
      return [childKey, rewriteFixtureReferences(childValue, poolRemaps, wordRemaps, childKey)];
    })
  );
}

function fixtureCloneId(kind, originalId, targetHash) {
  return `dev-fixture-${kind}-${sha256({ kind, originalId, targetHash }).slice(0, 32)}`;
}

export function collectConfiguredWordCollections(value) {
  const result = new Set();
  const visit = current => {
    if (Array.isArray(current)) return current.forEach(visit);
    if (!isObject(current)) return;
    if (typeof current.collection === 'string') result.add(current.collection);
    Object.values(current).forEach(visit);
  };
  visit(value);
  return result;
}

export function lessonIdFromStorageName(name) {
  if (!name.startsWith(LESSONS_PREFIX)) return null;
  const rest = name.slice(LESSONS_PREFIX.length);
  const slash = rest.indexOf('/');
  return slash === -1 ? rest || null : rest.slice(0, slash) || null;
}

export function assertStorageScope(records, label) {
  for (const record of records) {
    if (isZeroByteStorageFolderMarker(record)) continue;
    const normalized = normalizeStorageRecord(record);
    if (!normalized.name.startsWith(LESSONS_PREFIX) || !lessonIdFromStorageName(normalized.name)) {
      throw new SyncError('INVALID_STORAGE_SCOPE', `${label} contains an object outside lessons/**`, {
        name: normalized.name,
      });
    }
    if (!normalized.md5Hash && !normalized.crc32c)
      throw new SyncError('MISSING_STORAGE_CHECKSUM', `${label} object ${normalized.name} has no checksum`);
  }
}

function fixtureLessons(targetCollections, sourceCollections) {
  const targetLessons = recordsById(targetCollections.lessons ?? []);
  const sourceIds = new Set((sourceCollections.lessons ?? []).map(record => record.id));
  const ids = new Set();
  const reasons = {};
  for (const [id, record] of targetLessons) {
    if (record.data.kind === 'test') {
      ids.add(id);
      reasons[id] = ['kind:test'];
    }
  }
  for (const membership of targetCollections.practiceCategoryMemberships ?? []) {
    const lessonId = membership.data?.lessonId;
    if (typeof lessonId !== 'string' || !lessonId)
      throw new SyncError('INVALID_FIXTURE_DEPENDENCY', `Membership ${membership.id} has no lessonId`);
    if (!targetLessons.has(lessonId))
      throw new SyncError(
        'MISSING_FIXTURE_DEPENDENCY',
        `Membership ${membership.id} references missing lesson ${lessonId}`
      );
    if (!sourceIds.has(lessonId)) {
      ids.add(lessonId);
      reasons[lessonId] = [...new Set([...(reasons[lessonId] ?? []), `membership:${membership.id}`])];
    }
  }
  return { ids, reasons };
}

function assertCollision(kind, id, source, target) {
  if (source && target && source.hash !== target.hash) {
    throw new SyncError('AMBIGUOUS_FIXTURE_DEPENDENCY', `${kind} ${id} differs between production and dev`, {
      kind,
      id,
      sourceHash: source.hash,
      targetHash: target.hash,
    });
  }
}

function assertCloneDestination(collection, clone, sourceRecords, targetRecords) {
  const source = sourceRecords.get(clone.id);
  if (source) {
    throw new SyncError('FIXTURE_REMAP_COLLISION', `Fixture clone ${collection}/${clone.id} collides with production`, {
      collection,
      id: clone.id,
      sourceHash: source.hash,
      cloneHash: clone.hash,
    });
  }
  const target = targetRecords.get(clone.id);
  if (target && target.hash !== clone.hash) {
    throw new SyncError(
      'FIXTURE_REMAP_COLLISION',
      `Fixture clone ${collection}/${clone.id} collides with different dev data`,
      {
        collection,
        id: clone.id,
        targetHash: target.hash,
        cloneHash: clone.hash,
      }
    );
  }
  return target ?? clone;
}

/**
 * Preserve exact dev-only lesson fixtures when their pool/word IDs collide
 * with different production content. Clones stay inside mirrored collections;
 * protected version/draft records are never rewritten.
 */
export function resolveFixtureDependencyCollisions(sourceState, targetState) {
  const source = normalizedCollections(sourceState.collections);
  const target = normalizedTargetCollections(targetState);
  const targetMirrored = normalizedCollections(targetState.collections);
  const sourceLessons = recordsById(source.lessons ?? []);
  const targetLessons = recordsById(target.lessons ?? []);
  const sourcePools = recordsById(source.vocabulary_pools ?? []);
  const targetPools = recordsById(target.vocabulary_pools ?? []);
  const sourceWords = recordsById(source.vocabulary_words_v5 ?? []);
  const targetWords = recordsById(target.vocabulary_words_v5 ?? []);
  const fixture = fixtureLessons(target, source);

  const mutableLessons = [...fixture.ids].map(id => targetLessons.get(id)).filter(Boolean);
  for (const lesson of mutableLessons)
    assertCollision('lesson fixture', lesson.id, sourceLessons.get(lesson.id), lesson);

  const protectedRecords = [
    ...(target.testVersions ?? []).map(record => ({ collection: 'testVersions', record })),
    ...(target.testVersionDrafts ?? []).map(record => ({ collection: 'testVersionDrafts', record })),
  ];
  const mutablePoolIds = new Set(mutableLessons.flatMap(record => [...collectPoolIds(record.data)]));
  const protectedPoolIds = new Set(protectedRecords.flatMap(({ record }) => [...collectPoolIds(record.data)]));
  const mutableDirectWordIds = new Set(mutableLessons.flatMap(record => [...collectWordIds(record.data)]));
  const protectedDirectWordIds = new Set(protectedRecords.flatMap(({ record }) => [...collectWordIds(record.data)]));

  // Protected references retain the original strict behavior because the
  // migration is forbidden from editing their collections.
  for (const poolId of protectedPoolIds) {
    assertCollision('protected vocabulary pool fixture', poolId, sourcePools.get(poolId), targetPools.get(poolId));
    const selectedPool = targetPools.get(poolId) ?? sourcePools.get(poolId);
    if (!selectedPool) continue;
    if (!Array.isArray(selectedPool.data.wordDocIds)) {
      throw new SyncError('INVALID_FIXTURE_DEPENDENCY', `Vocabulary pool ${poolId} has an invalid wordDocIds list`);
    }
    for (const wordId of selectedPool.data.wordDocIds) {
      assertCollision('protected vocabulary word fixture', wordId, sourceWords.get(wordId), targetWords.get(wordId));
    }
  }
  for (const wordId of protectedDirectWordIds) {
    assertCollision('protected vocabulary word fixture', wordId, sourceWords.get(wordId), targetWords.get(wordId));
  }

  const poolsNeedingClone = new Set();
  const mutablePoolWordIds = new Set();
  for (const poolId of mutablePoolIds) {
    const sourcePool = sourcePools.get(poolId);
    const targetPool = targetPools.get(poolId);
    if (!targetPool) continue;
    if (
      !Array.isArray(targetPool.data.wordDocIds) ||
      targetPool.data.wordDocIds.some(id => typeof id !== 'string' || !id.trim())
    ) {
      throw new SyncError('INVALID_FIXTURE_DEPENDENCY', `Vocabulary pool ${poolId} has an invalid wordDocIds list`);
    }
    for (const wordId of targetPool.data.wordDocIds) mutablePoolWordIds.add(wordId);
    if (sourcePool && sourcePool.hash !== targetPool.hash) poolsNeedingClone.add(poolId);
  }

  const wordRemaps = new Map();
  for (const wordId of new Set([...mutableDirectWordIds, ...mutablePoolWordIds])) {
    const sourceWord = sourceWords.get(wordId);
    const targetWord = targetWords.get(wordId);
    if (!sourceWord || !targetWord || sourceWord.hash === targetWord.hash) continue;
    if (protectedDirectWordIds.has(wordId)) {
      throw new SyncError(
        'AMBIGUOUS_FIXTURE_DEPENDENCY',
        `Protected fixture word ${wordId} differs between production and dev`
      );
    }
    wordRemaps.set(wordId, fixtureCloneId('word', wordId, targetWord.hash));
  }

  for (const poolId of mutablePoolIds) {
    const targetPool = targetPools.get(poolId);
    if (!targetPool || !Array.isArray(targetPool.data.wordDocIds)) continue;
    if (targetPool.data.wordDocIds.some(wordId => wordRemaps.has(wordId))) poolsNeedingClone.add(poolId);
  }
  for (const poolId of poolsNeedingClone) {
    if (protectedPoolIds.has(poolId)) {
      throw new SyncError('AMBIGUOUS_FIXTURE_DEPENDENCY', `Protected fixture pool ${poolId} requires a remap`);
    }
  }

  const poolRemaps = new Map();
  for (const poolId of [...poolsNeedingClone].sort()) {
    const targetPool = targetPools.get(poolId);
    poolRemaps.set(poolId, fixtureCloneId('pool', poolId, targetPool.hash));
  }

  const clonedWords = [];
  for (const [originalId, remappedId] of [...wordRemaps.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const targetWord = targetWords.get(originalId);
    const clone = normalizeDocumentRecord('vocabulary_words_v5', { id: remappedId, data: targetWord.data });
    clonedWords.push(assertCloneDestination('vocabulary_words_v5', clone, sourceWords, targetWords));
  }

  const clonedPools = [];
  for (const [originalId, remappedId] of [...poolRemaps.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const targetPool = targetPools.get(originalId);
    const data = rewriteFixtureReferences(targetPool.data, new Map(), wordRemaps);
    const clone = normalizeDocumentRecord('vocabulary_pools', { id: remappedId, data });
    clonedPools.push(assertCloneDestination('vocabulary_pools', clone, sourcePools, targetPools));
  }

  const transformedLessons = mutableLessons.map(record => {
    const data = rewriteFixtureReferences(record.data, poolRemaps, wordRemaps);
    return normalizeDocumentRecord('lessons', {
      id: record.id,
      data,
      createTime: record.createTime,
      updateTime: record.updateTime,
    });
  });

  const effectiveCollections = { ...targetMirrored };
  const lessonMap = recordsById(targetMirrored.lessons ?? []);
  for (const record of transformedLessons) lessonMap.set(record.id, record);
  effectiveCollections.lessons = [...lessonMap.values()];
  const poolMap = recordsById(targetMirrored.vocabulary_pools ?? []);
  for (const record of clonedPools) poolMap.set(record.id, record);
  effectiveCollections.vocabulary_pools = [...poolMap.values()];
  const wordMap = recordsById(targetMirrored.vocabulary_words_v5 ?? []);
  for (const record of clonedWords) wordMap.set(record.id, record);
  effectiveCollections.vocabulary_words_v5 = [...wordMap.values()];

  const affectedLessonIds = transformedLessons
    .filter(record => targetLessons.get(record.id)?.hash !== record.hash)
    .map(record => record.id)
    .sort();
  const fixtureRemaps = [
    ...[...poolRemaps.entries()].map(([originalId, remappedId]) => ({
      kind: 'vocabulary_pool',
      originalId,
      remappedId,
      sourceHash: sourcePools.get(originalId)?.hash ?? null,
      targetHash: targetPools.get(originalId)?.hash ?? null,
    })),
    ...[...wordRemaps.entries()].map(([originalId, remappedId]) => ({
      kind: 'vocabulary_word',
      originalId,
      remappedId,
      sourceHash: sourceWords.get(originalId)?.hash ?? null,
      targetHash: targetWords.get(originalId)?.hash ?? null,
    })),
  ].sort((left, right) => `${left.kind}:${left.originalId}`.localeCompare(`${right.kind}:${right.originalId}`));

  return {
    targetState: { ...targetState, collections: effectiveCollections },
    fixtureRemaps,
    affectedLessonIds,
  };
}

export function collectFixtureClosure(sourceState, targetState) {
  const source = normalizedCollections(sourceState.collections);
  const target = normalizedTargetCollections(targetState);
  const sourceLessons = recordsById(source.lessons ?? []);
  const targetLessons = recordsById(target.lessons ?? []);
  const sourcePools = recordsById(source.vocabulary_pools ?? []);
  const targetPools = recordsById(target.vocabulary_pools ?? []);
  const sourceWords = recordsById(source.vocabulary_words_v5 ?? []);
  const targetWords = recordsById(target.vocabulary_words_v5 ?? []);
  const fixture = fixtureLessons(target, source);
  for (const id of fixture.ids) assertCollision('lesson fixture', id, sourceLessons.get(id), targetLessons.get(id));

  const poolIds = new Set();
  const wordIds = new Set();
  const protectedWordCollections = new Set();
  const dependencySources = [
    ...[...fixture.ids].map(id => targetLessons.get(id)?.data),
    ...(target.testVersions ?? []).map(record => record.data),
    ...(target.testVersionDrafts ?? []).map(record => record.data),
  ];
  for (const record of dependencySources) {
    for (const poolId of collectPoolIds(record)) poolIds.add(poolId);
    for (const wordId of collectWordIds(record)) wordIds.add(wordId);
    for (const collection of collectConfiguredWordCollections(record)) {
      if (collection === 'words-latin-dev') protectedWordCollections.add(collection);
    }
  }

  const pendingPools = [...poolIds];
  while (pendingPools.length) {
    const poolId = pendingPools.pop();
    const targetPool = targetPools.get(poolId);
    const sourcePool = sourcePools.get(poolId);
    if (!targetPool && !sourcePool)
      throw new SyncError('MISSING_FIXTURE_DEPENDENCY', `Fixture references missing vocabulary pool ${poolId}`);
    assertCollision('vocabulary pool fixture', poolId, sourcePool, targetPool);
    const selectedPool = targetPool ?? sourcePool;
    if (
      !Array.isArray(selectedPool.data.wordDocIds) ||
      selectedPool.data.wordDocIds.some(id => typeof id !== 'string' || !id.trim())
    ) {
      throw new SyncError('INVALID_FIXTURE_DEPENDENCY', `Vocabulary pool ${poolId} has an invalid wordDocIds list`);
    }
    for (const wordId of selectedPool.data.wordDocIds) wordIds.add(wordId);
  }
  for (const wordId of wordIds) {
    const targetWord = targetWords.get(wordId);
    const sourceWord = sourceWords.get(wordId);
    if (!targetWord && !sourceWord)
      throw new SyncError('MISSING_FIXTURE_DEPENDENCY', `Fixture references missing vocabulary word ${wordId}`);
    assertCollision('vocabulary word fixture', wordId, sourceWord, targetWord);
  }
  return {
    preservedLessonIds: fixture.ids,
    preservedLessonReasons: fixture.reasons,
    preservedPoolIds: poolIds,
    preservedWordIds: wordIds,
    preservedStorageLessonIds: new Set(fixture.ids),
    protectedWordCollections,
  };
}

function validateSourceState(sourceState) {
  const collections = normalizedCollections(sourceState.collections);
  const lessons = collections.lessons ?? [];
  const paths = collections.learningPaths ?? [];
  const pools = collections.vocabulary_pools ?? [];
  const words = collections.vocabulary_words_v5 ?? [];
  for (const record of lessons) validateLessonRecord(record.data, `source lessons/${record.id}`, record.id);
  for (const record of paths)
    validateStrictLearningPath(
      { ...record.data, id: record.data.id ?? record.id },
      `source learningPaths/${record.id}`
    );
  const wordIds = new Set(words.map(record => record.id));
  const poolIds = new Set(pools.map(record => record.id));
  for (const pool of pools) {
    if (!Array.isArray(pool.data.wordDocIds))
      throw new SyncError('INVALID_SCHEMA', `source vocabulary_pools/${pool.id}.wordDocIds must be an array`);
    for (const wordId of pool.data.wordDocIds) {
      if (typeof wordId !== 'string' || !wordId.trim() || !wordIds.has(wordId))
        throw new SyncError('MISSING_SOURCE_REFERENCE', `Source pool ${pool.id} references missing word ${wordId}`);
    }
  }
  const lessonIds = new Set(lessons.map(record => record.id));
  for (const path of paths)
    for (const unitId of path.data.unitIds)
      if (!lessonIds.has(unitId))
        throw new SyncError('MISSING_SOURCE_REFERENCE', `Source path references missing lesson ${unitId}`);
  for (const lesson of lessons) {
    for (const poolId of collectPoolIds(lesson.data))
      if (!poolIds.has(poolId))
        throw new SyncError('MISSING_SOURCE_REFERENCE', `Source lesson ${lesson.id} references missing pool ${poolId}`);
    for (const wordId of collectWordIds(lesson.data))
      if (!wordIds.has(wordId))
        throw new SyncError('MISSING_SOURCE_REFERENCE', `Source lesson ${lesson.id} references missing word ${wordId}`);
    if ([...collectConfiguredWordCollections(lesson.data)].includes('words-latin-dev'))
      throw new SyncError('PROTECTED_COLLECTION_REFERENCE', `Source lesson ${lesson.id} references words-latin-dev`);
  }
}

export function validateProjectedState(sourceState, targetState, closure) {
  const source = normalizedCollections(sourceState.collections);
  const target = normalizedTargetCollections(targetState);
  const lessons = new Map((source.lessons ?? []).map(record => [record.id, record]));
  const pools = new Map((source.vocabulary_pools ?? []).map(record => [record.id, record]));
  const words = new Map((source.vocabulary_words_v5 ?? []).map(record => [record.id, record]));
  for (const id of closure.preservedLessonIds)
    if (!lessons.has(id) && target.lessons?.some(record => record.id === id))
      lessons.set(
        id,
        target.lessons.find(record => record.id === id)
      );
  for (const id of closure.preservedPoolIds)
    if (!pools.has(id) && target.vocabulary_pools?.some(record => record.id === id))
      pools.set(
        id,
        target.vocabulary_pools.find(record => record.id === id)
      );
  for (const id of closure.preservedWordIds)
    if (!words.has(id) && target.vocabulary_words_v5?.some(record => record.id === id))
      words.set(
        id,
        target.vocabulary_words_v5.find(record => record.id === id)
      );
  for (const [id, record] of lessons) validateLessonRecord(record.data, `projected lessons/${id}`, id);
  for (const record of source.learningPaths ?? []) {
    validateStrictLearningPath(
      { ...record.data, id: record.data.id ?? record.id },
      `projected learningPaths/${record.id}`
    );
    for (const unitId of record.data.unitIds)
      if (!lessons.has(unitId))
        throw new SyncError('MISSING_PROJECTED_REFERENCE', `Learning path references missing lesson ${unitId}`);
  }
  for (const [id, pool] of pools) {
    if (!Array.isArray(pool.data.wordDocIds))
      throw new SyncError('INVALID_SCHEMA', `Projected pool ${id} has no wordDocIds array`);
    for (const wordId of pool.data.wordDocIds)
      if (!words.has(wordId))
        throw new SyncError('MISSING_PROJECTED_REFERENCE', `Projected pool ${id} references missing word ${wordId}`);
  }
  for (const [id, lesson] of lessons) {
    for (const poolId of collectPoolIds(lesson.data))
      if (!pools.has(poolId))
        throw new SyncError('MISSING_PROJECTED_REFERENCE', `Projected lesson ${id} references missing pool ${poolId}`);
    for (const wordId of collectWordIds(lesson.data))
      if (!words.has(wordId))
        throw new SyncError('MISSING_PROJECTED_REFERENCE', `Projected lesson ${id} references missing word ${wordId}`);
    if (lesson.data.kind === 'test') {
      const versions = new Map((target.testVersions ?? []).map(record => [record.id, record]));
      for (const reference of lesson.data.rotationVersions)
        if (!versions.has(reference.versionId))
          throw new SyncError(
            'MISSING_PROJECTED_REFERENCE',
            `Test ${id} references missing version ${reference.versionId}`
          );
    }
  }
  for (const collection of ['testVersions', 'testVersionDrafts']) {
    for (const record of target[collection] ?? []) {
      for (const poolId of collectPoolIds(record.data))
        if (!pools.has(poolId))
          throw new SyncError(
            'MISSING_PROJECTED_REFERENCE',
            `${collection}/${record.id} references missing pool ${poolId}`
          );
      for (const wordId of collectWordIds(record.data))
        if (!words.has(wordId))
          throw new SyncError(
            'MISSING_PROJECTED_REFERENCE',
            `${collection}/${record.id} references missing word ${wordId}`
          );
    }
  }
  return {
    lessonCount: lessons.size,
    poolCount: pools.size,
    wordCount: words.size,
    testVersionCount: (target.testVersions ?? []).length,
    testVersionDraftCount: (target.testVersionDrafts ?? []).length,
  };
}

/** Validate the current dev graph without consulting the current production snapshot. */
export function validateCurrentTargetState(targetState, closure) {
  const target = normalizedTargetCollections(targetState);
  const lessons = recordsById(target.lessons ?? []);
  const paths = target.learningPaths ?? [];
  const pools = recordsById(target.vocabulary_pools ?? []);
  const words = recordsById(target.vocabulary_words_v5 ?? []);
  for (const id of closure.preservedLessonIds)
    if (!lessons.has(id))
      throw new SyncError('MISSING_PROJECTED_REFERENCE', `Current dev is missing preserved lesson ${id}`);
  for (const id of closure.preservedPoolIds)
    if (!pools.has(id))
      throw new SyncError('MISSING_PROJECTED_REFERENCE', `Current dev is missing preserved pool ${id}`);
  for (const id of closure.preservedWordIds)
    if (!words.has(id))
      throw new SyncError('MISSING_PROJECTED_REFERENCE', `Current dev is missing preserved word ${id}`);
  for (const [id, record] of lessons) validateLessonRecord(record.data, `current dev lessons/${id}`, id);
  const lessonIds = new Set(lessons.keys());
  for (const record of paths) {
    validateStrictLearningPath(
      { ...record.data, id: record.data.id ?? record.id },
      `current dev learningPaths/${record.id}`
    );
    for (const unitId of record.data.unitIds)
      if (!lessonIds.has(unitId))
        throw new SyncError('MISSING_PROJECTED_REFERENCE', `Current dev path references missing lesson ${unitId}`);
  }
  for (const [id, pool] of pools) {
    if (!Array.isArray(pool.data.wordDocIds))
      throw new SyncError('INVALID_SCHEMA', `Current dev pool ${id} has no wordDocIds array`);
    for (const wordId of pool.data.wordDocIds)
      if (!words.has(wordId))
        throw new SyncError('MISSING_PROJECTED_REFERENCE', `Current dev pool ${id} references missing word ${wordId}`);
  }
  const testVersionIds = new Set((target.testVersions ?? []).map(record => record.id));
  for (const [id, lesson] of lessons) {
    for (const poolId of collectPoolIds(lesson.data))
      if (!pools.has(poolId))
        throw new SyncError(
          'MISSING_PROJECTED_REFERENCE',
          `Current dev lesson ${id} references missing pool ${poolId}`
        );
    for (const wordId of collectWordIds(lesson.data))
      if (!words.has(wordId))
        throw new SyncError(
          'MISSING_PROJECTED_REFERENCE',
          `Current dev lesson ${id} references missing word ${wordId}`
        );
    if (lesson.data.kind === 'test')
      for (const reference of lesson.data.rotationVersions)
        if (!testVersionIds.has(reference.versionId))
          throw new SyncError(
            'MISSING_PROJECTED_REFERENCE',
            `Current dev test ${id} references missing version ${reference.versionId}`
          );
  }
  for (const collection of ['testVersions', 'testVersionDrafts']) {
    for (const record of target[collection] ?? []) {
      for (const poolId of collectPoolIds(record.data))
        if (!pools.has(poolId))
          throw new SyncError(
            'MISSING_PROJECTED_REFERENCE',
            `Current dev ${collection}/${record.id} references missing pool ${poolId}`
          );
      for (const wordId of collectWordIds(record.data))
        if (!words.has(wordId))
          throw new SyncError(
            'MISSING_PROJECTED_REFERENCE',
            `Current dev ${collection}/${record.id} references missing word ${wordId}`
          );
    }
  }
  return {
    lessonCount: lessons.size,
    poolCount: pools.size,
    wordCount: words.size,
    testVersionCount: (target.testVersions ?? []).length,
    testVersionDraftCount: (target.testVersionDrafts ?? []).length,
  };
}

function diffDocuments(collection, desiredRecords, targetRecords, preservedIds) {
  const desired = recordsById(desiredRecords);
  const target = recordsById(targetRecords);
  const operations = [];
  for (const id of [...desired.keys()].sort()) {
    const source = desired.get(id);
    const current = target.get(id);
    if (!current) operations.push({ collection, id, action: 'create', reason: 'missing-in-dev', source, target: null });
    else if (source.hash !== current.hash)
      operations.push({ collection, id, action: 'update', reason: 'content-differs', source, target: current });
    else
      operations.push({
        collection,
        id,
        action: 'preserve',
        reason: 'already-matches-source',
        source,
        target: current,
      });
  }
  for (const id of [...target.keys()].sort()) {
    if (desired.has(id)) continue;
    if (preservedIds.has(id))
      operations.push({
        collection,
        id,
        action: 'preserve',
        reason: 'fixture-dependency',
        source: null,
        target: target.get(id),
      });
    else
      operations.push({
        collection,
        id,
        action: 'delete',
        reason: 'stale-in-dev',
        source: null,
        target: target.get(id),
      });
  }
  return operations;
}

function diffStorage(sourceRecords, targetRecords, preservedLessonIds) {
  const source = storageByName(sourceRecords);
  const target = storageByName(targetRecords);
  const operations = [];
  for (const name of [...source.keys()].sort()) {
    const sourceRecord = source.get(name);
    const targetRecord = target.get(name);
    if (!targetRecord)
      operations.push({ name, action: 'create', reason: 'missing-in-dev', source: sourceRecord, target: null });
    else if (sourceRecord.contentHash !== targetRecord.contentHash)
      operations.push({
        name,
        action: 'update',
        reason: 'checksum-or-metadata-differs',
        source: sourceRecord,
        target: targetRecord,
      });
    else
      operations.push({
        name,
        action: 'preserve',
        reason: 'already-matches-source',
        source: sourceRecord,
        target: targetRecord,
      });
  }
  for (const name of [...target.keys()].sort()) {
    if (source.has(name)) continue;
    const lessonId = lessonIdFromStorageName(name);
    if (lessonId && preservedLessonIds.has(lessonId))
      operations.push({
        name,
        action: 'preserve',
        reason: 'fixture-lesson-prefix',
        source: null,
        target: target.get(name),
      });
    else operations.push({ name, action: 'delete', reason: 'stale-in-dev', source: null, target: target.get(name) });
  }
  return operations;
}

function operationAudit(operation) {
  return {
    ...(operation.collection ? { collection: operation.collection, id: operation.id } : { name: operation.name }),
    action: operation.action,
    reason: operation.reason,
    sourceHash: operation.source?.hash ?? operation.source?.contentHash ?? null,
    targetHash: operation.target?.hash ?? operation.target?.contentHash ?? null,
    sourceContentHash: operation.source?.contentHash ?? null,
    targetContentHash: operation.target?.contentHash ?? null,
    targetUpdateTime: formatTimeForHash(operation.target?.updateTime),
    targetGeneration: operation.target?.generation ?? null,
  };
}

function operationForHash(operation) {
  return operationAudit(operation);
}

function projectedState(sourceState, targetState, closure) {
  const source = normalizedCollections(sourceState.collections);
  const target = normalizedCollections(targetState.collections);
  const sourceStorage = contentStorageRecords(sourceState.storage ?? []);
  const targetStorage = contentStorageRecords(targetState.storage ?? []);
  const excludedCollections = { ...(targetState.excludedCollections ?? {}) };
  for (const collection of PRESERVED_REFERENCE_COLLECTIONS) {
    if (excludedCollections[collection] === undefined && targetState.collections?.[collection] !== undefined) {
      excludedCollections[collection] = targetState.collections[collection];
    }
  }
  const collections = {};
  for (const collection of MIRRORED_COLLECTIONS) {
    const desired = new Map((source[collection] ?? []).map(record => [record.id, record]));
    const preserve =
      collection === 'lessons'
        ? closure.preservedLessonIds
        : collection === 'vocabulary_pools'
          ? closure.preservedPoolIds
          : collection === 'vocabulary_words_v5'
            ? closure.preservedWordIds
            : new Set();
    for (const record of target[collection] ?? [])
      if (preserve.has(record.id) && !desired.has(record.id)) desired.set(record.id, record);
    collections[collection] = [...desired.values()];
  }
  return {
    projectId: targetState.projectId,
    storageBucket: targetState.storageBucket,
    database: targetState.database,
    collections: { ...collections, learningPaths: source.learningPaths ?? [] },
    excludedCollections,
    storage: [
      ...sourceStorage,
      ...targetStorage.filter(record => {
        const lessonId = lessonIdFromStorageName(record.name);
        return (
          lessonId &&
          closure.preservedStorageLessonIds.has(lessonId) &&
          !sourceStorage.some(sourceRecord => sourceRecord.name === record.name)
        );
      }),
    ],
    excludedStorage: targetState.excludedStorage,
    authFingerprint: targetState.authFingerprint,
  };
}

export function createPlan(sourceState, targetState) {
  if (sourceState.projectId !== SOURCE_PROJECT_ID)
    throw new SyncError('SOURCE_PROJECT_MISMATCH', `Source must be ${SOURCE_PROJECT_ID}`);
  if (targetState.projectId !== TARGET_PROJECT_ID)
    throw new SyncError('TARGET_PROJECT_MISMATCH', `Target must be ${TARGET_PROJECT_ID}`);
  if (sourceState.storageBucket !== SOURCE_STORAGE_BUCKET)
    throw new SyncError('SOURCE_BUCKET_MISMATCH', `Source bucket must be ${SOURCE_STORAGE_BUCKET}`);
  if (targetState.storageBucket !== TARGET_STORAGE_BUCKET)
    throw new SyncError('TARGET_BUCKET_MISMATCH', `Target bucket must be ${TARGET_STORAGE_BUCKET}`);
  validateSourceState(sourceState);
  assertStorageScope(sourceState.storage ?? [], 'Source');
  assertStorageScope(targetState.storage ?? [], 'Target controlled Storage');
  const fixtureResolution = resolveFixtureDependencyCollisions(sourceState, targetState);
  const effectiveTargetState = fixtureResolution.targetState;
  const closure = collectFixtureClosure(sourceState, effectiveTargetState);
  const projectedValidation = validateProjectedState(sourceState, effectiveTargetState, closure);
  const expectedState = projectedState(sourceState, effectiveTargetState, closure);
  const sourceManifest = buildManifest(sourceState);
  const targetManifest = buildManifest(targetState);
  const sourceContentFingerprint = buildContentFingerprint(sourceState);
  const targetContentFingerprint = buildContentFingerprint(targetState);
  const firestoreOperations = [
    ...diffDocuments(
      'vocabulary_words_v5',
      expectedState.collections.vocabulary_words_v5 ?? [],
      targetState.collections.vocabulary_words_v5 ?? [],
      closure.preservedWordIds
    ),
    ...diffDocuments(
      'vocabulary_pools',
      expectedState.collections.vocabulary_pools ?? [],
      targetState.collections.vocabulary_pools ?? [],
      closure.preservedPoolIds
    ),
    ...diffDocuments(
      'lessons',
      expectedState.collections.lessons ?? [],
      targetState.collections.lessons ?? [],
      closure.preservedLessonIds
    ),
    ...diffDocuments(
      'learningPaths',
      expectedState.collections.learningPaths ?? [],
      targetState.collections.learningPaths ?? [],
      new Set()
    ),
  ];
  const storageOperations = diffStorage(
    sourceState.storage ?? [],
    targetState.storage ?? [],
    closure.preservedStorageLessonIds
  );
  for (const operation of firestoreOperations)
    if (!MIRRORED_COLLECTIONS.includes(operation.collection))
      throw new SyncError('WRITE_SCOPE_VIOLATION', `Plan attempted protected collection ${operation.collection}`);
  const planPayload = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    tool: TOOL_NAME,
    sourceProjectId: SOURCE_PROJECT_ID,
    targetProjectId: TARGET_PROJECT_ID,
    sourceMirroredContentFingerprint: buildMirroredContentFingerprint(sourceState),
    targetMirroredContentFingerprint: buildMirroredContentFingerprint(targetState),
    fixtureClosure: {
      preservedLessonIds: [...closure.preservedLessonIds].sort(),
      preservedPoolIds: [...closure.preservedPoolIds].sort(),
      preservedWordIds: [...closure.preservedWordIds].sort(),
      preservedStorageLessonIds: [...closure.preservedStorageLessonIds].sort(),
      protectedWordCollections: [...closure.protectedWordCollections].sort(),
      fixtureRemaps: fixtureResolution.fixtureRemaps,
      affectedLessonIds: fixtureResolution.affectedLessonIds,
    },
    firestoreOperations: firestoreOperations.map(operationForHash),
    storageOperations: storageOperations.map(operationForHash),
  };
  const planHash = sha256(planPayload);
  return {
    planHash,
    planPayload,
    closure,
    sourceManifest,
    targetManifest,
    sourceContentFingerprint,
    targetContentFingerprint,
    projectedState: expectedState,
    firestoreOperations,
    storageOperations,
    sourceState,
    targetState,
    audit: {
      schemaVersion: PLAN_SCHEMA_VERSION,
      tool: TOOL_NAME,
      mode: 'dry-run',
      readOnly: true,
      source: {
        projectId: SOURCE_PROJECT_ID,
        storageBucket: SOURCE_STORAGE_BUCKET,
        manifestHash: sourceManifest.manifestHash,
        contentFingerprint: sourceContentFingerprint,
        counts: Object.fromEntries(
          Object.entries(sourceManifest.collections).map(([name, records]) => [name, records.length])
        ),
      },
      target: {
        projectId: TARGET_PROJECT_ID,
        storageBucket: TARGET_STORAGE_BUCKET,
        manifestHash: targetManifest.manifestHash,
        contentFingerprint: targetContentFingerprint,
        excludedFingerprint: buildExcludedFingerprint(targetState),
        counts: Object.fromEntries(
          Object.entries(targetManifest.collections).map(([name, records]) => [name, records.length])
        ),
      },
      fixtureClosure: {
        preservedLessonIds: [...closure.preservedLessonIds].sort(),
        preservedLessonReasons: closure.preservedLessonReasons,
        preservedPoolIds: [...closure.preservedPoolIds].sort(),
        preservedWordIds: [...closure.preservedWordIds].sort(),
        preservedStorageLessonIds: [...closure.preservedStorageLessonIds].sort(),
        protectedWordCollections: [...closure.protectedWordCollections].sort(),
        fixtureRemaps: fixtureResolution.fixtureRemaps,
        affectedLessonIds: fixtureResolution.affectedLessonIds,
      },
      validation: { ok: true, projected: projectedValidation },
      firestore: {
        operations: firestoreOperations.map(operationAudit),
        summary: summarizeOperations(firestoreOperations),
      },
      storage: { operations: storageOperations.map(operationAudit), summary: summarizeOperations(storageOperations) },
      preconditions: {
        sourceManifestHash: sourceManifest.manifestHash,
        targetManifestHash: targetManifest.manifestHash,
      },
      planHash,
    },
  };
}

export function encodeFirestoreValue(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return canonicalNumber(value);
  if (typeof value === 'bigint') return { [VALUE_TAG]: 'bigint', value: value.toString() };
  if (value instanceof Date) return { [VALUE_TAG]: 'date', value: value.toISOString() };
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return { [VALUE_TAG]: 'bytes', base64: Buffer.from(value).toString('base64') };
  if (isTimestampLike(value))
    return { [VALUE_TAG]: 'timestamp-parts', seconds: String(value.seconds), nanoseconds: Number(value.nanoseconds) };
  if (isGeoPointLike(value)) return { [VALUE_TAG]: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  if (isDocumentReferenceLike(value)) return { [VALUE_TAG]: 'document-reference', path: value.path };
  if (Array.isArray(value)) return value.map(encodeFirestoreValue);
  if (isObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map(key => [key, encodeFirestoreValue(value[key])])
      .filter(([, entry]) => entry !== undefined);
    return { [VALUE_TAG]: 'map', entries };
  }
  throw new SyncError('UNSUPPORTED_FIRESTORE_VALUE', 'Unsupported Firestore value in backup');
}

export function decodeFirestoreValue(value, db, types = {}) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
    return value;
  if (Array.isArray(value)) return value.map(entry => decodeFirestoreValue(entry, db, types));
  if (!isObject(value)) throw new SyncError('INVALID_BACKUP', 'Invalid encoded Firestore value');
  if (value[VALUE_TAG] === 'map') {
    if (!Array.isArray(value.entries)) throw new SyncError('INVALID_BACKUP', 'Invalid encoded Firestore map');
    return Object.fromEntries(
      value.entries.map(entry => {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string')
          throw new SyncError('INVALID_BACKUP', 'Invalid encoded Firestore map entry');
        return [entry[0], decodeFirestoreValue(entry[1], db, types)];
      })
    );
  }
  if (value[VALUE_TAG] === 'date') return new Date(value.value);
  if (value[VALUE_TAG] === 'bigint') return BigInt(value.value);
  if (value[VALUE_TAG] === 'bytes') return Buffer.from(value.base64, 'base64');
  if (value[VALUE_TAG] === 'document-reference') return db.doc(value.path);
  if (value[VALUE_TAG] === 'number') {
    if (value.value === 'NaN') return Number.NaN;
    if (value.value === 'Infinity') return Infinity;
    if (value.value === '-Infinity') return -Infinity;
    if (value.value === '-0') return -0;
  }
  if (value[VALUE_TAG] === 'geopoint')
    return types.GeoPoint
      ? new types.GeoPoint(value.latitude, value.longitude)
      : { latitude: value.latitude, longitude: value.longitude };
  if (value[VALUE_TAG] === 'timestamp-parts') {
    const seconds = Number(value.seconds);
    const nanoseconds = Number(value.nanoseconds);
    return types.Timestamp ? new types.Timestamp(seconds, nanoseconds) : { seconds, nanoseconds };
  }
  throw new SyncError('INVALID_BACKUP', 'Unknown encoded Firestore value tag');
}

export function safePathSegment(value) {
  // Artifact names are derived from untrusted document/object identifiers. A
  // reversible encoding is unnecessary because the original identifier is
  // retained in the run manifest and the before-image metadata. Hashing also
  // prevents distinct names such as `_25` and `%` from sharing an artifact
  // path.
  return sha256(String(value));
}

export function chunkOperations(operations) {
  const chunks = [];
  let current = [];
  let bytes = 0;
  for (const operation of operations) {
    const operationBytes = Buffer.byteLength(
      canonicalJson({
        collection: operation.collection,
        id: operation.id,
        action: operation.action,
        data: operation.source?.data ?? null,
      })
    );
    if (current.length && (current.length >= MAX_BATCH_WRITES || bytes + operationBytes > MAX_BATCH_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(operation);
    bytes += operationBytes;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export function affectedDocumentOperations(plan) {
  return plan.firestoreOperations.filter(operation => ['create', 'update', 'delete'].includes(operation.action));
}

export function affectedStorageOperations(plan) {
  return plan.storageOperations.filter(operation => ['create', 'update', 'delete'].includes(operation.action));
}

export function assertPlanHash(currentPlanHash, suppliedPlanHash) {
  if (!/^[a-f0-9]{64}$/.test(suppliedPlanHash) || suppliedPlanHash !== currentPlanHash) {
    throw new SyncError('STALE_PLAN_HASH', 'The supplied planHash does not match the current source/target plan', {
      suppliedPlanHash,
      currentPlanHash,
    });
  }
}

export function operationsByCollection(plan, collection) {
  return plan.firestoreOperations.filter(
    operation => operation.collection === collection && ['create', 'update', 'delete'].includes(operation.action)
  );
}

export function summarizeOperationsForRollback(operations) {
  const mapped = operations.map(operation => ({
    action: operation.action === 'restore' ? 'update' : operation.action,
  }));
  return summarizeOperations(mapped);
}

export function summarizeOperations(operations) {
  const summary = { create: 0, update: 0, delete: 0, preserve: 0 };
  for (const operation of operations) summary[operation.action] = (summary[operation.action] ?? 0) + 1;
  return summary;
}

export function runManifestPath(runId) {
  return `runs/${runId}/run-manifest.json`;
}
