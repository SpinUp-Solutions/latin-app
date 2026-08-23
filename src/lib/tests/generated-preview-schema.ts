import { z } from 'zod';
import {
  AdjectiveDeclensionSchema,
  NounDeclensionSchema,
  PartOfSpeechSchema,
  PronounPersonSchema,
  PronounTypeSchema,
  VerbConjugationSchema,
} from '@/shared/types/vocabulary/schemas/enums';
import { MAX_GENERATED_FILTER_OPERANDS, MAX_GENERATED_WORD_COUNT } from '@/src/config/generatedExerciseLimits';
import type { ExerciseWordResponse } from '@/src/types/api/exercise-word-responses';
import type { GeneratedFormIdentificationExercise } from '@/src/types/exercises/generated-form-identification';
import type { GeneratedTranslationExercise } from '@/src/types/exercises/generated-translation';
import { FormIdentificationStepSchema } from '@/src/types/exercises/schemas/form-identification';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';

export const generatedWordCountSchema = z.union([
  z.literal('all'),
  z.number().int().positive().max(MAX_GENERATED_WORD_COUNT),
]);

const formSelectionSchema = z
  .object({
    tableType: z.string().trim().min(1),
    selectedCellPaths: z.array(z.string()).default([]),
  })
  .optional();

function commaSeparatedEnumSchema(allowed: readonly string[]) {
  const allowedValues = new Set(allowed);
  return z.string().superRefine((value, ctx) => {
    if (!value || value === 'all') return;
    const parts = value
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Filter value cannot be blank' });
      return;
    }
    if (parts.length > MAX_GENERATED_FILTER_OPERANDS) {
      ctx.addIssue({
        code: 'custom',
        message: `Filter cannot include more than ${MAX_GENERATED_FILTER_OPERANDS} values`,
      });
      return;
    }
    for (const part of parts) {
      if (!allowedValues.has(part)) {
        ctx.addIssue({
          code: 'custom',
          message: `Invalid filter value: ${part}`,
        });
      }
    }
  });
}

export const generatedPreviewFiltersSchema = z.object({
  partOfSpeech: z.union([z.literal('all'), PartOfSpeechSchema]).optional(),
  search: z.string().max(200).optional(),
  verbConjugation: commaSeparatedEnumSchema(VerbConjugationSchema.options).optional(),
  isDeponent: z.enum(['true', 'false', 'both', 'all']).optional(),
  nounDeclension: commaSeparatedEnumSchema(NounDeclensionSchema.options).optional(),
  adjectiveDeclension: commaSeparatedEnumSchema(AdjectiveDeclensionSchema.options).optional(),
  pronounType: commaSeparatedEnumSchema(PronounTypeSchema.options).optional(),
  pronounPerson: commaSeparatedEnumSchema(PronounPersonSchema.options).optional(),
});

export const generatedPreviewGeneratorConfigSchema = z
  .object({
    collection: z.string().optional(),
    wordSource: z.enum(['filters', 'pool']).default('filters'),
    poolId: z.string().trim().min(1).nullable().optional(),
    poolWordLimit: z.number().int().positive().nullable().optional(),
    count: generatedWordCountSchema,
    filters: generatedPreviewFiltersSchema.optional(),
    formSelection: formSelectionSchema,
  })
  .passthrough();

const generatedPreviewPosConfigSchema = z
  .object({
    enabled: z.boolean(),
    filters: generatedPreviewFiltersSchema.default({}),
    formSelection: formSelectionSchema,
  })
  .passthrough();

const generatedPreviewParadigmConfigSchema = z
  .object({
    enabled: z.boolean(),
    steps: z.array(FormIdentificationStepSchema).default([]),
    filters: generatedPreviewFiltersSchema.default({}),
    formSelection: formSelectionSchema,
  })
  .passthrough();

export const GeneratedExercisePreviewRequestSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('generated-form-identification'),
      data: z
        .object({
          mode: z.enum(['step-by-step', 'single-field']).default('step-by-step'),
          requireAllPrimaryAnswers: z.boolean().optional(),
          generatorConfig: generatedPreviewGeneratorConfigSchema,
          paradigmConfigs: z.record(z.string(), generatedPreviewParadigmConfigSchema).default({}),
        })
        .passthrough(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('generated-translation'),
      translationDirection: z.enum(['latin-to-english', 'english-to-latin']).optional(),
      data: z
        .object({
          generatorConfig: generatedPreviewGeneratorConfigSchema,
          posConfigs: z.record(z.string(), generatedPreviewPosConfigSchema).default({}),
        })
        .passthrough(),
    })
    .passthrough(),
]);

export const GeneratedExercisePlaybackRequestSchema = z
  .object({
    lessonId: firestoreDocumentIdSchema,
    pageIndex: z.number().int().nonnegative(),
    itemIndex: z.number().int().nonnegative(),
    exerciseId: firestoreDocumentIdSchema,
  })
  .strict();

export type GeneratedExercisePreviewRequest =
  | Pick<GeneratedFormIdentificationExercise, 'type' | 'data'>
  | {
      type: 'generated-translation';
      translationDirection?: GeneratedTranslationExercise['translationDirection'];
      data: GeneratedTranslationExercise['data'];
    };

export type GeneratedExercisePlaybackRequest = z.infer<typeof GeneratedExercisePlaybackRequestSchema>;

export type GeneratedExercisePreviewDiagnostics = {
  specId: string;
  collected: number;
  scanned: number;
  exhausted: boolean;
  scanLimitReached: boolean;
};

export type GeneratedExercisePreviewResult = {
  words: ExerciseWordResponse[];
  diagnostics: GeneratedExercisePreviewDiagnostics[];
  requestedCount: number | 'all';
  collected: number;
  globalScanLimitReached: boolean;
};
