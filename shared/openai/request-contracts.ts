import { z } from 'zod';
import { PartOfSpeechSchema } from '../types/vocabulary/schemas/enums';
import { AI_COMPLETABLE_FIELDS } from './types';

const MAX_EXISTING_DATA_BYTES = 200_000;

const existingVocabularyDataSchema = z.record(z.string().min(1).max(100), z.unknown()).superRefine((value, context) => {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_EXISTING_DATA_BYTES) {
    context.addIssue({ code: 'custom', message: 'existingData is too large' });
  }
});

const aiCompletableFieldSchema = z.enum(AI_COMPLETABLE_FIELDS);

export const aiAutocompleteRequestSchema = z
  .object({
    word: z.string().trim().min(1).max(120),
    part_of_speech: PartOfSpeechSchema,
    existingData: existingVocabularyDataSchema.optional(),
    fieldsToComplete: z
      .array(aiCompletableFieldSchema)
      .max(AI_COMPLETABLE_FIELDS.length)
      .superRefine((fields, context) => {
        if (new Set(fields).size !== fields.length) {
          context.addIssue({ code: 'custom', message: 'fieldsToComplete must be unique' });
        }
      })
      .optional(),
    overwriteExisting: z.boolean().optional(),
  })
  .strict();

export const rootWordRequestSchema = z
  .object({
    selectedText: z.string().trim().min(1).max(200),
    context: z.string().trim().min(1).max(8_000).optional(),
  })
  .strict();

export const translationGradingRequestSchema = z
  .object({
    sourceText: z.string().trim().min(1).max(10_000),
    userTranslation: z.string().trim().min(1).max(10_000),
    direction: z.enum(['latin-to-english', 'english-to-latin']),
  })
  .strict();

export type ResolveRootWordRequest = z.infer<typeof rootWordRequestSchema>;
