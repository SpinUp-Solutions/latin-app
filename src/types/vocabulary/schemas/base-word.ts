import { z } from 'zod';
import { PartOfSpeechSchema, WordTypeSchema } from './enums';

export const FirestoreTimestampSchema = z.object({
  seconds: z.number(),
  nanoseconds: z.number(),
});

export const BaseWordSchema = z.object({
  word: z.string(),
  part_of_speech: PartOfSpeechSchema,
  translation: z.string(),
  definitions: z.array(z.string()),
  etymology: z.string().nullable().optional(),
  pronunciation: z.string().nullable().optional(),
  type: WordTypeSchema,
  alternate_form: z.string().nullable().optional(),
  createdAt: FirestoreTimestampSchema,
  updatedAt: FirestoreTimestampSchema,
});
