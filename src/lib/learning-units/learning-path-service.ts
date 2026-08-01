import { createHash } from 'node:crypto';
import type { DocumentData, DocumentSnapshot, Firestore, QuerySnapshot, Transaction } from 'firebase-admin/firestore';
import {
  DEFAULT_LEARNING_PATH_ID,
  LEARNING_PATHS_COLLECTION,
  LEARNING_UNITS_COLLECTION,
  MOCK_TESTS_COLLECTION,
  TEST_VERSIONS_COLLECTION,
} from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import type { AdminLearningPathView, LearningPathDocument, LearningUnit } from '@/src/types/learning-unit';
import type { RotationVersionReference } from '@/src/types/test';
import { estimateFirestoreDocumentBytes } from '@/src/lib/tests/firestore-size';
import { mockTestDocumentSchema, testVersionDocumentSchema } from '@/src/lib/tests/schemas';
import { validateTestAssignmentGraph } from '@/src/lib/tests/domain';
import { isLessonDocumentData, normalizeLearningUnit } from './domain';
import { validateLessonProgression } from '@/src/utils/lessonProgress';
import type { Lesson } from '@/src/types/lesson';
import {
  learningPathDocumentSchema,
  learningPathMigrationManifestSchema,
  saveLearningPathInputSchema,
  type LearningPathMigrationManifestInput,
  type SaveLearningPathInput,
} from './schemas';
import { LearningPathServiceError } from './learning-path-errors';

export { LearningPathServiceError } from './learning-path-errors';

const MAX_LEARNING_PATH_DOCUMENT_BYTES = 900 * 1024;

function learningPathFromSnapshot(snapshot: DocumentSnapshot): LearningPathDocument | null {
  if (!snapshot.exists) return null;
  const parsed = learningPathDocumentSchema.safeParse({
    ...snapshot.data(),
    id: snapshot.id,
  });
  if (!parsed.success) {
    throw new LearningPathServiceError(
      'STALE_LEARNING_PATH_DATA',
      'The Learning Path contains invalid persisted data',
      409
    );
  }
  return parsed.data;
}

export function parseLearningPathSnapshot(snapshot: DocumentSnapshot): LearningPathDocument | null {
  return learningPathFromSnapshot(snapshot);
}

export function isLearningPathActive(path: LearningPathDocument | null): boolean {
  return Boolean(path && path.cutover?.state !== 'inactive');
}

function parseLearningUnitSnapshot(snapshot: DocumentSnapshot): LearningUnit {
  if (!snapshot.exists) {
    throw new LearningPathServiceError('UNKNOWN_LEARNING_UNIT', `Learning unit ${snapshot.id} does not exist`, 400);
  }

  try {
    return normalizeLearningUnit(snapshot.data(), snapshot.id);
  } catch {
    throw new LearningPathServiceError(
      'INELIGIBLE_LEARNING_UNIT',
      `Learning unit ${snapshot.id} contains invalid persisted data`,
      409
    );
  }
}

function assertDocumentSize(document: LearningPathDocument) {
  let bytes: number;
  try {
    bytes = estimateFirestoreDocumentBytes(document as unknown as Record<string, unknown>);
  } catch {
    throw new LearningPathServiceError('LEARNING_PATH_TOO_LARGE', 'The Learning Path cannot be serialized safely', 422);
  }
  if (bytes > MAX_LEARNING_PATH_DOCUMENT_BYTES) {
    throw new LearningPathServiceError('LEARNING_PATH_TOO_LARGE', 'The Learning Path is too large to save safely', 422);
  }
}

type LegacyNormalSourceRecord = {
  unitId: string;
  liveOrder: number;
};

function compareUnitIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function legacyNormalSourceFromSnapshot(
  snapshot: Pick<QuerySnapshot, 'docs'>,
  rejectLiveTests = false
): LegacyNormalSourceRecord[] {
  const records: LegacyNormalSourceRecord[] = [];
  const invalid: string[] = [];
  const liveTests: string[] = [];

  for (const document of snapshot.docs) {
    const data = document.data() as DocumentData;
    if (data.kind === 'test') {
      liveTests.push(document.id);
      continue;
    }
    if (!isLessonDocumentData(data) || (data.type ?? 'normal') !== 'normal') continue;
    const liveOrder = data.liveOrder;
    if (typeof liveOrder !== 'number' || !Number.isSafeInteger(liveOrder) || liveOrder < 0) {
      invalid.push(`${document.id} has invalid liveOrder ${String(liveOrder)}`);
      continue;
    }
    records.push({ unitId: document.id, liveOrder });
  }

  if (rejectLiveTests && liveTests.length > 0) {
    throw new LearningPathServiceError(
      'PHASE5_TEST_PRESENT',
      `Phase 5 migration found unexpected live test units: ${liveTests.sort().join(', ')}`,
      409
    );
  }
  const orders = new Map<number, string[]>();
  for (const record of records) {
    const ids = orders.get(record.liveOrder) ?? [];
    ids.push(record.unitId);
    orders.set(record.liveOrder, ids);
  }
  for (const [order, ids] of orders) {
    if (ids.length > 1) invalid.push(`liveOrder ${order} is duplicated by ${ids.sort().join(', ')}`);
  }
  if (invalid.length > 0) {
    throw new LearningPathServiceError(
      'INVALID_LEGACY_NORMAL_ORDER',
      `Legacy normal order is ambiguous: ${invalid.join('; ')}`,
      409
    );
  }

  return records.sort((left, right) => left.liveOrder - right.liveOrder || compareUnitIds(left.unitId, right.unitId));
}

export function hashLearningPathMigrationSource(source: LegacyNormalSourceRecord[]): string {
  const canonical = [...source]
    .sort((left, right) => compareUnitIds(left.unitId, right.unitId))
    .map(({ unitId, liveOrder }) => ({ unitId, liveOrder }));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function sameMigrationSource(left: LegacyNormalSourceRecord[], right: LegacyNormalSourceRecord[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (record, index) => record.unitId === right[index]?.unitId && record.liveOrder === right[index]?.liveOrder
    )
  );
}

function assertManifestMatchesSource(manifest: LearningPathMigrationManifestInput, source: LegacyNormalSourceRecord[]) {
  const sourceHash = hashLearningPathMigrationSource(source);
  const manifestSourceHash = hashLearningPathMigrationSource(manifest.source);
  const unitIds = source.map(record => record.unitId);
  if (
    manifestSourceHash !== manifest.sourceHash ||
    sourceHash !== manifest.sourceHash ||
    !sameMigrationSource(manifest.source, source) ||
    !unitIds.every((unitId, index) => manifest.unitIds[index] === unitId) ||
    unitIds.length !== manifest.unitIds.length
  ) {
    throw new LearningPathServiceError(
      'MIGRATION_SOURCE_CHANGED',
      'The legacy normal sequence changed after this manifest was reviewed. Run a new dry run.',
      409
    );
  }
}

async function assertPhase5PathContainsNoTests(transaction: Transaction, db: Firestore, unitIds: string[]) {
  if (unitIds.length === 0) return;
  const snapshots = await transaction.getAll(
    ...unitIds.map(unitId => db.collection(LEARNING_UNITS_COLLECTION).doc(unitId))
  );
  const invalidIds = snapshots
    .filter(snapshot => {
      if (!snapshot.exists) return true;
      const data = snapshot.data();
      return !isLessonDocumentData(data) || (data.type ?? 'normal') !== 'normal';
    })
    .map(snapshot => snapshot.id);
  if (invalidIds.length > 0) {
    throw new LearningPathServiceError(
      'PHASE5_TEST_PRESENT',
      `Phase 5 rollback/retirement requires a lesson-only path; invalid units: ${invalidIds.join(', ')}`,
      409
    );
  }
}

export async function assertUnitDeletionAllowedInTransaction(
  transaction: Transaction,
  db: Firestore,
  unitId: string
): Promise<void> {
  const pathSnapshot = await transaction.get(db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID));
  const path = learningPathFromSnapshot(pathSnapshot);
  if (isLearningPathActive(path) && path!.unitIds.includes(unitId)) {
    throw new LearningPathServiceError(
      'PLACED_UNIT_DELETE',
      'Remove this unit from the Learning Path before deleting it',
      409
    );
  }
}

export async function assertPlacedLessonReplacementAllowedInTransaction(
  transaction: Transaction,
  db: Firestore,
  unitId: string,
  lesson: Pick<Lesson, 'type' | 'pages'>
): Promise<void> {
  const pathSnapshot = await transaction.get(db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID));
  const path = learningPathFromSnapshot(pathSnapshot);
  if (!isLearningPathActive(path) || !path!.unitIds.includes(unitId)) return;

  if (lesson.type !== 'normal') {
    throw new LearningPathServiceError(
      'PLACED_UNIT_INVALID',
      'Remove this lesson from the Learning Path before changing it to a practice lesson',
      400
    );
  }

  const progressionErrors = validateLessonProgression(lesson);
  if (progressionErrors.length > 0) {
    throw new LearningPathServiceError(
      'PLACED_UNIT_INVALID',
      `Remove this lesson from the Learning Path before making it incomplete: ${progressionErrors.join(' ')}`,
      400
    );
  }
}

