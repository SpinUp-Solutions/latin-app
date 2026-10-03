import type { LearningUnit } from '@/src/types/learning-unit';
import { learningUnitDocumentSchema } from './schemas';

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
export function withLegacyLearningUnitDefaults(value: Record<string, unknown>, snapshotId?: string) {
  return {
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
}

export function normalizeLearningUnit(value: unknown, snapshotId?: string): LearningUnit {
  const normalized = isRecord(value) ? withLegacyLearningUnitDefaults(value, snapshotId) : value;
  return learningUnitDocumentSchema.parse(normalized) as unknown as LearningUnit;
}
