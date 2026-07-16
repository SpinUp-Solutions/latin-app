import { GET } from '@/src/app/api/lessons/route';
import type { PracticeCategory, PracticeCategoryMembership } from '@/src/types/practice-category';

const mockLessonsGet = jest.fn();
const mockGetAssignments = jest.fn();
const mockCollection = jest.fn();
const mockVerifyIdToken = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));

jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

jest.mock('firebase-admin', () => ({
  auth: () => ({ verifyIdToken: (...args: unknown[]) => mockVerifyIdToken(...args) }),
}));

jest.mock('@/src/lib/practice-categories/service', () => ({
  practiceCategoryService: {
    getAssignmentsForLessonIds: (...args: unknown[]) => mockGetAssignments(...args),
  },
}));

const category = (id: string, status: PracticeCategory['status'], categoryOrder: number): PracticeCategory => ({
  id,
  lessonType: 'vocab',
  name: id === 'authors' ? 'Authors' : 'Archived topics',
  normalizedName: id,
  status,
  categoryOrder,
  createdAt: '2026-07-14T00:00:00.000Z',
  createdBy: 'admin',
  updatedAt: '2026-07-14T00:00:00.000Z',
  updatedBy: 'admin',
});

const membership = (categoryId: string, lessonId: string, lessonOrder: number): PracticeCategoryMembership => ({
  id: `${categoryId}-${lessonId}`,
  categoryId,
  lessonId,
  lessonOrder,
  createdAt: '2026-07-14T00:00:00.000Z',
  createdBy: 'admin',
  updatedAt: '2026-07-14T00:00:00.000Z',
  updatedBy: 'admin',
});

const lessonDocument = (id: string, type: string, liveOrder: number) => ({
  id,
  data: () => ({
    title: id,
    description: `${id} description`,
    type,
    pages: [],
    isLive: true,
    liveOrder,
    publishedAt: '2026-07-14T00:00:00.000Z',
    publishedBy: 'admin',
  }),
});

const testDocument = {
  id: 'test-1',
  data: () => ({
    kind: 'test',
    title: 'Chapter test',
    description: 'Assessment',
    isLive: true,
    liveOrder: 2,
    rotationVersions: [{ versionId: 'version-1' }],
  }),
};

const request = () => ({ headers: { get: () => null } }) as never;

describe('student lesson practice category enrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLessonsGet.mockResolvedValue({
      empty: false,
      docs: [lessonDocument('normal-1', 'normal', 0), lessonDocument('vocab-1', 'vocab', 1), testDocument],
    });
    mockCollection.mockImplementation((name: string) => {
      if (name !== 'lessons') throw new Error(`Unexpected collection: ${name}`);
      return {
        where: () => ({
          orderBy: () => ({ get: mockLessonsGet }),
        }),
      };
    });
  });

  it('returns active categories and sanitized lesson ordering while excluding archived assignments', async () => {
    const activeCategory = category('authors', 'active', 0);
    const archivedCategory = category('archived', 'archived', 1);
    mockGetAssignments.mockResolvedValue(
      new Map([
        [
          'vocab-1',
          {
            practiceCategoryIds: [activeCategory.id, archivedCategory.id],
            practiceCategories: [activeCategory, archivedCategory],
            memberships: [membership(activeCategory.id, 'vocab-1', 3), membership(archivedCategory.id, 'vocab-1', 7)],
          },
        ],
      ])
    );

    const response = (await GET(request())) as unknown as {
      status: number;
      body: { lessons: Array<Record<string, unknown>> };
    };

    expect(response.status).toBe(200);
    expect(mockGetAssignments).toHaveBeenCalledWith(['vocab-1']);
    const vocabLesson = response.body.lessons.find(lesson => lesson.id === 'vocab-1');
    const normalLesson = response.body.lessons.find(lesson => lesson.id === 'normal-1');
    expect(response.body.lessons.find(lesson => lesson.id === 'test-1')).toBeUndefined();
    expect(vocabLesson?.practiceCategories).toEqual([
      {
        id: activeCategory.id,
        lessonType: activeCategory.lessonType,
        name: activeCategory.name,
        description: activeCategory.description,
        status: activeCategory.status,
        categoryOrder: activeCategory.categoryOrder,
      },
    ]);
    expect((vocabLesson?.practiceCategories as Array<Record<string, unknown>>)[0]).not.toHaveProperty('createdBy');
    expect((vocabLesson?.practiceCategories as Array<Record<string, unknown>>)[0]).not.toHaveProperty('normalizedName');
    expect(vocabLesson?.practiceCategoryPlacements).toEqual([{ categoryId: activeCategory.id, lessonOrder: 3 }]);
    expect(normalLesson).not.toHaveProperty('practiceCategories');
    expect(normalLesson).toEqual(expect.objectContaining({ status: 'available', progress: 0 }));
  });

  it('keeps All Practice available when category enrichment fails', async () => {
    const categoryError = new Error('category query unavailable');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockGetAssignments.mockRejectedValue(categoryError);

    const response = (await GET(request())) as unknown as {
      body: { lessons: Array<Record<string, unknown>> };
    };

    expect(response.body.lessons.find(lesson => lesson.id === 'vocab-1')).not.toHaveProperty('practiceCategories');
    expect(consoleError).toHaveBeenCalledWith(
      'Unable to enrich student practice lessons with categories:',
      categoryError
    );
    consoleError.mockRestore();
  });
});