/**
 * Shared guard for ownership-transfer mutations introduced with mock
 * assignment. A placed normal test must retain at least one structurally valid
 * rotation version in the same transaction that changes ownership.
 */
export async function assertPlacedTestRotationAllowedInTransaction(
  transaction: Transaction,
  db: Firestore,
  testId: string,
  rotationVersions: RotationVersionReference[]
): Promise<void> {
  const path = learningPathFromSnapshot(
    await transaction.get(db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID))
  );
  if (!isLearningPathActive(path) || !path!.unitIds.includes(testId)) return;
  if (rotationVersions.length === 0) {
    throw new LearningPathServiceError(
      'PLACED_UNIT_INVALID',
      'Remove this test from the Learning Path or add another rotation version before changing version ownership',
      400
    );
  }

  const snapshots = await transaction.getAll(
    ...rotationVersions.map(reference => db.collection(TEST_VERSIONS_COLLECTION).doc(reference.versionId))
  );
  const invalid = snapshots.find(snapshot => {
    const parsed = testVersionDocumentSchema.safeParse({
      ...snapshot.data(),
      id: snapshot.id,
    });
    return !snapshot.exists || !parsed.success;
  });
  if (invalid) {
    throw new LearningPathServiceError(
      'PLACED_UNIT_INVALID',
      `Placed test ${testId} would reference missing or invalid version ${invalid.id}`,
      400
    );
  }
}

export async function assertLegacyNormalPlacementAllowedInTransaction(
  transaction: Transaction,
  db: Firestore
): Promise<void> {
  const path = learningPathFromSnapshot(
    await transaction.get(db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID))
  );
  if (!path || path.cutover?.state === 'inactive') return;

  throw new LearningPathServiceError(
    'LEGACY_NORMAL_PLACEMENT_RETIRED',
    path.cutover
      ? 'Normal placement is frozen during Learning Path stabilization. Roll back before using the legacy controls.'
      : 'Normal placement now belongs to the Learning Path organizer.',
    409
  );
}

type LegacyPlacementState = {
  type?: unknown;
  isLive?: unknown;
  liveOrder?: unknown;
  publishedAt?: unknown;
  publishedBy?: unknown;
};

function normalizedLegacyPlacementState(value: LegacyPlacementState | undefined) {
  return {
    type: value?.type ?? 'normal',
    isLive: value?.isLive === true,
    liveOrder: typeof value?.liveOrder === 'number' ? value.liveOrder : null,
    publishedAt: typeof value?.publishedAt === 'string' ? value.publishedAt : null,
    publishedBy: typeof value?.publishedBy === 'string' ? value.publishedBy : null,
  };
}

export async function assertLegacyNormalPlacementChangeAllowedInTransaction(
  transaction: Transaction,
  db: Firestore,
  before: LegacyPlacementState | undefined,
  after: LegacyPlacementState
): Promise<void> {
  const previous = normalizedLegacyPlacementState(
    before ?? {
      type: after.type,
      isLive: false,
      liveOrder: null,
      publishedAt: null,
      publishedBy: null,
    }
  );
  const next = normalizedLegacyPlacementState(after);
  if (previous.type !== 'normal' && next.type !== 'normal') return;

  const placementFieldsChanged =
    previous.isLive !== next.isLive ||
    previous.liveOrder !== next.liveOrder ||
    previous.publishedAt !== next.publishedAt ||
    previous.publishedBy !== next.publishedBy;
  const publishedUnitCrossedNormalBoundary =
    previous.type !== next.type &&
    (previous.isLive ||
      next.isLive ||
      previous.liveOrder !== null ||
      next.liveOrder !== null ||
      previous.publishedAt !== null ||
      next.publishedAt !== null ||
      previous.publishedBy !== null ||
      next.publishedBy !== null);

  if (placementFieldsChanged || publishedUnitCrossedNormalBoundary) {
    await assertLegacyNormalPlacementAllowedInTransaction(transaction, db);
  }
}

