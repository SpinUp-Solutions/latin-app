import type { LessonSummary } from '@/src/types/lesson';
import type {
  PracticeCategory,
  PracticeCategoryLesson,
  PracticeCategoryMembership,
  PracticeCategoryStatus,
  PracticeCategoryWithCounts,
  PracticeLessonType,
  PracticeTag,
  PracticeTagStatus,
} from '@/src/types/practice-category';
import { orderByIds } from '@/src/utils/orderByIds';
import { appApi } from './appApi';
import { PRACTICE_CATEGORY_ASSIGNMENTS_TAG, STUDENT_DASHBOARD_TAG } from './tags';

export interface GetPracticeCategoriesArgs {
  lessonType: PracticeLessonType;
  status?: PracticeCategoryStatus;
}

export interface PracticeCategoryDetailResponse {
  category: PracticeCategoryWithCounts;
  lessons: PracticeCategoryLesson[];
  tagUsageCounts: Record<string, number>;
}

export interface CreatePracticeCategoryArgs {
  lessonType: PracticeLessonType;
  name: string;
  description?: string;
}

export interface UpdatePracticeCategoryArgs {
  categoryId: string;
  changes: {
    name?: string;
    description?: string;
    status?: PracticeCategoryStatus;
  };
}

interface ReorderPracticeCategoriesArgs {
  lessonType: PracticeLessonType;
  orderedCategoryIds: string[];
}

interface CategoryLessonsArgs {
  categoryId: string;
  lessonIds: string[];
}

interface ReorderCategoryLessonsArgs {
  categoryId: string;
  orderedLessonIds: string[];
}

interface RemoveCategoryLessonArgs {
  categoryId: string;
  lessonId: string;
}

interface CreatePracticeTagArgs {
  categoryId: string;
  name: string;
}

interface UpdatePracticeTagArgs {
  categoryId: string;
  tagId: string;
  changes: {
    name?: string;
    status?: PracticeTagStatus;
  };
}

interface DeletePracticeTagArgs {
  categoryId: string;
  tagId: string;
}

interface ReorderPracticeTagsArgs {
  categoryId: string;
  orderedTagIds: string[];
}

interface UpdatePracticeMembershipTagsArgs {
  categoryId: string;
  lessonId: string;
  tagIds: string[];
}

const afterSuccessfulMutation = async (mutation: Promise<unknown>, effect: () => void) => {
  try {
    await mutation;
    effect();
  } catch {
    return;
  }
};

const categoryTags = (
  result: PracticeCategory[] | undefined,
  lessonType: PracticeLessonType,
  status: PracticeCategoryStatus
) => [
  ...(result?.map(category => ({ type: 'PracticeCategory' as const, id: category.id })) ?? []),
  { type: 'PracticeCategory' as const, id: `${lessonType}:${status}` },
];

