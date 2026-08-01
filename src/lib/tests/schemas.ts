import { z } from 'zod';
import { isExerciseType, isKnownContentType, isTestEligibleExerciseType } from '@/src/lib/content/registry';
import { firestoreDocumentIdSchema, pageSchema, passingPercentageSchema } from '@/src/lib/learning-units/schemas';
import { validatePageDocumentIds } from '@/src/utils/lessonProgress';
import { getTestVersionSummaryFields } from './domain';

const optionalAuditFieldSchema = z.string().min(1).optional();
const isoTimestampSchema = z
  .string()
  .refine(
    value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
    'Expected a canonical ISO-8601 timestamp'
  );

const optionalDescriptionSchema = z
  .string()
  .trim()
  .optional()
  .transform(value => value ?? '');

const testVersionContentShape = {
  id: firestoreDocumentIdSchema,
  name: z.string().trim().min(1),
  pages: z.array(pageSchema).min(1, 'A test version must contain at least one page'),
  vocabularyPoolId: firestoreDocumentIdSchema.nullable().optional(),
};

const testVersionInputShapeSchema = z.object(testVersionContentShape).strict();

export const testVersionDraftInputSchema = z
  .object({
    ...testVersionContentShape,
    pages: z.array(pageSchema),
  })
  .strict();

export const updateTestVersionDraftInputSchema = testVersionDraftInputSchema.omit({ id: true });

function refineTestVersionContent(
  value: Pick<z.infer<typeof testVersionInputShapeSchema>, 'pages'>,
  context: z.RefinementCtx
) {
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

const testVersionUpdateShapeSchema = z
  .object({
    name: testVersionContentShape.name,
    pages: testVersionContentShape.pages,
    vocabularyPoolId: testVersionContentShape.vocabularyPoolId,
  })
  .strict();

export const updateTestVersionInputSchema = testVersionUpdateShapeSchema.superRefine(refineTestVersionContent);

export const duplicateTestVersionInputSchema = z
  .object({
    requestId: firestoreDocumentIdSchema,
    name: z.string().trim().min(1).optional(),
  })
  .strict();

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

export const testVersionSummaryDocumentSchema = testVersionDocumentShapeSchema.omit({ pages: true });

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

const testVersionDraftDocumentShapeSchema = z
  .object({
    ...testVersionContentShape,
    testId: firestoreDocumentIdSchema,
    pages: z.array(pageSchema),
    totalPages: z.number().int().nonnegative(),
    totalItems: z.number().int().nonnegative(),
    totalExercises: z.number().int().nonnegative(),
    totalPoints: z.number(),
    createdAt: optionalAuditFieldSchema,
    createdBy: optionalAuditFieldSchema,
    updatedAt: optionalAuditFieldSchema,
    updatedBy: optionalAuditFieldSchema,
  })
  .strict();

export const testVersionDraftSummaryDocumentSchema = testVersionDraftDocumentShapeSchema.omit({ pages: true });

export const testVersionDraftDocumentSchema = testVersionDraftDocumentShapeSchema.superRefine((value, context) => {
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

const mockSettingsShape = {
  title: z.string().trim().min(1),
  description: z.string().trim().default(''),
  passingPercentage: passingPercentageSchema,
  isLive: z.boolean(),
};

export const createStandaloneMockInputSchema = z
  .object({
    mock: z.object({ id: firestoreDocumentIdSchema, ...mockSettingsShape }).strict(),
    version: testVersionInputSchema,
  })
  .strict();

export const assignVersionToMockInputSchema = z
  .object({
    testId: firestoreDocumentIdSchema,
    versionId: firestoreDocumentIdSchema,
    title: z.string().trim().min(1),
    description: z.string().trim().default(''),
    passingPercentage: passingPercentageSchema,
    isLive: z.boolean(),
  })
  .strict();

export const updateMockTestInputSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    passingPercentage: passingPercentageSchema.optional(),
    isLive: z.boolean().optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, 'At least one mock setting must be provided');

/** Standalone reactivation is deliberately explicit about future visibility. */
export const reactivateStandaloneMockInputSchema = z.object({ isLive: z.boolean() }).strict();
export const moveStandaloneMockToTestInputSchema = z.object({ testId: firestoreDocumentIdSchema }).strict();
export const duplicateStandaloneMockVersionIntoTestInputSchema = z
  .object({
    testId: firestoreDocumentIdSchema,
    requestId: firestoreDocumentIdSchema,
  })
  .strict();
export const reorderMockTestsInputSchema = z
  .object({ mockIds: z.array(firestoreDocumentIdSchema).min(1).max(500) })
  .strict()
  .refine(value => new Set(value.mockIds).size === value.mockIds.length, 'Mock IDs must be unique');

export const testAttemptOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('normal-test'), testId: firestoreDocumentIdSchema }).strict(),
  z.object({ kind: z.literal('mock-test'), mockTestId: firestoreDocumentIdSchema }).strict(),
]);

const testAttemptDeliveryStateSchema = z
  .object({
    versionId: firestoreDocumentIdSchema,
    pages: z.array(pageSchema).min(1),
    resolvedExercises: z.record(z.string(), z.object({ items: z.array(z.unknown()) }).strict()),
    vocabularyPool: z
      .object({
        id: firestoreDocumentIdSchema,
        name: z.string().trim().min(1),
        items: z.array(
          z
            .object({
              id: z.string().min(1),
              latin: z.string(),
              english: z.string(),
              pronunciation: z.string().nullable().optional(),
              audioPath: z.string().nullable().optional(),
              example: z.string().optional(),
              partOfSpeech: z.string().optional(),
              notes: z.string().optional(),
            })
            .strict()
        ),
      })
      .strict()
      .optional(),
  })
  .strict();

