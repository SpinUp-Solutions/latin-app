import { ZodError } from 'zod';
import { normalizeLearningUnit } from './domain';

export const LEGACY_LEARNING_UNIT_FIELDS = [
  'published',
  'introduction',
  'introduction_backup',
  'exercises',
  'exercises_backup',
] as const;

export const LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID = 'latin-app-prod';

export const LEGACY_LEARNING_UNIT_REPAIR_TARGET_IDS = [
  'lesson-1757796411836',
  'lesson-1753896166956',
  'lesson-1752695094203',
] as const;

export type LegacyLearningUnitField = (typeof LEGACY_LEARNING_UNIT_FIELDS)[number];

export type LegacyLearningUnitRepairPlan = {
  status: 'clean' | 'repair-required';
  repairedData: Record<string, unknown>;
  removedFields: LegacyLearningUnitField[];
};

export class LegacyLearningUnitRepairError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LegacyLearningUnitRepairError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function containsOnlyExpectedLegacyIssues(error: unknown): error is ZodError {
  if (!(error instanceof ZodError) || error.issues.length === 0) return false;
  const allowedFields = new Set<string>(LEGACY_LEARNING_UNIT_FIELDS);
  return error.issues.every(
    issue =>
      issue.code === 'unrecognized_keys' &&
      issue.path.length === 0 &&
      issue.keys.length > 0 &&
      issue.keys.every(key => allowedFields.has(key))
  );
}

/**
 * Produces the only repair this incident allows: deleting known legacy
 * top-level fields from an otherwise valid learning-unit document.
 */
export function planLegacyLearningUnitFieldRepair(value: unknown, snapshotId: string): LegacyLearningUnitRepairPlan {
  if (!isRecord(value)) {
    throw new LegacyLearningUnitRepairError(`Learning unit ${snapshotId} is not a Firestore document object`);
  }

  try {
    normalizeLearningUnit(value, snapshotId);
    return { status: 'clean', repairedData: { ...value }, removedFields: [] };
  } catch (error) {
    if (!containsOnlyExpectedLegacyIssues(error)) {
      throw new LegacyLearningUnitRepairError(
        `Learning unit ${snapshotId} has validation failures outside the approved legacy-field repair`,
        { cause: error }
      );
    }
  }

  const repairedData = { ...value };
  const removedFields = LEGACY_LEARNING_UNIT_FIELDS.filter(field =>
    Object.prototype.hasOwnProperty.call(repairedData, field)
  );
  if (removedFields.length === 0) {
    throw new LegacyLearningUnitRepairError(`Learning unit ${snapshotId} has no approved legacy fields to remove`);
  }
  for (const field of removedFields) delete repairedData[field];

  try {
    normalizeLearningUnit(repairedData, snapshotId);
  } catch (error) {
    throw new LegacyLearningUnitRepairError(
      `Learning unit ${snapshotId} would remain invalid after the approved legacy fields were removed`,
      { cause: error }
    );
  }

  return { status: 'repair-required', repairedData, removedFields };
}
