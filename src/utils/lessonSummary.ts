import { Lesson, LessonSummary } from '@/src/types/lesson';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { isExerciseType } from '@/src/utils/lessonUtils';

export function getLessonContentCounts(lesson: Pick<Lesson, 'pages'>): {
  totalPages: number;
  totalItems: number;
  totalExercises: number;
} {
  // Inventory summaries are intentionally more defensive than the strict
  // lesson authoring schema. The Learning Path organizer must still render a
  // repair link when an older persisted lesson has a damaged page shape.
  const rawPages = (lesson as unknown as { pages?: unknown }).pages;
  const pages = Array.isArray(rawPages) ? rawPages : [];

  return pages.reduce(
    (counts, page) => {
      const items =
        page && typeof page === 'object' && !Array.isArray(page) && Array.isArray((page as { items?: unknown }).items)
          ? (page as { items: unknown[] }).items
          : [];
      counts.totalItems += items.length;
      counts.totalExercises += items.filter(
        item =>
          item &&
          typeof item === 'object' &&
          typeof (item as { type?: unknown }).type === 'string' &&
          isExerciseType((item as { type: string }).type)
      ).length;
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
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    type: typeof data.type === 'string' ? data.type : 'normal',
    vocabulary_pool: data.vocabulary_pool,
    showWordSearch: data.showWordSearch !== false,
    isLive: data.isLive === true,
    liveOrder: typeof data.liveOrder === 'number' ? data.liveOrder : null,
    publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : null,
    publishedBy: typeof data.publishedBy === 'string' ? data.publishedBy : null,
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