export function assertLearningPathProjectionParity(
  expectedUnitIds: string[],
  adminUnitIds: string[],
  studentUnitIds: string[]
): void {
  if (!sameUnitIds(expectedUnitIds, adminUnitIds) || !sameUnitIds(expectedUnitIds, studentUnitIds)) {
    throw new LearningPathServiceError(
      'VERIFICATION_FAILED',
      'The active admin or student Learning Path projection does not exactly match the reviewed manifest',
      409
    );
  }
}

export class LearningPathService {
  constructor(
    private readonly db: Firestore = adminDb,
    private readonly allowTestUnits = true,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  private get paths() {
    return this.db.collection(LEARNING_PATHS_COLLECTION);
  }

  private get units() {
    return this.db.collection(LEARNING_UNITS_COLLECTION);
  }

  private get versions() {
    return this.db.collection(TEST_VERSIONS_COLLECTION);
  }

  private legacyLiveQuery() {
    return this.units.where('isLive', '==', true).select('kind', 'type', 'isLive', 'liveOrder');
  }

  pathRef() {
    return this.paths.doc(DEFAULT_LEARNING_PATH_ID);
  }

  async getPath(): Promise<LearningPathDocument | null> {
    return learningPathFromSnapshot(await this.pathRef().get());
  }

  private async getLegacyNormalUnitIds(): Promise<string[]> {
    const snapshot = await this.legacyLiveQuery().get();
    return legacyNormalSourceFromSnapshot(snapshot).map(record => record.unitId);
  }

  async getAdminView(): Promise<AdminLearningPathView> {
    const path = await this.getPath();
    const active = isLearningPathActive(path);
    const legacyUnitIds = active ? [] : await this.getLegacyNormalUnitIds();
    const canEdit = Boolean(path && !path.cutover);

    let editBlockedReason: string | undefined;
    if (!path) {
      editBlockedReason = 'The Learning Path has not been initialized. Complete the migration workflow first.';
    } else if (path.cutover) {
      editBlockedReason =
        path.cutover.state === 'active'
          ? 'The Learning Path is read-only during the post-migration stabilization window.'
          : 'The Learning Path is inactive after rollback. Reapply or retire the migration before editing.';
    }

    return {
      path,
      effectiveUnitIds: active ? path!.unitIds : legacyUnitIds,
      source: active ? 'learning-path' : 'legacy',
      canEdit,
      ...(editBlockedReason ? { editBlockedReason } : {}),
    };
  }

  private async validateDesiredUnits(transaction: Transaction, unitIds: string[]): Promise<void> {
    // Firestore requires at least one document reference for getAll. An empty
    // path is valid, and must still reach the complete graph validation below.
    const snapshots = unitIds.length
      ? await transaction.getAll(...unitIds.map(unitId => this.units.doc(unitId)))
      : [];
    const tests: Extract<LearningUnit, { kind: 'test' }>[] = [];

    for (const snapshot of snapshots) {
      const unit = parseLearningUnitSnapshot(snapshot);
      if (unit.kind === 'lesson') {
        if (unit.type !== 'normal') {
          throw new LearningPathServiceError(
            'INELIGIBLE_LEARNING_UNIT',
            `Lesson ${unit.id} is a practice lesson and cannot be placed in the Learning Path`,
            400
          );
        }
        const progressionErrors = validateLessonProgression(unit);
        if (progressionErrors.length > 0) {
          throw new LearningPathServiceError(
            'INELIGIBLE_LEARNING_UNIT',
            `Lesson ${unit.id} is incomplete: ${progressionErrors.join(' ')}`,
            400
          );
        }
        continue;
      }

      if (!this.allowTestUnits) {
        throw new LearningPathServiceError(
          'INELIGIBLE_LEARNING_UNIT',
          `Test ${unit.id} cannot be placed before normal-flow test integration is enabled`,
          400
        );
      }
      if (unit.rotationVersions.length === 0) {
        throw new LearningPathServiceError(
          'INELIGIBLE_LEARNING_UNIT',
          `Test ${unit.id} has no rotation-eligible version`,
          400
        );
      }
      tests.push(unit);
    }

    const versionIds = [...new Set(tests.flatMap(test => test.rotationVersions.map(item => item.versionId)))];
    const versionSnapshots = versionIds.length
      ? await transaction.getAll(...versionIds.map(versionId => this.versions.doc(versionId)))
      : [];
    const validVersionIds = new Set<string>();
    for (const snapshot of versionSnapshots) {
      if (
        snapshot.exists &&
        testVersionDocumentSchema.safeParse({
          ...snapshot.data(),
          id: snapshot.id,
        }).success
      ) {
        validVersionIds.add(snapshot.id);
      }
    }
    for (const test of tests) {
      const invalidVersion = test.rotationVersions.find(reference => !validVersionIds.has(reference.versionId));
      if (invalidVersion) {
        throw new LearningPathServiceError(
          'INELIGIBLE_LEARNING_UNIT',
          `Test ${test.id} references missing or invalid version ${invalidVersion.versionId}`,
          400
        );
      }
    }

    // Placement is a delivery decision.  Validate the complete active graph
    // in this transaction rather than accepting a locally valid test into an
    // already-corrupt set of normal/mock owners.
    const [allTestSnapshots, activeMockSnapshots, allVersionSnapshots] = await Promise.all([
      transaction.get(this.units.where('kind', '==', 'test')),
      transaction.get(this.db.collection(MOCK_TESTS_COLLECTION).where('status', '==', 'active')),
      transaction.get(this.versions),
    ]);
    try {
      const allTests = allTestSnapshots.docs.map(parseLearningUnitSnapshot).filter((unit): unit is Extract<LearningUnit, { kind: 'test' }> => unit.kind === 'test');
      const mocks = activeMockSnapshots.docs.map(snapshot => mockTestDocumentSchema.parse({ ...snapshot.data(), id: snapshot.id }));
      const graphErrors = validateTestAssignmentGraph({ tests: allTests, mocks, versionIds: allVersionSnapshots.docs.map(snapshot => snapshot.id) });
      if (graphErrors.length > 0) {
        throw new LearningPathServiceError('INELIGIBLE_LEARNING_UNIT', `Learning Path placement found invalid active delivery ownership: ${graphErrors.join('; ')}`, 409);
      }
    } catch (error) {
      if (error instanceof LearningPathServiceError) throw error;
      throw new LearningPathServiceError('INELIGIBLE_LEARNING_UNIT', 'Learning Path placement found malformed active delivery ownership', 409);
    }
  }

  async save(input: SaveLearningPathInput, actorId: string): Promise<LearningPathDocument> {
    const parsedInput = saveLearningPathInputSchema.parse(input);

    return this.db.runTransaction(async transaction => {
      const pathSnapshot = await transaction.get(this.pathRef());
      const currentPath = learningPathFromSnapshot(pathSnapshot);
      if (!currentPath) {
        throw new LearningPathServiceError(
          'LEARNING_PATH_NOT_FOUND',
          'The Learning Path must be initialized through the migration workflow before it can be edited',
          409
        );
      }
      if (currentPath.cutover) {
        throw new LearningPathServiceError(
          'LEARNING_PATH_FROZEN',
          'The Learning Path is read-only during the migration stabilization window',
          409
        );
      }
      if (currentPath.revision !== parsedInput.expectedRevision) {
        throw new LearningPathServiceError(
          'STALE_LEARNING_PATH_REVISION',
          'The Learning Path changed elsewhere. Refresh it and review your proposed order.',
          409
        );
      }

      await this.validateDesiredUnits(transaction, parsedInput.unitIds);

      const updatedPath: LearningPathDocument = {
        id: 'default',
        revision: currentPath.revision + 1,
        unitIds: [...parsedInput.unitIds],
        updatedAt: this.now(),
        updatedBy: actorId,
      };
      assertDocumentSize(updatedPath);
      transaction.set(this.pathRef(), updatedPath);
      return updatedPath;
    });
  }

  async buildMigrationManifest(migrationId: string): Promise<LearningPathMigrationManifestInput> {
    const source = legacyNormalSourceFromSnapshot(await this.legacyLiveQuery().get(), true);
    return learningPathMigrationManifestSchema.parse({
      migrationId,
      createdAt: this.now(),
      sourceHash: hashLearningPathMigrationSource(source),
      unitIds: source.map(record => record.unitId),
      source,
    });
  }

  async applyMigration(
    input: LearningPathMigrationManifestInput,
    actorId: string
  ): Promise<{ path: LearningPathDocument; applied: boolean }> {
    const manifest = learningPathMigrationManifestSchema.parse(input);
    return this.db.runTransaction(async transaction => {
      const [pathSnapshot, sourceSnapshot] = await Promise.all([
        transaction.get(this.pathRef()),
        transaction.get(this.legacyLiveQuery()),
      ]);
      const currentPath = learningPathFromSnapshot(pathSnapshot);
      const source = legacyNormalSourceFromSnapshot(sourceSnapshot, true);
      assertManifestMatchesSource(manifest, source);

      if (currentPath && !currentPath.cutover) {
        throw new LearningPathServiceError(
          'MIGRATION_CONFLICT',
          'The Phase 5 migration window has already been retired',
          409
        );
      }
      if (currentPath?.cutover?.state === 'active') {
        const sameMigration =
          currentPath.cutover.migrationId === manifest.migrationId &&
          currentPath.cutover.sourceHash === manifest.sourceHash &&
          sameUnitIds(currentPath.unitIds, manifest.unitIds);
        if (sameMigration) return { path: currentPath, applied: false };
        throw new LearningPathServiceError(
          'MIGRATION_CONFLICT',
          'A different Learning Path migration is already active',
          409
        );
      }

      const appliedAt = this.now();
      const path: LearningPathDocument = {
        id: 'default',
        revision: currentPath ? currentPath.revision + 1 : 1,
        unitIds: [...manifest.unitIds],
        updatedAt: appliedAt,
        updatedBy: actorId,
        cutover: {
          state: 'active',
          migrationId: manifest.migrationId,
          sourceHash: manifest.sourceHash,
          appliedAt,
          appliedBy: actorId,
        },
      };
      assertDocumentSize(path);
      transaction.set(this.pathRef(), path);
      return { path, applied: true };
    });
  }

  async verifyMigration(
    input: LearningPathMigrationManifestInput
  ): Promise<{ verified: true; path: LearningPathDocument }> {
    const manifest = learningPathMigrationManifestSchema.parse(input);
    return this.db.runTransaction(async transaction => {
      const [pathSnapshot, sourceSnapshot] = await Promise.all([
        transaction.get(this.pathRef()),
        transaction.get(this.legacyLiveQuery()),
      ]);
      const path = learningPathFromSnapshot(pathSnapshot);
      const source = legacyNormalSourceFromSnapshot(sourceSnapshot, true);
      assertManifestMatchesSource(manifest, source);
      if (
        !path ||
        path.cutover?.state !== 'active' ||
        path.cutover.migrationId !== manifest.migrationId ||
        path.cutover.sourceHash !== manifest.sourceHash ||
        !sameUnitIds(path.unitIds, manifest.unitIds)
      ) {
        throw new LearningPathServiceError(
          'VERIFICATION_FAILED',
          'The active Learning Path does not exactly match the reviewed manifest',
          409
        );
      }
      await assertPhase5PathContainsNoTests(transaction, this.db, path.unitIds);
      return { verified: true, path };
    });
  }

  async rollbackMigration(actorId: string): Promise<LearningPathDocument> {
    return this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(this.pathRef());
      const path = learningPathFromSnapshot(snapshot);
      if (!path?.cutover) {
        throw new LearningPathServiceError(
          'ROLLBACK_UNAVAILABLE',
          'Learning Path rollback is unavailable after migration retirement',
          409
        );
      }
      await assertPhase5PathContainsNoTests(transaction, this.db, path.unitIds);
      if (path.cutover.state === 'inactive') return path;

      const rolledBackAt = this.now();
      const rolledBack: LearningPathDocument = {
        ...path,
        updatedAt: rolledBackAt,
        updatedBy: actorId,
        cutover: {
          ...path.cutover,
          state: 'inactive',
          rolledBackAt,
          rolledBackBy: actorId,
        },
      };
      transaction.set(this.pathRef(), rolledBack);
      return rolledBack;
    });
  }

  async retireMigration(actorId: string): Promise<LearningPathDocument> {
    return this.db.runTransaction(async transaction => {
      const snapshot = await transaction.get(this.pathRef());
      const path = learningPathFromSnapshot(snapshot);
      if (!path) {
        throw new LearningPathServiceError(
          'LEARNING_PATH_NOT_FOUND',
          'The Learning Path has not been initialized',
          404
        );
      }
      if (!path.cutover) return path;
      if (path.cutover.state !== 'active') {
        throw new LearningPathServiceError(
          'CUTOVER_NOT_ACTIVE',
          'Reapply the migration before retiring its fallback',
          409
        );
      }
      await assertPhase5PathContainsNoTests(transaction, this.db, path.unitIds);

      const retired: LearningPathDocument = {
        id: 'default',
        revision: path.revision,
        unitIds: [...path.unitIds],
        updatedAt: this.now(),
        updatedBy: actorId,
      };
      transaction.set(this.pathRef(), retired);
      return retired;
    });
  }
}

export const learningPathService = new LearningPathService();

function sameUnitIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((unitId, index) => unitId === right[index]);
}
