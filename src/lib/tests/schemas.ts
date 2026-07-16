import { z } from 'zod';
import { isExerciseType, isKnownContentType, isTestEligibleExerciseType } from '@/src/lib/content/registry';
import { firestoreDocumentIdSchema, pageSchema, passingPercentageSchema } from '@/src/lib/learning-units/schemas';
import { validatePageDocumentIds } from '@/src/utils/lessonProgress';
import { getTestVersionSummaryFields } from './domain';

const optionalAuditFieldSchema = z.string().min(1).optional();

const testVersionContentShape = {
  id: firestoreDocumentIdSchema,
  name: z.string().trim().min(1),
  pages: z.array(pageSchema).min(1),
};

const testVersionInputShapeSchema = z.object(testVersionContentShape).strict();

function refineTestVersionContent(value: z.infer<typeof testVersionInputShapeSchema>, context: z.RefinementCtx) {
  for (const message of validatePageDocumentIds(value.pages, 'Test version')) {
    context.addIssue({ code: 'custom', message, path: ['pages'] });
  }

  let exerciseCount = 0;
  value.pages.forEach((page, pageIndex) => {
    page.items.forEach((item, itemIndex) => {
      const path = ['pages', pageIndex, 'items', itemIndex] as (string | number)[];

      if (!isKnownContentType(item.type)) {
        context.addIssue({
          code: 'custom',
          message: `Unsupported content type "${item.type}"`,
          path: [...path, 'type'],
        });
        return;
      }

      if (!isExerciseType(item.type)) {
        if (item.maxPoints !== undefined) {
          context.addIssue({
            code: 'custom',
            message: 'Non-exercise content cannot define maxPoints',
            path: [...path, 'maxPoints'],
          });
        }
        return;
      }

      exerciseCount += 1;
      if (!isTestEligibleExerciseType(item.type)) {
        context.addIssue({
          code: 'custom',
          message: `Exercise type "${item.type}" is not eligible for tests`,
          path: [...path, 'type'],
        });
      }
      if (!Number.isInteger(item.maxPoints) || (item.maxPoints ?? 0) <= 0) {
        context.addIssue({
          code: 'custom',
          message: 'Test exercises require a positive whole-number maxPoints',
          path: [...path, 'maxPoints'],
        });
      }
    });
  });

  if (exerciseCount === 0) {
    context.addIssue({
      code: 'custom',
      message: 'A test version must contain at least one scored exercise',
      path: ['pages'],
    });
  }
}

export const testVersionInputSchema = testVersionInputShapeSchema.superRefine(refineTestVersionContent);

const testVersionDocumentShapeSchema = z
  .object({
    ...testVersionContentShape,
    totalPages: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalExercises: z.number().int().positive(),
    totalPoints: z.number().int().positive(),
    createdAt: optionalAuditFieldSchema,
    createdBy: optionalAuditFieldSchema,
    updatedAt: optionalAuditFieldSchema,
    updatedBy: optionalAuditFieldSchema,
  })
  .strict();

export const testVersionDocumentSchema = testVersionDocumentShapeSchema.superRefine((value, context) => {
  refineTestVersionContent(value, context);
  const derived = getTestVersionSummaryFields(value.pages);

  (Object.keys(derived) as (keyof typeof derived)[]).forEach(field => {
    if (value[field] !== derived[field]) {
      context.addIssue({
        code: 'custom',
        message: `${field} must be derived from pages`,
        path: [field],
      });
    }
  });
});

const mockTestParentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('test'), testId: firestoreDocumentIdSchema }).strict(),
  z.object({ kind: z.literal('standalone') }).strict(),
]);

const mockTestShapeSchema = z
  .object({
    id: firestoreDocumentIdSchema,
    versionId: firestoreDocumentIdSchema,
    parent: mockTestParentSchema,
    title: z.string().trim().min(1),
    description: z.string(),
    passingPercentage: passingPercentageSchema,
    status: z.enum(['active', 'archived']),
    isLive: z.boolean(),
    mockOrder: z.number().int().nonnegative().nullable(),
    createdAt: optionalAuditFieldSchema,
    createdBy: optionalAuditFieldSchema,
    updatedAt: optionalAuditFieldSchema,
    updatedBy: optionalAuditFieldSchema,
  })
  .strict();

export const mockTestDocumentSchema = mockTestShapeSchema.superRefine((value, context) => {
  if (value.status === 'archived' && (value.isLive || value.mockOrder !== null)) {
    context.addIssue({
      code: 'custom',
      message: 'Archived mocks must be non-live and have no mock order',
      path: ['status'],
    });
  }

  if (value.isLive && (value.status !== 'active' || value.mockOrder === null)) {
    context.addIssue({
      code: 'custom',
      message: 'Live mocks must be active and have a mock order',
      path: ['isLive'],
    });
  }
});

export type TestVersionInput = z.infer<typeof testVersionInputSchema>;
export type MockTestDocument = z.infer<typeof mockTestDocumentSchema>;
