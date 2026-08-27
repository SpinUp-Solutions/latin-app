import type { Lesson } from '@/src/types/lesson';
import {
  calculateStoredProgress,
  getFurthestPageIndex,
  getMissingExercises,
  getRequiredExercises,
  hasLegacyCompletion,
  isStoredLessonComplete,
  normalizeExerciseProgress,
  resolveExerciseId,
  summarizeLessonCompletion,
  validateLessonProgression,
} from '@/src/utils/lessonProgress';
import { migrateUserProgress } from '@/src/utils/progressMigration';
import { isProgressionUnitComplete } from '@/src/lib/learning-units/progression';

const lesson = {
  id: 'lesson-1',
  title: 'Progress lesson',
  type: 'normal',
  isLive: true,
  liveOrder: 0,
  publishedAt: null,
  publishedBy: null,
  pages: [
    {
      id: 'page-a',
      title: 'Practice',
      items: [
        { id: 'text-a', type: 'text', content: 'Read this' },
        { id: 'exercise-a', type: 'fill', title: 'First exercise' },
      ],
    },
    {
      id: 'page-b',
      title: 'Listening',
      items: [
        { id: 'listening-a', type: 'listening-passage', title: 'Passive passage' },
        { id: 'exercise-b', type: 'multiple-choice', title: 'Second exercise' },
      ],
    },
    {
      id: 'page-c',
      title: 'Reading',
      items: [{ id: 'text-c', type: 'text', content: 'Final reading' }],
    },
  ],
} as unknown as Lesson;

describe('lesson completion helpers', () => {
  it('discovers stable required exercise IDs and excludes passive content', () => {
    expect(getRequiredExercises(lesson)).toEqual([
      { exerciseId: 'exercise-a', title: 'First exercise', pageId: 'page-a', pageIndex: 0 },
      { exerciseId: 'exercise-b', title: 'Second exercise', pageId: 'page-b', pageIndex: 1 },
    ]);
  });

  it('uses subset membership so stale extra records cannot block completion', () => {
    const missing = getMissingExercises(getRequiredExercises(lesson), [
      { exerciseId: 'exercise-a', score: 100 },
      { exerciseId: 'exercise-b', score: 0 },
      { exerciseId: 'deleted-exercise', score: 50 },
    ]);
    expect(missing).toEqual([]);
  });

  it('resolves legacy positional IDs to stable content IDs', () => {
    expect(resolveExerciseId(lesson, 'page0-item1')).toBe('exercise-a');
    expect(resolveExerciseId(lesson, 'page1-item0')).toBeNull();
    expect(resolveExerciseId(lesson, 'exercise-b')).toBe('exercise-b');
  });

  it('deduplicates valid records and ignores removed positions', () => {
    expect(
      normalizeExerciseProgress(lesson, [
        { exerciseId: 'page0-item1', score: 50, completedAt: '2026-01-01T00:00:00.000Z' },
        { exerciseId: 'exercise-a', score: 100, completedAt: '2026-02-01T00:00:00.000Z' },
        { exerciseId: 'page9-item9', score: 100, completedAt: '2026-02-01T00:00:00.000Z' },
      ])
    ).toEqual([{ exerciseId: 'exercise-a', score: 100, completedAt: '2026-02-01T00:00:00.000Z' }]);
  });

  it('ignores persisted records with malformed scores, while accepting zero', () => {
    expect(
      normalizeExerciseProgress(lesson, [
        { exerciseId: 'exercise-a', score: -1, completedAt: '2026-01-01T00:00:00.000Z' },
        { exerciseId: 'exercise-a', score: 101, completedAt: '2026-01-02T00:00:00.000Z' },
        { exerciseId: 'exercise-a', score: Number.NaN, completedAt: '2026-01-03T00:00:00.000Z' },
        { exerciseId: 'exercise-a', score: '100', completedAt: '2026-01-04T00:00:00.000Z' },
        { exerciseId: 'exercise-a', completedAt: '2026-01-05T00:00:00.000Z' },
        { exerciseId: 'exercise-a', score: 0, completedAt: '2026-01-06T00:00:00.000Z' },
      ] as never)
    ).toEqual([{ exerciseId: 'exercise-a', score: 0, completedAt: '2026-01-06T00:00:00.000Z' }]);
  });

  it('keeps stored completion separate from page position and caps incomplete progress', () => {
    expect(isStoredLessonComplete({ progressSchemaVersion: 2, furthestPageIndex: 2, status: 'in-progress' }, 3)).toBe(
      false
    );
    expect(calculateStoredProgress({ progressSchemaVersion: 2, furthestPageIndex: 2, status: 'in-progress' }, { totalPages: 3, totalExercises: 0 })).toBe(
      99
    );
    expect(calculateStoredProgress({ progressSchemaVersion: 2, furthestPageIndex: 0, status: 'completed' }, { totalPages: 3, totalExercises: 0 })).toBe(
      100
    );
  });

  it('does not let malformed records satisfy required exercise completion', () => {
    const summary = summarizeLessonCompletion(threeExerciseLesson, {
      status: 'in-progress',
      exerciseProgress: [
        { exerciseId: 'exercise-a', score: -1, completedAt: '2026-01-01T00:00:00.000Z' },
        { exerciseId: 'exercise-b', score: 101, completedAt: '2026-01-01T00:00:00.000Z' },
        { exerciseId: 'exercise-c', score: Number.NaN, completedAt: '2026-01-01T00:00:00.000Z' },
      ] as never,
    });
    expect(summary.completedExerciseCount).toBe(0);
    expect(summary.isCompleted).toBe(false);
    expect(summary.missingExercises).toHaveLength(3);
  });

  it('recognizes and clamps schema-v1 completion cursors', () => {
    expect(isStoredLessonComplete({ currentPageIndex: 3, status: 'in-progress' }, 3)).toBe(true);
    expect(getFurthestPageIndex({ currentPageIndex: 3 }, 3)).toBe(2);
  });

  it('rejects progression-unsafe lesson structures before publishing', () => {
    expect(validateLessonProgression({ pages: [] })).toEqual(['Lesson must contain at least one page.']);
    expect(
      validateLessonProgression({
        pages: [
          { id: 'same-page', items: [{ id: 'same-item', type: 'text', content: '' }] },
          { id: 'same-page', items: [{ id: 'same-item', type: 'text', content: '' }] },
        ],
      })
    ).toEqual(['Page 2 has a duplicate ID.', 'Item 1 on page 2 has a duplicate ID.']);
  });
});