export const practiceCategoryApi = appApi.injectEndpoints({
  endpoints: builder => ({
    getPracticeCategories: builder.query<PracticeCategory[], GetPracticeCategoriesArgs>({
      query: ({ lessonType, status = 'active' }) => ({
        url: '/admin/practice-categories',
        params: { lessonType, status },
      }),
      transformResponse: (response: { categories: PracticeCategory[] } | PracticeCategory[]) =>
        Array.isArray(response) ? response : response.categories,
      providesTags: (result, error, { lessonType, status = 'active' }) => categoryTags(result, lessonType, status),
    }),
    getPracticeCategoriesWithCounts: builder.query<PracticeCategoryWithCounts[], GetPracticeCategoriesArgs>({
      query: ({ lessonType, status = 'active' }) => ({
        url: '/admin/practice-categories',
        params: { lessonType, status, includeCounts: 'true' },
      }),
      transformResponse: (response: { categories: PracticeCategoryWithCounts[] } | PracticeCategoryWithCounts[]) =>
        Array.isArray(response) ? response : response.categories,
      providesTags: (result, error, { lessonType, status = 'active' }) => categoryTags(result, lessonType, status),
    }),
    getPracticeCategoryDetail: builder.query<PracticeCategoryDetailResponse, string>({
      query: categoryId => `/admin/practice-categories/${categoryId}/lessons`,
      providesTags: (result, error, categoryId) => [{ type: 'PracticeCategory', id: categoryId }],
    }),
    getAvailablePracticeCategoryLessons: builder.query<LessonSummary[], string>({
      query: categoryId => `/admin/practice-categories/${categoryId}/lessons/available`,
      transformResponse: (response: { availableLessons: LessonSummary[] }) => response.availableLessons,
      providesTags: (result, error, categoryId) => [{ type: 'PracticeCategory', id: `AVAILABLE:${categoryId}` }],
    }),
    createPracticeCategory: builder.mutation<{ category: PracticeCategory }, CreatePracticeCategoryArgs>({
      query: body => ({
        url: '/admin/practice-categories',
        method: 'POST',
        body,
      }),
      invalidatesTags: (result, error) =>
        error || !result
          ? []
          : [
              { type: 'PracticeCategory', id: `${result.category.lessonType}:${result.category.status}` },
              STUDENT_DASHBOARD_TAG,
            ],
    }),
    updatePracticeCategory: builder.mutation<{ category: PracticeCategory }, UpdatePracticeCategoryArgs>({
      query: ({ categoryId, changes }) => ({
        url: `/admin/practice-categories/${categoryId}`,
        method: 'PATCH',
        body: changes,
      }),
      invalidatesTags: (result, error, { categoryId }) =>
        error
          ? []
          : [
              { type: 'PracticeCategory', id: categoryId },
              ...(result
                ? [
                    {
                      type: 'PracticeCategory' as const,
                      id: `${result.category.lessonType}:${result.category.status}`,
                    },
                  ]
                : []),
              STUDENT_DASHBOARD_TAG,
            ],
    }),
    deletePracticeCategory: builder.mutation<void, string>({
      query: categoryId => ({
        url: `/admin/practice-categories/${categoryId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, categoryId) =>
        error ? [] : [{ type: 'PracticeCategory', id: categoryId }, STUDENT_DASHBOARD_TAG],
    }),
    reorderPracticeCategories: builder.mutation<{ categories: PracticeCategory[] }, ReorderPracticeCategoriesArgs>({
      query: body => ({
        url: '/admin/practice-categories/reorder',
        method: 'POST',
        body,
      }),
      async onQueryStarted({ lessonType, orderedCategoryIds }, { dispatch, queryFulfilled }) {
        const args = { lessonType, status: 'active' as const };
        const patches = [
          dispatch(
            practiceCategoryApi.util.updateQueryData('getPracticeCategories', args, categories => {
              const reordered = orderByIds(categories, orderedCategoryIds);
              reordered.forEach((category, index) => {
                category.categoryOrder = index;
              });
              categories.splice(0, categories.length, ...reordered);
            })
          ),
          dispatch(
            practiceCategoryApi.util.updateQueryData('getPracticeCategoriesWithCounts', args, categories => {
              const reordered = orderByIds(categories, orderedCategoryIds);
              reordered.forEach((category, index) => {
                category.categoryOrder = index;
              });
              categories.splice(0, categories.length, ...reordered);
            })
          ),
        ];

        try {
          await queryFulfilled;
          dispatch(appApi.util.invalidateTags([STUDENT_DASHBOARD_TAG]));
        } catch {
          patches.forEach(patch => patch.undo());
        }
      },
    }),
    createPracticeTag: builder.mutation<{ tag: PracticeTag }, CreatePracticeTagArgs>({
      query: ({ categoryId, name }) => ({
        url: `/admin/practice-categories/${categoryId}/tags`,
        method: 'POST',
        body: { name },
      }),
      invalidatesTags: (result, error, { categoryId }) =>
        error
          ? []
          : [{ type: 'PracticeCategory', id: categoryId }, PRACTICE_CATEGORY_ASSIGNMENTS_TAG, STUDENT_DASHBOARD_TAG],
    }),
    updatePracticeTag: builder.mutation<{ tag: PracticeTag }, UpdatePracticeTagArgs>({
      query: ({ categoryId, tagId, changes }) => ({
        url: `/admin/practice-categories/${categoryId}/tags/${tagId}`,
        method: 'PATCH',
        body: changes,
      }),
      invalidatesTags: (result, error, { categoryId }) =>
        error
          ? []
          : [{ type: 'PracticeCategory', id: categoryId }, PRACTICE_CATEGORY_ASSIGNMENTS_TAG, STUDENT_DASHBOARD_TAG],
    }),
    deletePracticeTag: builder.mutation<void, DeletePracticeTagArgs>({
      query: ({ categoryId, tagId }) => ({
        url: `/admin/practice-categories/${categoryId}/tags/${tagId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { categoryId }) =>
        error
          ? []
          : [{ type: 'PracticeCategory', id: categoryId }, PRACTICE_CATEGORY_ASSIGNMENTS_TAG, STUDENT_DASHBOARD_TAG],
    }),
    reorderPracticeTags: builder.mutation<{ tags: PracticeTag[] }, ReorderPracticeTagsArgs>({
      query: ({ categoryId, orderedTagIds }) => ({
        url: `/admin/practice-categories/${categoryId}/tags/reorder`,
        method: 'POST',
        body: { orderedTagIds },
      }),
      invalidatesTags: (result, error, { categoryId }) => (error ? [] : [{ type: 'PracticeCategory', id: categoryId }]),
      async onQueryStarted({ categoryId, orderedTagIds }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          practiceCategoryApi.util.updateQueryData('getPracticeCategoryDetail', categoryId, detail => {
            const activeTags = detail.category.tags.filter(tag => tag.status === 'active');
            const archivedTags = detail.category.tags.filter(tag => tag.status === 'archived');
            const reordered = orderByIds(activeTags, orderedTagIds).map((tag, tagOrder) => ({
              ...tag,
              tagOrder,
            }));
            detail.category.tags = [...reordered, ...archivedTags];
          })
        );

        try {
          await queryFulfilled;
          dispatch(appApi.util.invalidateTags([PRACTICE_CATEGORY_ASSIGNMENTS_TAG, STUDENT_DASHBOARD_TAG]));
        } catch {
          patch.undo();
        }
      },
    }),
    updatePracticeMembershipTags: builder.mutation<
      { membership: PracticeCategoryMembership },
      UpdatePracticeMembershipTagsArgs
    >({
      query: ({ categoryId, lessonId, tagIds }) => ({
        url: `/admin/practice-categories/${categoryId}/lessons/${lessonId}/tags`,
        method: 'PUT',
        body: { tagIds },
      }),
      invalidatesTags: (result, error, { categoryId }) => (error ? [] : [{ type: 'PracticeCategory', id: categoryId }]),
      async onQueryStarted({ categoryId, lessonId, tagIds }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          practiceCategoryApi.util.updateQueryData('getPracticeCategoryDetail', categoryId, detail => {
            const lesson = detail.lessons.find(candidate => candidate.id === lessonId);
            if (!lesson) return;
            lesson.tagIds.forEach(tagId => {
              detail.tagUsageCounts[tagId] = Math.max(0, (detail.tagUsageCounts[tagId] ?? 0) - 1);
            });
            lesson.tagIds = [...tagIds];
            tagIds.forEach(tagId => {
              detail.tagUsageCounts[tagId] = (detail.tagUsageCounts[tagId] ?? 0) + 1;
            });
          })
        );

        try {
          await queryFulfilled;
          dispatch(appApi.util.invalidateTags([PRACTICE_CATEGORY_ASSIGNMENTS_TAG, STUDENT_DASHBOARD_TAG]));
        } catch {
          patch.undo();
        }
      },
    }),
    addPracticeCategoryLessons: builder.mutation<{ memberships: PracticeCategoryMembership[] }, CategoryLessonsArgs>({
      query: ({ categoryId, lessonIds }) => ({
        url: `/admin/practice-categories/${categoryId}/lessons`,
        method: 'POST',
        body: { lessonIds },
      }),
      invalidatesTags: (result, error, { categoryId }) =>
        error
          ? []
          : [
              { type: 'PracticeCategory', id: categoryId },
              { type: 'PracticeCategory', id: `AVAILABLE:${categoryId}` },
              STUDENT_DASHBOARD_TAG,
            ],
      onQueryStarted(args, { dispatch, queryFulfilled }) {
        void afterSuccessfulMutation(queryFulfilled, () => {
          dispatch(appApi.util.invalidateTags([PRACTICE_CATEGORY_ASSIGNMENTS_TAG]));
        });
      },
    }),
    removePracticeCategoryLesson: builder.mutation<{ removed: boolean }, RemoveCategoryLessonArgs>({
      query: ({ categoryId, lessonId }) => ({
        url: `/admin/practice-categories/${categoryId}/lessons/${lessonId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { categoryId }) =>
        error
          ? []
          : [
              { type: 'PracticeCategory', id: categoryId },
              { type: 'PracticeCategory', id: `AVAILABLE:${categoryId}` },
              STUDENT_DASHBOARD_TAG,
            ],
      onQueryStarted(args, { dispatch, queryFulfilled }) {
        void afterSuccessfulMutation(queryFulfilled, () => {
          dispatch(appApi.util.invalidateTags([PRACTICE_CATEGORY_ASSIGNMENTS_TAG]));
        });
      },
    }),
    reorderPracticeCategoryLessons: builder.mutation<
      { memberships: PracticeCategoryMembership[] },
      ReorderCategoryLessonsArgs
    >({
      query: ({ categoryId, orderedLessonIds }) => ({
        url: `/admin/practice-categories/${categoryId}/lessons/reorder`,
        method: 'POST',
        body: { orderedLessonIds },
      }),
      async onQueryStarted({ categoryId, orderedLessonIds }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          practiceCategoryApi.util.updateQueryData('getPracticeCategoryDetail', categoryId, detail => {
            detail.lessons = orderByIds(detail.lessons, orderedLessonIds).map((lesson, lessonOrder) => ({
              ...lesson,
              lessonOrder,
            }));
          })
        );

        try {
          await queryFulfilled;
          dispatch(appApi.util.invalidateTags([PRACTICE_CATEGORY_ASSIGNMENTS_TAG, STUDENT_DASHBOARD_TAG]));
        } catch {
          patch.undo();
        }
      },
    }),
  }),
});

export const {
  useGetPracticeCategoriesQuery,
  useGetPracticeCategoriesWithCountsQuery,
  useGetPracticeCategoryDetailQuery,
  useLazyGetAvailablePracticeCategoryLessonsQuery,
  useCreatePracticeCategoryMutation,
  useUpdatePracticeCategoryMutation,
  useDeletePracticeCategoryMutation,
  useReorderPracticeCategoriesMutation,
  useCreatePracticeTagMutation,
  useUpdatePracticeTagMutation,
  useDeletePracticeTagMutation,
  useReorderPracticeTagsMutation,
  useUpdatePracticeMembershipTagsMutation,
  useAddPracticeCategoryLessonsMutation,
  useRemovePracticeCategoryLessonMutation,
  useReorderPracticeCategoryLessonsMutation,
} = practiceCategoryApi;
