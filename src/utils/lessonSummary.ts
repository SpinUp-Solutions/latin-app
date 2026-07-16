import { Lesson, LessonSummary } from '@/src/types/lesson';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { isExerciseType } from '@/src/utils/lessonUtils';

export function getLessonContentCounts(lesson: Pick<Lesson, 'pages'>): {
  totalPages: number;
  totalItems: number;
  totalExercises: number;
} {
  const pages = lesson.pages || [];

  return pages.reduce(
    (counts, page) => {
      const items = page.items || [];
      counts.totalItems += items.length;
      counts.totalExercises += items.filter(item => isExerciseType(item.type)).length;
      return counts;
    },
    {
      totalPages: pages.length,
      totalItems: 0,
      totalExercises: 0,
    }
  );
}

export function toLessonSummary(id: string, data: Partial<Lesson>): LessonSummary {
  if (!isLessonDocumentData(data)) {
    throw new Error(`Learning unit ${id} is not a lesson`);
  }

  const counts = data.pages
    ? getLessonContentCounts({ pages: data.pages })
    : {
        totalPages: data.totalPages || 0,
        totalItems: data.totalItems || 0,
        totalExercises: data.totalExercises || 0,
      };

  return {
    id,
    kind: 'lesson',
    title: data.title || '',
    description: data.description,
    type: data.type || 'normal',
    vocabulary_pool: data.vocabulary_pool,
    isLive: data.isLive || false,
    liveOrder: data.liveOrder ?? null,
    publishedAt: data.publishedAt ?? null,
    publishedBy: data.publishedBy ?? null,
    createdAt: data.createdAt,
    createdBy: data.createdBy,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy,
    version: data.version,
    totalPages: counts.totalPages,
    totalItems: counts.totalItems,
    totalExercises: counts.totalExercises,
  };
}
