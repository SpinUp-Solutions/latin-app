import { z } from 'zod';
import { LESSON_UNIT_TYPES } from '@/src/types/learning-unit';
import { validatePageDocumentIds } from '@/src/utils/lessonProgress';

export const nonEmptyIdSchema = z.string().trim().min(1);
export const firestoreDocumentIdSchema = nonEmptyIdSchema.refine(
  id => id !== '.' && id !== '..' && !id.includes('/'),
  'ID must be a single Firestore document path segment'
);
export const passingPercentageSchema = z.number().int().min(1).max(100).nullable();
export const MAX_LEARNING_PATH_UNITS = 5000;
export const MAX_LEARNING_PATH_JSON_BYTES = 750 * 1024;

const utf8ByteLength = (value: string) => {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
};

const hasSafeLearningPathJsonSize = (value: unknown) =>
  utf8ByteLength(JSON.stringify(value)) <= MAX_LEARNING_PATH_JSON_BYTES;

const addLearningPathSizeIssue = (value: unknown, context: z.RefinementCtx) => {
  if (!hasSafeLearningPathJsonSize(value)) {
    context.addIssue({
      code: 'custom',
      message: 'Learning Path payload is too large to save safely',
    });
  }
};

const nullableAuditFieldSchema = z.string().min(1).nullable();
const optionalAuditFieldSchema = z.string().min(1).optional();

const contentItemSchema = z
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

const rotationVersionReferenceSchema = z
  .object({
    versionId: firestoreDocumentIdSchema,
  })
  .strict();

const learningUnitBaseSchema = z.object({
  id: firestoreDocumentIdSchema,
  kind: z.enum(['lesson', 'test']),
  title: z.string().trim().min(1),
  description: z.string(),
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
    showWordSearch: z.boolean().optional(),
    isLive: z.boolean(),
    liveOrder: z.number().int().nonnegative().nullable(),
    publishedAt: nullableAuditFieldSchema,
    publishedBy: nullableAuditFieldSchema,
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

const testUnitShapeSchema = learningUnitBaseSchema
  .extend({
    kind: z.literal('test'),
    rotationVersions: z.array(rotationVersionReferenceSchema),
    passingPercentage: passingPercentageSchema,
  })
  .strict();

function refineTestUnit(
  value: z.infer<typeof testUnitShapeSchema>,
  context: z.RefinementCtx,
  requireRotationVersion = false
) {
  const versionIds = value.rotationVersions.map(reference => reference.versionId);
  if (new Set(versionIds).size !== versionIds.length) {
    context.addIssue({
      code: 'custom',
      message: 'Version references must be unique',
      path: ['rotationVersions'],
    });
  }

  if (requireRotationVersion && value.rotationVersions.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'A test must have at least one version in normal rotation when it is created or published',
      path: ['rotationVersions'],
    });
  }
}

export const testUnitSchema = testUnitShapeSchema.superRefine(refineTestUnit);
export const testUnitCreateSchema = testUnitShapeSchema.superRefine((value, context) =>
  refineTestUnit(value, context, true)
);

export const learningUnitDocumentSchema = z
  .discriminatedUnion('kind', [lessonUnitShapeSchema, testUnitShapeSchema])
  .superRefine((value, context) => {
    if (value.kind === 'lesson') refineLessonUnit(value, context);
    else refineTestUnit(value, context);
  });

const uniqueUnitIdsSchema = z
  .array(firestoreDocumentIdSchema)
  .max(MAX_LEARNING_PATH_UNITS)
  .superRefine((unitIds, context) => {
    if (new Set(unitIds).size !== unitIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Learning Path unit IDs must be unique',
      });
    }
  });

const learningPathCutoverSchema = z
  .object({
    state: z.enum(['active', 'inactive']),
    migrationId: nonEmptyIdSchema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    appliedAt: z.string().min(1),
    appliedBy: nonEmptyIdSchema,
    rolledBackAt: z.string().min(1).optional(),
    rolledBackBy: nonEmptyIdSchema.optional(),
  })
  .strict()
  .superRefine((cutover, context) => {
    const hasRollbackAudit = Boolean(cutover.rolledBackAt && cutover.rolledBackBy);
    if (Boolean(cutover.rolledBackAt) !== Boolean(cutover.rolledBackBy)) {
      context.addIssue({
        code: 'custom',
        message: 'Rollback audit fields must be supplied together',
      });
    }
    if (cutover.state === 'active' && hasRollbackAudit) {
      context.addIssue({
        code: 'custom',
        message: 'An active cutover cannot retain rollback audit fields',
      });
    }
    if (cutover.state === 'inactive' && !hasRollbackAudit) {
      context.addIssue({
        code: 'custom',
        message: 'An inactive cutover requires rollback audit fields',
      });
    }
  });

