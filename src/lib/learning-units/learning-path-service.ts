import type { DocumentReference, DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import {
  DEFAULT_LEARNING_PATH_ID,
  LEARNING_PATHS_COLLECTION,
  LEARNING_UNITS_COLLECTION,
  MOCK_TESTS_COLLECTION,
  TEST_VERSIONS_COLLECTION,
} from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import {
  LESSON_UNIT_TYPES,
  type AdminLearningPathView,
  type LearningPathDocument,
  type LearningPathLessonIssue,
  type LearningUnit,
  type LessonUnitType,
} from '@/src/types/learning-unit';
import type { RotationVersionReference } from '@/src/types/test';
import { estimateFirestoreDocumentBytes } from '@/src/lib/tests/firestore-size';
import { mockTestDocumentSchema } from '@/src/lib/tests/schemas';
import { isStoredVersionReadyForStudentVisibility } from '@/src/lib/tests/persistence';
import { validateTestAssignmentGraph } from '@/src/lib/tests/domain';
import { isLessonDocumentData, normalizeLearningUnit } from './domain';
import { validateLessonProgression } from '@/src/utils/lessonProgress';
import type { Lesson } from '@/src/types/lesson';
import {
  learningPathDocumentSchema,
  learningUnitDocumentSchema,
  saveLearningPathInputSchema,
  type SaveLearningPathInput,
} from './schemas';
import { LearningPathServiceError } from './learning-path-errors';
import { runVocabularyContentMutation } from '@/src/lib/vocabulary-pools/sync-lock.server';

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

type LearningPathPlacementUnit =
  | { id: string; kind: 'lesson'; type: LessonUnitType }
  | Extract<LearningUnit, { kind: 'test' }>;

/**
 * Placement only needs to establish the unit's identity and delivery kind.
 * Normal lesson content is deliberately not parsed here: legacy or damaged
 * lesson content is surfaced by the admin audit and must not block reordering
 * or removing units from the Learning Path. Tests remain strict because their
 * version ownership directly controls delivery.
 */
function parseLearningPathPlacementUnit(snapshot: DocumentSnapshot): LearningPathPlacementUnit {
  if (!snapshot.exists) {
    throw new LearningPathServiceError('UNKNOWN_LEARNING_UNIT', `Learning unit ${snapshot.id} does not exist`, 400);
  }

  const data = snapshot.data();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new LearningPathServiceError(
      'INELIGIBLE_LEARNING_UNIT',
      `Learning unit ${snapshot.id} contains invalid persisted data`,
      409
    );
  }

  const raw = data as Record<string, unknown>;
  if (raw.kind === 'test') return parseLearningUnitSnapshot(snapshot) as Extract<LearningUnit, { kind: 'test' }>;
  if (raw.kind !== undefined && raw.kind !== 'lesson') {
    throw new LearningPathServiceError(
      'INELIGIBLE_LEARNING_UNIT',
      `Learning unit ${snapshot.id} has an unknown kind`,
      400
    );
  }

  const type = raw.type;
  if (typeof type !== 'string' || !(LESSON_UNIT_TYPES as readonly string[]).includes(type)) {
    throw new LearningPathServiceError(
      'INELIGIBLE_LEARNING_UNIT',
      `Lesson ${snapshot.id} has an unknown lesson type`,
      400
    );
  }

  return { id: snapshot.id, kind: 'lesson', type: type as LessonUnitType };
}

function isLessonProgressionIssue(message: string, path: readonly PropertyKey[] = []): boolean {
  const isPageIdPath = path.length === 3 && path[0] === 'pages' && typeof path[1] === 'number' && path[2] === 'id';
  const isItemIdPath =
    path.length === 5 &&
    path[0] === 'pages' &&
    typeof path[1] === 'number' &&
    path[2] === 'items' &&
    typeof path[3] === 'number' &&
    path[4] === 'id';
  return (
    message === 'Lesson must contain at least one page.' ||
    /^Page \d+ (?:is missing an ID|has a duplicate ID)\.$/.test(message) ||
    /^Item \d+ on page \d+ (?:is missing an ID|has a duplicate ID)\.$/.test(message) ||
    isPageIdPath ||
    isItemIdPath
  );
}

