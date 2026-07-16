import { z } from 'zod';
import { LESSON_UNIT_TYPES } from '@/src/types/learning-unit';
import { validatePageDocumentIds } from '@/src/utils/lessonProgress';

export const nonEmptyIdSchema = z.string().trim().min(1);
export const firestoreDocumentIdSchema = nonEmptyIdSchema.refine(
  id => id !== '.' && id !== '..' && !id.includes('/'),
  'ID must be a single Firestore document path segment'
);
export const passingPercentageSchema = z.number().int().min(1).max(100).nullable();

const nullableAuditFieldSchema = z.string().min(1).nullable();
const optionalAuditFieldSchema = z.string().min(1).optional();

export const contentItemSchema = z
  .object({
    id: nonEmptyIdSchema,
    type: z.string().trim().min(1),
    title: z.string().optional(),
    audioPath: z.string().nullable().optional(),
    maxPoints: z.number().optional(),
  })
  .passthrough();

export const pageSchema = z
  .object({
    id: nonEmptyIdSchema,
    title: z.string().optional(),
    items: z.array(contentItemSchema),
    audioPath: z.string().nullable().optional(),
    autoAdvance: z
      .object({
        enabled: z.boolean(),
        delay: z.number().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .passthrough();

export const testVersionReferenceSchema = z
  .object({
    versionId: firestoreDocumentIdSchema,
    label: z.string().trim().min(1),
    mockTestId: firestoreDocumentIdSchema.nullable(),
  })
  .strict();

export const learningUnitBaseSchema = z.object({
  id: firestoreDocumentIdSchema,
  kind: z.enum(['lesson', 'test']),
  title: z.string().trim().min(1),
  description: z.string(),
  isLive: z.boolean(),
  liveOrder: z.number().int().nonnegative().nullable(),
  publishedAt: nullableAuditFieldSchema,
  publishedBy: nullableAuditFieldSchema,
  createdAt: optionalAuditFieldSchema,
  createdBy: optionalAuditFieldSchema,
  updatedAt: optionalAuditFieldSchema,
  updatedBy: optionalAuditFieldSchema,
});

const lessonUnitShapeSchema = learningUnitBaseSchema
  .extend({
    kind: z.literal('lesson'),
    type: z.enum(LESSON_UNIT_TYPES),
    pages: z.array(pageSchema),
    vocabulary_pool: firestoreDocumentIdSchema.nullable().optional(),
    version: z.number().int().positive().optional(),
    totalPages: z.number().int().nonnegative().optional(),
    totalItems: z.number().int().nonnegative().optional(),
    totalExercises: z.number().int().nonnegative().optional(),
  })
  .strict();

function refineLessonUnit(value: z.infer<typeof lessonUnitShapeSchema>, context: z.RefinementCtx) {
  if (value.pages.length === 0) {
    if (value.isLive) {
      context.addIssue({ code: 'custom', message: 'Lesson must contain at least one page.', path: ['pages'] });
    }
    return;
  }

  for (const message of validatePageDocumentIds(value.pages)) {
    context.addIssue({ code: 'custom', message, path: ['pages'] });
  }
}

export const lessonUnitSchema = lessonUnitShapeSchema.superRefine(refineLessonUnit);

const testUnitShapeSchema = learningUnitBaseSchema
  .extend({
    kind: z.literal('test'),
    type: z.literal('normal'),
    versions: z.array(testVersionReferenceSchema).min(1),
    passingPercentage: passingPercentageSchema,
  })
  .strict();

function refineTestUnit(value: z.infer<typeof testUnitShapeSchema>, context: z.RefinementCtx) {
  const versionIds = value.versions.map(reference => reference.versionId);
  if (new Set(versionIds).size !== versionIds.length) {
    context.addIssue({
      code: 'custom',
      message: 'Version references must be unique',
      path: ['versions'],
    });
  }

  const mockTestIds = value.versions.flatMap(reference => (reference.mockTestId ? [reference.mockTestId] : []));
  if (new Set(mockTestIds).size !== mockTestIds.length) {
    context.addIssue({
      code: 'custom',
      message: 'A mock test can be assigned to only one version reference',
      path: ['versions'],
    });
  }

  if (value.isLive && !value.versions.some(reference => reference.mockTestId === null)) {
    context.addIssue({
      code: 'custom',
      message: 'A live test must have at least one version in normal rotation',
      path: ['versions'],
    });
  }
}

export const testUnitSchema = testUnitShapeSchema.superRefine(refineTestUnit);

export const learningUnitDocumentSchema = z
  .discriminatedUnion('kind', [lessonUnitShapeSchema, testUnitShapeSchema])
  .superRefine((value, context) => {
    if (value.kind === 'lesson') refineLessonUnit(value, context);
    else refineTestUnit(value, context);
  });

export type LearningUnitDocument = z.infer<typeof learningUnitDocumentSchema>;
