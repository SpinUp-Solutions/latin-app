import type { LearningUnit, LessonUnit } from '@/src/types/learning-unit';
import { learningUnitDocumentSchema } from './schemas';

const LESSON_DOCUMENT_FIELDS = [
  'id',
  'kind',
  'title',
  'description',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'type',
  'pages',
  'vocabulary_pool',
  'showWordSearch',
  'isLive',
  'liveOrder',
  'publishedAt',
  'publishedBy',
  'version',
  'totalPages',
  'totalItems',
  'totalExercises',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Legacy lesson routes may read both old documents without `kind` and new
 * lesson documents with `kind: 'lesson'`. A test document must be rejected
 * before any lesson-only default such as `type || 'normal'` is applied.
 */
export function isLessonDocumentData(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (value.kind === undefined || value.kind === 'lesson');
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
    ...(value.kind === 'test'
      ? {}
      : {
          isLive: value.isLive ?? false,
          liveOrder: value.liveOrder ?? null,
          publishedAt: value.publishedAt ?? null,
          publishedBy: value.publishedBy ?? null,
          showWordSearch: value.showWordSearch ?? true,
        }),
  };

  return learningUnitDocumentSchema.parse(normalized) as unknown as LearningUnit;
}

/**
 * Canonicalizes a lesson for a whole-document write. This is intentionally
 * separate from normal reads: stale persisted documents must still fail closed,
 * while explicit recovery/restore operations may safely shed obsolete fields.
 */
export function normalizeLessonDocumentForWrite(value: unknown, snapshotId?: string): LessonUnit {
  if (!isLessonDocumentData(value)) {
    throw new Error('Learning unit is not a lesson');
  }
  const canonicalFields = Object.fromEntries(
    LESSON_DOCUMENT_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(value, field)).map(field => [
      field,
      value[field],
    ])
  );
  const unit = normalizeLearningUnit(
    {
      ...canonicalFields,
      ...(snapshotId ? { id: snapshotId } : {}),
      kind: 'lesson',
    },
    snapshotId
  );
  if (unit.kind !== 'lesson') throw new Error('Learning unit is not a lesson');
  return unit;
}