const testAttemptBaseShape = {
  id: firestoreDocumentIdSchema,
  studentId: z.string().min(1),
  versionId: firestoreDocumentIdSchema,
  passingPercentage: passingPercentageSchema,
  origin: testAttemptOriginSchema,
  startedAt: z.string().min(1),
  updatedAt: z.string().min(1),
};

const inProgressTestAttemptDocumentSchema = z
  .object({
    ...testAttemptBaseShape,
    status: z.literal('in-progress'),
    answers: z.record(z.string(), z.unknown()),
    deliveryState: testAttemptDeliveryStateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.versionId !== value.deliveryState.versionId) {
      context.addIssue({
        code: 'custom',
        message: 'Attempt versionId must match deliveryState.versionId',
        path: ['deliveryState', 'versionId'],
      });
    }
  });

export const submittedTestAttemptDocumentSchema = z
  .object({
    ...testAttemptBaseShape,
    status: z.literal('submitted'),
    exerciseResults: z.record(
      z.string(),
      z
        .object({
          title: z.string().optional(),
          awardedPoints: z.number().finite().nonnegative(),
          maxPoints: z.number().finite().positive(),
        })
        .strict()
    ),
    score: z.number().finite().nonnegative(),
    maxScore: z.number().finite().positive(),
    percentage: z.number().finite().min(0).max(100),
    outcome: z.enum(['score-only', 'passed', 'not-passed']),
    submittedAt: isoTimestampSchema,
  })
  .strict();

/** Slim projection used by best/latest dashboard summary queries. */
export const submittedAttemptResultProjectionSchema = z
  .object({
    score: z.number().finite().nonnegative(),
    maxScore: z.number().finite().positive(),
    percentage: z.number().finite().min(0).max(100),
    outcome: z.enum(['score-only', 'passed', 'not-passed']),
    submittedAt: isoTimestampSchema,
  })
  .strict();

/** Narrow projection used for mock-card history queries. */
export const submittedAttemptTrendProjectionSchema = z
  .object({
    percentage: z.number().finite().min(0).max(100),
    submittedAt: isoTimestampSchema,
  })
  .strict();

export const testAttemptDocumentSchema = z.union([
  inProgressTestAttemptDocumentSchema,
  submittedTestAttemptDocumentSchema,
]);

export const testAttemptSessionDocumentSchema = z
  .object({
    id: firestoreDocumentIdSchema,
    studentId: z.string().min(1),
    origin: testAttemptOriginSchema,
    attemptId: firestoreDocumentIdSchema,
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const startTestAttemptInputSchema = z.object({ origin: testAttemptOriginSchema }).strict();

export const saveTestAttemptAnswersInputSchema = z
  .object({
    answers: z.record(
      z.string().trim().min(1).max(1500),
      z.unknown().refine(value => value !== undefined, 'answer is required; use null to clear it')
    ),
  })
  .strict()
  .refine(value => Object.keys(value.answers).length > 0, 'At least one answer is required')
  .refine(value => Object.keys(value.answers).length <= 100, 'No more than 100 answers may be saved at once');

export const createTestUnitInputSchema = z
  .object({
    id: firestoreDocumentIdSchema,
    title: z.string().trim().min(1),
    description: optionalDescriptionSchema,
    passingPercentage: passingPercentageSchema,
  })
  .strict();

export const createTestWithVersionSchema = z
  .object({
    test: createTestUnitInputSchema,
    version: testVersionInputSchema,
  })
  .strict();

export const updateTestUnitInputSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    passingPercentage: passingPercentageSchema.optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, 'At least one test setting must be provided');

export const updateTestWithVersionInputSchema = z
  .object({
    versionId: firestoreDocumentIdSchema,
    test: updateTestUnitInputSchema,
    version: updateTestVersionInputSchema,
  })
  .strict();

export type TestVersionInput = z.infer<typeof testVersionInputSchema>;
export type UpdateTestVersionInput = z.infer<typeof updateTestVersionInputSchema>;
export type TestVersionDraftInput = z.infer<typeof testVersionDraftInputSchema>;
export type UpdateTestVersionDraftInput = z.infer<typeof updateTestVersionDraftInputSchema>;
export type DuplicateTestVersionInput = z.infer<typeof duplicateTestVersionInputSchema>;
export type CreateTestUnitInput = z.infer<typeof createTestUnitInputSchema>;
export type CreateTestWithVersionInput = z.infer<typeof createTestWithVersionSchema>;
export type UpdateTestUnitInput = z.infer<typeof updateTestUnitInputSchema>;
export type UpdateTestWithVersionInput = z.infer<typeof updateTestWithVersionInputSchema>;
export type CreateStandaloneMockInput = z.infer<typeof createStandaloneMockInputSchema>;
export type AssignVersionToMockInput = z.infer<typeof assignVersionToMockInputSchema>;
export type UpdateMockTestInput = z.infer<typeof updateMockTestInputSchema>;
export type ReactivateStandaloneMockInput = z.infer<typeof reactivateStandaloneMockInputSchema>;
export type MoveStandaloneMockToTestInput = z.infer<typeof moveStandaloneMockToTestInputSchema>;
export type DuplicateStandaloneMockVersionIntoTestInput = z.infer<
  typeof duplicateStandaloneMockVersionIntoTestInputSchema
>;
export type ReorderMockTestsInput = z.infer<typeof reorderMockTestsInputSchema>;
export type StartTestAttemptInput = z.infer<typeof startTestAttemptInputSchema>;
export type SaveTestAttemptAnswersInput = z.infer<typeof saveTestAttemptAnswersInputSchema>;