export const learningPathDocumentSchema = z
  .object({
    id: z.literal('default'),
    revision: z.number().int().nonnegative().safe(),
    unitIds: uniqueUnitIdsSchema,
    updatedAt: z.string().min(1),
    updatedBy: nonEmptyIdSchema,
    cutover: learningPathCutoverSchema.optional(),
  })
  .strict()
  .superRefine(addLearningPathSizeIssue);

export const saveLearningPathInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative().safe(),
    unitIds: uniqueUnitIdsSchema,
  })
  .strict()
  .superRefine(addLearningPathSizeIssue);

const learningPathMigrationSourceSchema = z
  .array(
    z
      .object({
        unitId: firestoreDocumentIdSchema,
        liveOrder: z.number().int().nonnegative().safe(),
      })
      .strict()
  )
  .max(MAX_LEARNING_PATH_UNITS);

export const learningPathMigrationManifestSchema = z
  .object({
    migrationId: nonEmptyIdSchema,
    createdAt: z.string().min(1),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    unitIds: uniqueUnitIdsSchema,
    source: learningPathMigrationSourceSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    addLearningPathSizeIssue(manifest, context);
    const sourceIds = manifest.source.map(record => record.unitId);
    if (new Set(sourceIds).size !== sourceIds.length) {
      context.addIssue({ code: 'custom', message: 'Migration source unit IDs must be unique', path: ['source'] });
    }
    const orders = manifest.source.map(record => record.liveOrder);
    if (new Set(orders).size !== orders.length) {
      context.addIssue({ code: 'custom', message: 'Migration source orders must be unique', path: ['source'] });
    }
    const orderedSourceIds = [...manifest.source]
      .sort((left, right) => left.liveOrder - right.liveOrder)
      .map(record => record.unitId);
    if (
      orderedSourceIds.length !== manifest.unitIds.length ||
      orderedSourceIds.some((unitId, index) => unitId !== manifest.unitIds[index])
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Manifest unitIds must exactly match source records in liveOrder order',
        path: ['unitIds'],
      });
    }
  });

export type SaveLearningPathInput = z.infer<typeof saveLearningPathInputSchema>;
export type LearningPathMigrationManifestInput = z.infer<typeof learningPathMigrationManifestSchema>;

const learningPathMigrationEventSchema = z
  .object({
    action: z.enum(['prepared', 'recovered', 'applied', 'verified', 'rolled-back', 'retired']),
    at: z.string().min(1),
    by: nonEmptyIdSchema,
    pathRevision: z.number().int().nonnegative().safe().optional(),
  })
  .strict();

export const learningPathMigrationRecordSchema = z
  .object({
    id: nonEmptyIdSchema,
    migrationId: nonEmptyIdSchema,
    manifest: learningPathMigrationManifestSchema,
    status: z.enum(['prepared', 'active', 'verified', 'rolled-back', 'retired']),
    createdAt: z.string().min(1),
    createdBy: nonEmptyIdSchema,
    updatedAt: z.string().min(1),
    updatedBy: nonEmptyIdSchema,
    events: z.array(learningPathMigrationEventSchema).min(1).max(100),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.id !== record.migrationId || record.manifest.migrationId !== record.migrationId) {
      context.addIssue({
        code: 'custom',
        message: 'Migration record, document, and manifest IDs must match',
        path: ['migrationId'],
      });
    }
    addLearningPathSizeIssue(record, context);
  });

export type LearningPathMigrationRecord = z.infer<typeof learningPathMigrationRecordSchema>;

export const learningPathMigrationActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('dry-run'),
      migrationId: nonEmptyIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('apply'),
      migrationId: nonEmptyIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('verify'),
      migrationId: nonEmptyIdSchema,
    })
    .strict(),
  z.object({ action: z.literal('recover') }).strict(),
  z.object({ action: z.literal('rollback'), migrationId: nonEmptyIdSchema }).strict(),
  z.object({ action: z.literal('retire'), migrationId: nonEmptyIdSchema }).strict(),
]);
