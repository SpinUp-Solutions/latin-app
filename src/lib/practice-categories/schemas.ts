import { z } from 'zod';
import { PRACTICE_LESSON_TYPES } from '@/src/types/practice-category';

const nonEmptyIdSchema = z.string().trim().min(1);

const uniqueIds = (ids: string[]) => new Set(ids).size === ids.length;

export const practiceLessonTypeSchema = z.enum(PRACTICE_LESSON_TYPES);
export const practiceCategoryStatusSchema = z.enum(['active', 'archived']);
export const practiceTagStatusSchema = z.enum(['active', 'archived']);

export const practiceTagDocumentSchema = z.object({
  id: nonEmptyIdSchema,
  name: z.string().trim().min(1),
  normalizedName: z.string().min(1),
  status: practiceTagStatusSchema,
  tagOrder: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  createdBy: z.string().min(1),
  updatedAt: z.string().min(1),
  updatedBy: z.string().min(1),
});

export const practiceCategoryDocumentSchema = z.object({
  id: nonEmptyIdSchema,
  lessonType: practiceLessonTypeSchema,
  name: z.string().trim().min(1),
  normalizedName: z.string().min(1),
  description: z.string().optional(),
  status: practiceCategoryStatusSchema,
  categoryOrder: z.number().int().nonnegative(),
  tags: z.array(practiceTagDocumentSchema).default([]),
  createdAt: z.string().min(1),
  createdBy: z.string().min(1),
  updatedAt: z.string().min(1),
  updatedBy: z.string().min(1),
});

export const practiceCategoryMembershipDocumentSchema = z.object({
  id: nonEmptyIdSchema,
  categoryId: nonEmptyIdSchema,
  lessonId: nonEmptyIdSchema,
  lessonOrder: z.number().int().nonnegative(),
  tagIds: z.array(nonEmptyIdSchema).refine(uniqueIds, 'tagIds must not contain duplicates').default([]),
  createdAt: z.string().min(1),
  createdBy: z.string().min(1),
  updatedAt: z.string().min(1),
  updatedBy: z.string().min(1),
});

const optionalDescriptionSchema = z
  .string()
  .trim()
  .optional()
  .transform(value => value || undefined);

export const createPracticeCategorySchema = z
  .object({
    lessonType: practiceLessonTypeSchema,
    name: z.string().trim().min(1, 'Category name is required'),
    description: optionalDescriptionSchema,
  })
  .strict();

export const updatePracticeCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Category name is required').optional(),
    description: optionalDescriptionSchema,
    status: practiceCategoryStatusSchema.optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, 'At least one category change is required');

export const listPracticeCategoriesQuerySchema = z
  .object({
    lessonType: practiceLessonTypeSchema.optional(),
    status: practiceCategoryStatusSchema.optional(),
  })
  .strict();

export const reorderPracticeCategoriesSchema = z
  .object({
    lessonType: practiceLessonTypeSchema,
    orderedCategoryIds: z.array(nonEmptyIdSchema).refine(uniqueIds, 'orderedCategoryIds must not contain duplicates'),
  })
  .strict();

export const addPracticeCategoryLessonsSchema = z
  .object({
    lessonIds: z
      .array(nonEmptyIdSchema)
      .min(1, 'Select at least one lesson')
      .refine(uniqueIds, 'lessonIds must not contain duplicates'),
  })
  .strict();

export const reorderPracticeCategoryLessonsSchema = z
  .object({
    orderedLessonIds: z.array(nonEmptyIdSchema).refine(uniqueIds, 'orderedLessonIds must not contain duplicates'),
  })
  .strict();

export const createPracticeTagSchema = z
  .object({
    name: z.string().trim().min(1, 'Tag name is required'),
  })
  .strict();

export const updatePracticeTagSchema = z
  .object({
    name: z.string().trim().min(1, 'Tag name is required').optional(),
    status: practiceTagStatusSchema.optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, 'At least one tag change is required');

export const reorderPracticeTagsSchema = z
  .object({
    orderedTagIds: z.array(nonEmptyIdSchema).refine(uniqueIds, 'orderedTagIds must not contain duplicates'),
  })
  .strict();

export const replacePracticeMembershipTagsSchema = z
  .object({
    tagIds: z.array(nonEmptyIdSchema).refine(uniqueIds, 'tagIds must not contain duplicates'),
  })
  .strict();

export const practiceCategorySelectionSchema = z
  .object({
    categoryId: nonEmptyIdSchema,
    tagIds: z.array(nonEmptyIdSchema).refine(uniqueIds, 'tagIds must not contain duplicates'),
  })
  .strict();

export const practiceCategorySelectionsSchema = z
  .array(practiceCategorySelectionSchema)
  .refine(
    selections => uniqueIds(selections.map(selection => selection.categoryId)),
    'practiceCategorySelections must not contain duplicate categories'
  );

export const optionalPracticeCategorySelectionsSchema = practiceCategorySelectionsSchema.optional();

export const reconcilePracticeCategoryAssignmentsSchema = z
  .object({
    practiceCategorySelections: practiceCategorySelectionsSchema.optional(),
    practiceCategoryIds: z
      .array(nonEmptyIdSchema)
      .refine(uniqueIds, 'practiceCategoryIds must not contain duplicates')
      .optional(),
  })
  .strict()
  .refine(
    value => value.practiceCategorySelections !== undefined || value.practiceCategoryIds !== undefined,
    'practiceCategorySelections or practiceCategoryIds is required'
  );

export const reconcilePracticeCategoriesSchema = z
  .object({
    practiceCategoryIds: z.array(nonEmptyIdSchema).refine(uniqueIds, 'practiceCategoryIds must not contain duplicates'),
  })
  .strict();

export const optionalPracticeCategoryIdsSchema = z
  .array(nonEmptyIdSchema)
  .refine(uniqueIds, 'practiceCategoryIds must not contain duplicates')
  .optional();

export type CreatePracticeCategoryInput = z.infer<typeof createPracticeCategorySchema>;
export type UpdatePracticeCategoryInput = z.infer<typeof updatePracticeCategorySchema>;
export type CreatePracticeTagInput = z.infer<typeof createPracticeTagSchema>;
export type UpdatePracticeTagInput = z.infer<typeof updatePracticeTagSchema>;