function addLessonIssue(issues: LearningPathLessonIssue[], issue: LearningPathLessonIssue, seen: Set<string>): void {
  const key = `${issue.code}:${issue.message}:${JSON.stringify(issue.path ?? [])}`;
  if (seen.has(key)) return;
  seen.add(key);
  issues.push(issue);
}

function auditPlacedLessonSnapshot(snapshot: DocumentSnapshot): LearningPathLessonIssue[] {
  if (!snapshot.exists || !isLessonDocumentData(snapshot.data())) return [];

  const raw = snapshot.data() as Record<string, unknown>;
  if (raw.type !== 'normal') return [];

  const normalized = {
    ...raw,
    id: raw.id ?? snapshot.id,
    kind: raw.kind ?? 'lesson',
    description: raw.description ?? '',
    isLive: raw.isLive ?? false,
    liveOrder: raw.liveOrder ?? null,
    publishedAt: raw.publishedAt ?? null,
    publishedBy: raw.publishedBy ?? null,
    showWordSearch: raw.showWordSearch ?? true,
  };
  const issues: LearningPathLessonIssue[] = [];
  const seen = new Set<string>();
  const parsed = learningUnitDocumentSchema.safeParse(normalized);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      addLessonIssue(
        issues,
        {
          code: isLessonProgressionIssue(issue.message, issue.path) ? 'INCOMPLETE_LESSON' : 'INVALID_LESSON_DATA',
          message: issue.message,
          ...(issue.path.length
            ? {
                path: issue.path.filter(
                  (part): part is string | number => typeof part === 'string' || typeof part === 'number'
                ),
              }
            : {}),
        },
        seen
      );
    }
  }

  if (Array.isArray(raw.pages)) {
    try {
      for (const message of validateLessonProgression({ pages: raw.pages as Lesson['pages'] })) {
        addLessonIssue(issues, { code: 'INCOMPLETE_LESSON', message, path: ['pages'] }, seen);
      }
    } catch {
      // The schema issues above contain the useful location for malformed
      // page structures. A bad shape must never abort the whole audit.
    }
  }

  return issues;
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