const threeExerciseLesson = {
  ...lesson,
  pages: [
    { id: 'page-a', title: 'One', items: [{ id: 'exercise-a', type: 'fill', title: 'First' }] },
    { id: 'page-b', title: 'Two', items: [{ id: 'exercise-b', type: 'fill', title: 'Second' }] },
    { id: 'page-c', title: 'Three', items: [{ id: 'exercise-c', type: 'fill', title: 'Third' }] },
  ],
} as unknown as Lesson;

const passiveLesson = {
  ...lesson,
  pages: [
    { id: 'page-a', title: 'Read', items: [{ id: 'text-a', type: 'text', content: 'Intro' }] },
    { id: 'page-b', title: 'Listen', items: [{ id: 'listen-a', type: 'listening-passage', title: 'Passage' }] },
    { id: 'page-c', title: 'End', items: [{ id: 'text-c', type: 'text', content: 'Done' }] },
  ],
} as unknown as Lesson;

describe('schema-v4 lesson completion', () => {
  it('derives exercise lesson progress from completed required exercises', () => {
    const none = summarizeLessonCompletion(threeExerciseLesson, { status: 'in-progress', exerciseProgress: [] });
    expect(none).toMatchObject({
      completedExerciseCount: 0,
      requiredExerciseCount: 3,
      progress: 0,
      isCompleted: false,
    });

    const one = summarizeLessonCompletion(threeExerciseLesson, {
      status: 'in-progress',
      exerciseProgress: [{ exerciseId: 'exercise-a', score: 0, completedAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(one.progress).toBe(33);
    expect(one.isCompleted).toBe(false);

    const two = summarizeLessonCompletion(threeExerciseLesson, {
      furthestPageIndex: 1,
      status: 'in-progress',
      exerciseProgress: [
        { exerciseId: 'exercise-a', score: 10, completedAt: '2026-01-01T00:00:00.000Z' },
        { exerciseId: 'exercise-b', score: 100, completedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    expect(two.progress).toBe(67);
    expect(two.isCompleted).toBe(false);

    const all = summarizeLessonCompletion(threeExerciseLesson, {
      status: 'in-progress',
      exerciseProgress: [
        { exerciseId: 'exercise-a', score: 0, completedAt: '2026-01-01T00:00:00.000Z' },
        { exerciseId: 'exercise-b', score: 40, completedAt: '2026-01-01T00:00:00.000Z' },
        { exerciseId: 'exercise-c', score: 100, completedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    expect(all).toMatchObject({ progress: 100, isCompleted: true, missingExercises: [] });
  });

  it('caps an incomplete rounded exercise percentage at 99', () => {
    const manyExerciseLesson = {
      ...lesson,
      pages: [
        {
          id: 'page-many',
          items: Array.from({ length: 200 }, (_, index) => ({
            id: `exercise-${index}`,
            type: 'fill',
            title: `Exercise ${index}`,
          })),
        },
      ],
    } as unknown as Lesson;
    const summary = summarizeLessonCompletion(manyExerciseLesson, {
      status: 'in-progress',
      exerciseProgress: Array.from({ length: 199 }, (_, index) => ({
        exerciseId: `exercise-${index}`,
        score: 0,
        completedAt: '2026-01-01T00:00:00.000Z',
      })),
    });

    expect(summary).toMatchObject({
      completedExerciseCount: 199,
      requiredExerciseCount: 200,
      progress: 99,
      isCompleted: false,
    });
  });

  it('keeps passive-only lessons page-based', () => {
    expect(summarizeLessonCompletion(passiveLesson, { furthestPageIndex: 1, status: 'in-progress' })).toMatchObject({
      progress: 67,
      isCompleted: false,
      requiredExerciseCount: 0,
    });
    expect(summarizeLessonCompletion(passiveLesson, { furthestPageIndex: 2, status: 'in-progress' })).toMatchObject({
      progress: 100,
      isCompleted: true,
    });
    expect(summarizeLessonCompletion(passiveLesson, { currentPageIndex: 2, status: 'in-progress' })).toMatchObject({
      progress: 100,
      isCompleted: true,
    });
  });

  it('never regresses a stored completed lesson', () => {
    const summary = summarizeLessonCompletion(threeExerciseLesson, {
      status: 'completed',
      exerciseProgress: [],
      furthestPageIndex: 0,
    });
    expect(summary.progress).toBe(100);
    expect(summary.isCompleted).toBe(true);
  });

  it('treats only schema versions below 2 as legacy completion cursors', () => {
    expect(hasLegacyCompletion({ currentPageIndex: 3, progressSchemaVersion: 1 }, 3)).toBe(true);
    expect(hasLegacyCompletion({ currentPageIndex: 3, progressSchemaVersion: 2 }, 3)).toBe(false);
    expect(hasLegacyCompletion({ currentPageIndex: 3, progressSchemaVersion: 3 }, 3)).toBe(false);
    expect(hasLegacyCompletion({ currentPageIndex: 3, progressSchemaVersion: 99 }, 3)).toBe(false);
    expect(hasLegacyCompletion({ currentPageIndex: 3, progressSchemaVersion: '1' as never }, 3)).toBe(false);
  });

  it('trusts only current schema-v4 exercise summaries and keeps passive progress page-based', () => {
    expect(
      calculateStoredProgress(
        {
          progressSchemaVersion: 4,
          progress: 33,
          completedExerciseCount: 1,
          requiredExerciseCount: 3,
          progressLessonVersion: 0,
          furthestPageIndex: 0,
          status: 'in-progress',
        },
        { totalPages: 3, totalExercises: 3 }
      )
    ).toBe(33);
    expect(
      calculateStoredProgress(
        {
          progressSchemaVersion: 5,
          completedExerciseCount: 1,
          requiredExerciseCount: 3,
          progressLessonVersion: 0,
          status: 'in-progress',
        },
        { totalPages: 3, totalExercises: 3 }
      )
    ).toBe(0);
    expect(
      calculateStoredProgress(
        {
          progressSchemaVersion: 4,
          progress: 66,
          completedExerciseCount: 2,
          requiredExerciseCount: 2,
          progressLessonVersion: 0,
          furthestPageIndex: 2,
          status: 'in-progress',
        },
        { totalPages: 4, totalExercises: 3 }
      )
    ).toBe(0);
    expect(
      calculateStoredProgress(
        { progressSchemaVersion: 1, currentPageIndex: 0, status: 'in-progress' },
        { totalPages: 2, totalExercises: 0 }
      )
    ).toBe(50);
  });

  it('derives detail counts from current authored IDs after same-count exercise replacement', () => {
    const replacementLesson = {
      ...threeExerciseLesson,
      pages: [{ id: 'page-a', items: [{ id: 'replacement', type: 'fill', title: 'Replacement' }] }],
    } as unknown as Lesson;
    const summary = summarizeLessonCompletion(replacementLesson, {
      status: 'in-progress',
      furthestPageIndex: 0,
      exerciseProgress: [{ exerciseId: 'exercise-a', score: 100, completedAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(summary.requiredExerciseCount).toBe(1);
    expect(summary.completedExerciseCount).toBe(0);
    expect(summary.exerciseProgress).toEqual([]);
    expect(summary.isCompleted).toBe(false);
  });

  it('can display numeric 100 without treating the lesson as unlocked', () => {
    const stored = {
      progressSchemaVersion: 4,
      progress: 100,
      completedExerciseCount: 0,
      requiredExerciseCount: 1,
      progressLessonVersion: 0,
      status: 'in-progress' as const,
      furthestPageIndex: 0,
    };
    expect(calculateStoredProgress(stored, { totalPages: 2, totalExercises: 1 })).toBe(0);
    expect(isStoredLessonComplete(stored, 2)).toBe(false);
    expect(
      isProgressionUnitComplete(
        { id: 'lesson-1', kind: 'lesson', totalPages: 2 },
        { progressByUnitId: new Map([['lesson-1', stored]]), attemptedTestIds: new Set() }
      )
    ).toBe(false);
  });
});

describe('progress migration', () => {
  it('drops malformed persisted scores while preserving valid zero scores', () => {
    const result = migrateUserProgress(
      lesson,
      {
        status: 'in-progress',
        exerciseProgress: [
          { exerciseId: 'exercise-a', score: -1, completedAt: '2026-01-01T00:00:00.000Z' },
          { exerciseId: 'exercise-b', score: 101, completedAt: '2026-01-01T00:00:00.000Z' },
          { exerciseId: 'exercise-a', score: 0, completedAt: '2026-02-01T00:00:00.000Z' },
        ],
      },
      '2026-07-14T00:00:00.000Z'
    );

    expect(result.progress.exerciseProgress).toEqual([
      { exerciseId: 'exercise-a', score: 0, completedAt: '2026-02-01T00:00:00.000Z' },
    ]);
    expect(result.unmappedExerciseRecords).toBe(2);
  });

  it('preserves completion, maps valid records, and ignores unmappable partial credit', () => {
    const result = migrateUserProgress(
      lesson,
      {
        userId: 'user-1',
        lessonId: lesson.id,
        status: 'completed',
        currentPageIndex: 3,
        exerciseProgress: [
          { exerciseId: 'page0-item1', score: 100, completedAt: '2026-01-01T00:00:00.000Z' },
          { exerciseId: 'page9-item9', score: 100, completedAt: '2026-01-01T00:00:00.000Z' },
        ],
      },
      '2026-07-14T00:00:00.000Z'
    );

    expect(result.progress).toMatchObject({
      status: 'completed',
      furthestPageIndex: 2,
      currentPageIndex: 2,
      progressSchemaVersion: 2,
      exerciseProgress: [{ exerciseId: 'exercise-a', score: 100, completedAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(result.mappedExerciseRecords).toBe(1);
    expect(result.unmappedExerciseRecords).toBe(1);
    expect(result.derivedCompletion).toBe(false);
  });

  it('derives completion from a legacy cursor at the page count', () => {
    const result = migrateUserProgress(
      lesson,
      { status: 'in-progress', currentPageIndex: 3, exerciseProgress: [] },
      '2026-07-14T00:00:00.000Z'
    );
    expect(result.progress.status).toBe('completed');
    expect(result.progress.completedAt).toBe('2026-07-14T00:00:00.000Z');
    expect(result.derivedCompletion).toBe(true);
  });
});
