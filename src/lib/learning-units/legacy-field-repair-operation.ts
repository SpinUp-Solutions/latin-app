import { createHash } from 'node:crypto';
import { deepStrictEqual } from 'node:assert';
import {
  FieldValue,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type Timestamp,
} from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import { normalizeLearningUnit } from './domain';
import {
  LEGACY_LEARNING_UNIT_FIELDS,
  LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID,
  LEGACY_LEARNING_UNIT_REPAIR_TARGET_IDS,
  planLegacyLearningUnitFieldRepair,
} from './legacy-field-repair';
import { validateLessonProgression } from '@/src/utils/lessonProgress';
import type { GcloudProjectOperator } from '@/src/lib/verifyGcloudProjectAccess';

const SNAPSHOT_PREFIX = 'lesson-snapshots/legacy-learning-unit-field-repair';

type BeforeImage = {
  id: string;
  path: string;
  createTime: string;
  updateTime: string;
  data: DocumentData;
};

type TargetPlan = ReturnType<typeof planLegacyLearningUnitFieldRepair> & {
  id: string;
  path: string;
  updateTime: string;
};

export type LegacyLearningUnitRepairRequest =
  | { mode: 'dry-run' }
  | { mode: 'verify' }
  | { mode: 'apply'; planHash: string; confirmation: 'APPLY_LEGACY_LEARNING_UNIT_FIELD_REPAIR' };

export class LegacyLearningUnitRepairOperationError extends Error {
  constructor(
    message: string,
    public readonly status: 409 | 500 | 503,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'LegacyLearningUnitRepairOperationError';
  }
}

function toBeforeImage(snapshot: DocumentSnapshot): BeforeImage {
  if (!snapshot.exists || !snapshot.createTime || !snapshot.updateTime) {
    throw new LegacyLearningUnitRepairOperationError(`Required document ${snapshot.ref.path} does not exist`, 409);
  }

  return {
    id: snapshot.id,
    path: snapshot.ref.path,
    createTime: exactTimestamp(snapshot.createTime),
    updateTime: exactTimestamp(snapshot.updateTime),
    data: snapshot.data()!,
  };
}

function exactTimestamp(timestamp: Timestamp): string {
  const wholeSecond = new Date(timestamp.seconds * 1000).toISOString().replace('.000Z', '');
  return `${wholeSecond}.${String(timestamp.nanoseconds).padStart(9, '0')}Z`;
}

function serializeFirestoreValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (!value || typeof value !== 'object') return value;
  if ('toDate' in value && typeof value.toDate === 'function') return value.toDate().toISOString();

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      serializeFirestoreValue(nestedValue),
    ])
  );
}

