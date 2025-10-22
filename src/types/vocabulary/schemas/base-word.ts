import { z } from 'zod';
import { PartOfSpeechSchema, WordTypeSchema } from './enums';

export const FirestoreTimestampSchema = z.string();

export const BaseWordSchema = z.object({
  word: z.string(),
  part_of_speech: PartOfSpeechSchema,
  translation: z.string(),
  definitions: z.array(z.string()),
  etymology: z.string().nullable(),
  pronunciation: z.string().nullable(),
  type: WordTypeSchema,
  alternate_form: z.string().nullable(),
  createdAt: FirestoreTimestampSchema,
  updatedAt: FirestoreTimestampSchema,
});
