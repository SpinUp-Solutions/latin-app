import { z } from 'zod';
import { PartOfSpeechSchema, WordTypeSchema } from './enums';

export const FirestoreTimestampSchema = z.string();

export const BaseWordSchema = z.object({
  word: z.string().min(1),
  part_of_speech: PartOfSpeechSchema,
  translation: z.string().min(1),
  definitions: z.array(z.string().min(1)).min(1),
  etymology: z.string().min(1).nullable(),
  pronunciation: z.string().min(1).nullable(),
  type: WordTypeSchema,
  alternate_form: z.string().min(1).nullable(),
  createdAt: FirestoreTimestampSchema,
  updatedAt: FirestoreTimestampSchema,
});
