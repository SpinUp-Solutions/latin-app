import {
  LEGACY_LEARNING_UNIT_FIELDS,
  LegacyLearningUnitRepairError,
  planLegacyLearningUnitFieldRepair,
} from '@/src/lib/learning-units/legacy-field-repair';

const canonicalLesson = (overrides: Record<string, unknown> = {}) => ({
  id: 'lesson-1',
  kind: 'lesson',
  title: 'Lesson',
  description: '',
  type: 'normal',
  pages: [{ id: 'page-1', items: [] }],
  isLive: false,
  liveOrder: null,
  publishedAt: null,
  publishedBy: null,
  ...overrides,
});

describe('legacy learning-unit field repair', () => {
  it('plans deletion of only the approved legacy fields without mutating lesson content', () => {
    const original = canonicalLesson({
      published: true,
      introduction: [{ id: 'old-introduction' }],
      introduction_backup: [{ id: 'old-introduction-backup' }],
      exercises: [{ id: 'old-exercise' }],
      exercises_backup: [{ id: 'old-exercise-backup' }],
    });

    const plan = planLegacyLearningUnitFieldRepair(original, 'lesson-1');

    expect(plan.status).toBe('repair-required');
    expect(plan.removedFields).toEqual(LEGACY_LEARNING_UNIT_FIELDS);
    expect(plan.repairedData).toEqual(canonicalLesson());
    expect(original).toHaveProperty('published', true);
    expect(original.pages).toEqual([{ id: 'page-1', items: [] }]);
  });

  it('is a no-op for a document that already passes canonical normalization', () => {
    const original = canonicalLesson();
    const plan = planLegacyLearningUnitFieldRepair(original, 'lesson-1');

    expect(plan).toEqual({ status: 'clean', repairedData: original, removedFields: [] });
    expect(plan.repairedData).not.toBe(original);
  });

  it('refuses to repair unapproved unknown fields', () => {
    expect(() => planLegacyLearningUnitFieldRepair(canonicalLesson({ unknownLegacyField: true }), 'lesson-1')).toThrow(
      LegacyLearningUnitRepairError
    );
  });

  it('refuses to hide canonical validation failures behind legacy-field deletion', () => {
    expect(() =>
      planLegacyLearningUnitFieldRepair(canonicalLesson({ title: '', published: true, introduction: [] }), 'lesson-1')
    ).toThrow(LegacyLearningUnitRepairError);
  });
});
