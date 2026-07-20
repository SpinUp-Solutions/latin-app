import type { Lesson } from '@/src/types/lesson';
import {
  calculateStoredProgress,
  getFurthestPageIndex,
  getMissingExercises,
  getRequiredExercises,
  isStoredLessonComplete,
  normalizeExerciseProgress,
  resolveExerciseId,
  validateLessonProgression,
} from '@/src/utils/lessonProgress';
import { migrateUserProgress } from '@/src/utils/progressMigration';

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
      { exerciseId: 'exercise-a' },
      { exerciseId: 'exercise-b' },
      { exerciseId: 'deleted-exercise' },
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

  it('keeps stored completion separate from page position and caps incomplete progress', () => {
    expect(isStoredLessonComplete({ progressSchemaVersion: 2, furthestPageIndex: 2, status: 'in-progress' }, 3)).toBe(
      false
    );
    expect(calculateStoredProgress({ progressSchemaVersion: 2, furthestPageIndex: 2, status: 'in-progress' }, 3)).toBe(
      99
    );
    expect(calculateStoredProgress({ progressSchemaVersion: 2, furthestPageIndex: 0, status: 'completed' }, 3)).toBe(
      100
    );
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

describe('progress migration', () => {
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