export function createLegacyLearningUnitRepairPlanHash(plans: readonly TargetPlan[]): string {
  const reviewedState = plans
    .map(plan => ({
      id: plan.id,
      path: plan.path,
      updateTime: plan.updateTime,
      status: plan.status,
      removedFields: [...plan.removedFields].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return createHash('sha256').update(JSON.stringify(reviewedState)).digest('hex');
}

async function readTargetPlans(db: Firestore) {
  const refs = LEGACY_LEARNING_UNIT_REPAIR_TARGET_IDS.map(id => db.collection('lessons').doc(id));
  const snapshots = await db.getAll(...refs);
  const beforeImages = snapshots.map(toBeforeImage);
  const plans: TargetPlan[] = beforeImages.map(beforeImage => ({
    id: beforeImage.id,
    path: beforeImage.path,
    updateTime: beforeImage.updateTime,
    ...planLegacyLearningUnitFieldRepair(beforeImage.data, beforeImage.id),
  }));

  return {
    refs,
    beforeImages,
    plans,
    planHash: createLegacyLearningUnitRepairPlanHash(plans),
  };
}

async function verifyProductionCollection(
  db: Firestore,
  projectedDocuments: ReadonlyMap<string, DocumentData> = new Map()
) {
  const [allUnits, pathSnapshot] = await Promise.all([
    db.collection('lessons').get(),
    db.collection('learningPaths').doc('default').get(),
  ]);
  const failures: string[] = [];

  for (const snapshot of allUnits.docs) {
    try {
      normalizeLearningUnit(projectedDocuments.get(snapshot.id) ?? snapshot.data(), snapshot.id);
    } catch (error) {
      failures.push(`${snapshot.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new LegacyLearningUnitRepairOperationError(
      `Production learning-unit validation failed:\n${failures.join('\n')}`,
      409
    );
  }

  if (!pathSnapshot.exists) {
    throw new LegacyLearningUnitRepairOperationError('The production Learning Path does not exist', 409);
  }

  const unitIds = pathSnapshot.data()?.unitIds;
  if (!Array.isArray(unitIds) || unitIds.some(unitId => typeof unitId !== 'string')) {
    throw new LegacyLearningUnitRepairOperationError('The production Learning Path unitIds field is invalid', 409);
  }

  const unitSnapshots = unitIds.length
    ? await db.getAll(...unitIds.map(unitId => db.collection('lessons').doc(unitId)))
    : [];
  for (const snapshot of unitSnapshots) {
    if (!snapshot.exists) {
      throw new LegacyLearningUnitRepairOperationError(`Placed learning unit ${snapshot.id} does not exist`, 409);
    }
    const unit = normalizeLearningUnit(projectedDocuments.get(snapshot.id) ?? snapshot.data(), snapshot.id);
    if (unit.kind === 'lesson') {
      if (unit.type !== 'normal') {
        throw new LegacyLearningUnitRepairOperationError(`Placed lesson ${unit.id} is not a normal lesson`, 409);
      }
      const progressionErrors = validateLessonProgression(unit);
      if (progressionErrors.length > 0) {
        throw new LegacyLearningUnitRepairOperationError(
          `Placed lesson ${unit.id} is incomplete: ${progressionErrors.join(' ')}`,
          409
        );
      }
    }
  }

  return {
    allUnitCount: allUnits.size,
    validUnitCount: allUnits.size,
    pathUnitCount: unitIds.length,
    validPathUnitCount: unitSnapshots.length,
  };
}

function targetSummary(plans: readonly TargetPlan[]) {
  return plans.map(plan => ({
    id: plan.id,
    updateTime: plan.updateTime,
    status: plan.status,
    removedFields: plan.removedFields,
  }));
}

function snapshotId(now = new Date()) {
  return `legacy-learning-unit-field-repair-${now.toISOString().replace(/[:.]/g, '-')}`;
}

async function saveBeforeImageSnapshot(
  storage: Storage,
  operator: GcloudProjectOperator,
  beforeImages: readonly BeforeImage[],
  plans: readonly TargetPlan[],
  planHash: string
) {
  const createdAt = new Date().toISOString();
  const id = snapshotId(new Date(createdAt));
  const path = `${SNAPSHOT_PREFIX}/${id}.json`;
  const payload = {
    formatVersion: 1,
    snapshotId: id,
    createdAt,
    createdBy: operator.email,
    authentication: operator.authentication,
    projectId: LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID,
    migration: 'legacy-learning-unit-field-repair',
    planHash,
    approvedFields: LEGACY_LEARNING_UNIT_FIELDS,
    targets: targetSummary(plans),
    lessons: beforeImages.map(beforeImage => ({
      ...(serializeFirestoreValue(beforeImage.data) as Record<string, unknown>),
      id: beforeImage.id,
    })),
  };

  await storage
    .bucket()
    .file(path)
    .save(JSON.stringify(payload, null, 2), {
      contentType: 'application/json',
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { cacheControl: 'no-store' },
    });

  return { snapshotId: id, path, createdAt, totalLessons: beforeImages.length };
}

async function runDryRun(db: Firestore) {
  const state = await readTargetPlans(db);
  const projectedDocuments = new Map(state.plans.map(plan => [plan.id, plan.repairedData]));
  const projectedVerification = await verifyProductionCollection(db, projectedDocuments);

  return {
    mode: 'dry-run' as const,
    projectId: LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID,
    planHash: state.planHash,
    targets: targetSummary(state.plans),
    projectedVerification,
  };
}

async function runVerification(db: Firestore) {
  const state = await readTargetPlans(db);
  const repairRequired = state.plans.filter(plan => plan.status === 'repair-required');
  if (repairRequired.length > 0) {
    throw new LegacyLearningUnitRepairOperationError(
      `Verification failed: ${repairRequired.length} target documents still contain approved legacy fields`,
      409
    );
  }

  return {
    mode: 'verify' as const,
    projectId: LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID,
    verified: true,
    planHash: state.planHash,
    targets: targetSummary(state.plans),
    verification: await verifyProductionCollection(db),
  };
}

async function runApply(
  db: Firestore,
  storage: Storage,
  operator: GcloudProjectOperator,
  request: Extract<LegacyLearningUnitRepairRequest, { mode: 'apply' }>
) {
  const state = await readTargetPlans(db);
  if (state.planHash !== request.planHash) {
    throw new LegacyLearningUnitRepairOperationError(
      'The production documents changed after dry-run; run a new dry-run and review its planHash',
      409
    );
  }

  const repairRequired = state.plans.filter(plan => plan.status === 'repair-required');
  if (repairRequired.length === 0) {
    return {
      ...(await runVerification(db)),
      mode: 'apply' as const,
      applied: false,
      reason: 'All target documents were already clean',
      snapshot: null,
      appliedBy: operator.email,
    };
  }

  const projectedDocuments = new Map(state.plans.map(plan => [plan.id, plan.repairedData]));
  const projectedVerification = await verifyProductionCollection(db, projectedDocuments);
  const snapshot = await saveBeforeImageSnapshot(storage, operator, state.beforeImages, state.plans, state.planHash);

  await db.runTransaction(async transaction => {
    const currentSnapshots = await transaction.getAll(...state.refs);
    for (let index = 0; index < currentSnapshots.length; index += 1) {
      const current = currentSnapshots[index];
      const beforeImage = state.beforeImages[index];
      if (!current.exists || !current.updateTime || exactTimestamp(current.updateTime) !== beforeImage.updateTime) {
        throw new LegacyLearningUnitRepairOperationError(
          `Document ${beforeImage.path} changed after the durable backup; aborting without writes`,
          409
        );
      }

      deepStrictEqual(current.data(), beforeImage.data);
      const plan = planLegacyLearningUnitFieldRepair(current.data(), current.id);
      if (plan.status === 'clean') continue;
      transaction.update(
        current.ref,
        Object.fromEntries(plan.removedFields.map(field => [field, FieldValue.delete()]))
      );
    }
  });

  return {
    mode: 'apply' as const,
    projectId: LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID,
    applied: true,
    appliedBy: operator.email,
    planHash: state.planHash,
    targets: targetSummary(state.plans),
    projectedVerification,
    snapshot,
    verification: await verifyProductionCollection(db),
  };
}

export async function runLegacyLearningUnitRepairOperation(params: {
  db: Firestore;
  storage: Storage;
  projectId: string | undefined;
  operator: GcloudProjectOperator;
  request: LegacyLearningUnitRepairRequest;
}) {
  if (params.projectId !== LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID) {
    throw new LegacyLearningUnitRepairOperationError(
      `Refusing to run outside ${LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID}`,
      503
    );
  }

  switch (params.request.mode) {
    case 'dry-run':
      return runDryRun(params.db);
    case 'verify':
      return runVerification(params.db);
    case 'apply':
      return runApply(params.db, params.storage, params.operator, params.request);
  }
}
