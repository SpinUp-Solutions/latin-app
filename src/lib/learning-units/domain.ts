import type { LearningUnit, LessonUnit, TestUnit } from '@/src/types/learning-unit';
import { learningUnitDocumentSchema } from './schemas';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Canonicalizes compatibility-only fields before applying the document schema.
 * Firestore snapshot IDs can be supplied separately because they are not stored
 * inside every legacy document.
 */
export function normalizeLearningUnit(value: unknown, snapshotId?: string): LearningUnit {
  if (!isRecord(value)) {
    return learningUnitDocumentSchema.parse(value) as unknown as LearningUnit;
  }

  const normalized = {
    ...value,
    id: value.id ?? snapshotId,
    kind: value.kind ?? 'lesson',
    description: value.description ?? '',
    isLive: value.isLive ?? false,
    liveOrder: value.liveOrder ?? null,
    publishedAt: value.publishedAt ?? null,
    publishedBy: value.publishedBy ?? null,
  };

  return learningUnitDocumentSchema.parse(normalized) as unknown as LearningUnit;
}

export function isLessonUnit(unit: LearningUnit): unit is LessonUnit {
  return unit.kind === 'lesson';
}

export function isTestUnit(unit: LearningUnit): unit is TestUnit {
  return unit.kind === 'test';
}