export async function assertUnitDeletionAllowedInTransaction(
  transaction: Transaction,
  db: Firestore,
  unitId: string
): Promise<void> {
  const pathSnapshot = await transaction.get(db.collection(LEARNING_PATHS_COLLECTION).doc(DEFAULT_LEARNING_PATH_ID));
  const path = learningPathFromSnapshot(pathSnapshot);
  if (path && path.unitIds.includes(unitId)) {
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
  if (!path || !path.unitIds.includes(unitId)) return;

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
  if (!path || !path.unitIds.includes(testId)) return;
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
  const invalid = snapshots.find(snapshot => !isStoredVersionReadyForStudentVisibility(snapshot));
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
  if (!path) return;

  throw new LearningPathServiceError(
    'LEGACY_NORMAL_PLACEMENT_RETIRED',
    'Normal placement now belongs to the Learning Path organizer.',
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

  pathRef() {
    return this.paths.doc(DEFAULT_LEARNING_PATH_ID);
  }

  async getPath(): Promise<LearningPathDocument | null> {
    return learningPathFromSnapshot(await this.pathRef().get());
  }

  private async auditCanonicalLessons(
    path: LearningPathDocument | null
  ): Promise<Record<string, LearningPathLessonIssue[]>> {
    if (!path || path.unitIds.length === 0) return {};

    const references = path.unitIds.map(unitId => this.units.doc(unitId) as unknown as DocumentReference);
    const dbWithGetAll = this.db as Firestore & {
      getAll?: (...refs: DocumentReference[]) => Promise<DocumentSnapshot[]>;
    };
    // The production Firestore client batches these reads. The fallback keeps
    // lightweight service fakes useful in unit tests without changing the
    // production read pattern.
    const snapshots =
      typeof dbWithGetAll.getAll === 'function'
        ? await dbWithGetAll.getAll(...references)
        : await Promise.all(references.map(reference => reference.get()));
    const issuesById: Record<string, LearningPathLessonIssue[]> = {};

    snapshots.forEach(snapshot => {
      const issues = auditPlacedLessonSnapshot(snapshot);
      if (issues.length > 0) issuesById[snapshot.id] = issues;
    });

    return issuesById;
  }

  async getAdminView(): Promise<AdminLearningPathView> {
    const path = await this.getPath();
    const lessonIssuesById = await this.auditCanonicalLessons(path);

    return {
      path,
      effectiveUnitIds: path?.unitIds ?? [],
      source: 'learning-path',
      canEdit: Boolean(path),
      lessonIssuesById,
      ...(!path ? { editBlockedReason: 'The Learning Path is not available.' } : {}),
    };
  }

  private async validateDesiredUnits(transaction: Transaction, unitIds: string[]): Promise<void> {
    // Firestore requires at least one document reference for getAll. An empty
    // path is valid, and must still reach the complete graph validation below.
    const snapshots = unitIds.length ? await transaction.getAll(...unitIds.map(unitId => this.units.doc(unitId))) : [];
    const tests: Extract<LearningUnit, { kind: 'test' }>[] = [];

    for (const snapshot of snapshots) {
      const unit = parseLearningPathPlacementUnit(snapshot);
      if (unit.kind === 'lesson') {
        if (unit.type !== 'normal') {
          throw new LearningPathServiceError(
            'INELIGIBLE_LEARNING_UNIT',
            `Lesson ${unit.id} is a practice lesson and cannot be placed in the Learning Path`,
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
      if (isStoredVersionReadyForStudentVisibility(snapshot)) {
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
      const allTests = allTestSnapshots.docs
        .filter(
          snapshot => snapshot.exists && (snapshot.data() as Record<string, unknown> | undefined)?.kind === 'test'
        )
        .map(parseLearningUnitSnapshot)
        .filter((unit): unit is Extract<LearningUnit, { kind: 'test' }> => unit.kind === 'test');
      const mocks = activeMockSnapshots.docs.map(snapshot =>
        mockTestDocumentSchema.parse({ ...snapshot.data(), id: snapshot.id })
      );
      const graphErrors = validateTestAssignmentGraph({
        tests: allTests,
        mocks,
        versionIds: allVersionSnapshots.docs.map(snapshot => snapshot.id),
      });
      if (graphErrors.length > 0) {
        throw new LearningPathServiceError(
          'INELIGIBLE_LEARNING_UNIT',
          `Learning Path placement found invalid active delivery ownership: ${graphErrors.join('; ')}`,
          409
        );
      }
    } catch (error) {
      if (error instanceof LearningPathServiceError) throw error;
      throw new LearningPathServiceError(
        'INELIGIBLE_LEARNING_UNIT',
        'Learning Path placement found malformed active delivery ownership',
        409
      );
    }
  }

  async save(input: SaveLearningPathInput, actorId: string): Promise<LearningPathDocument> {
    const parsedInput = saveLearningPathInputSchema.parse(input);

    return runVocabularyContentMutation(this.db, async transaction => {
      const pathSnapshot = await transaction.get(this.pathRef());
      const currentPath = learningPathFromSnapshot(pathSnapshot);
      if (!currentPath) {
        throw new LearningPathServiceError(
          'LEARNING_PATH_NOT_FOUND',
          'The Learning Path has not been initialized',
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
}

export const learningPathService = new LearningPathService();
