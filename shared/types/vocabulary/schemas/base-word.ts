import { z } from 'zod';
import { PartOfSpeechSchema, WordTypeSchema } from './enums';

export const FirestoreTimestampSchema = z.string();

export const BaseWordSchema = z.object({
  word: z.string().min(1),
  part_of_speech: PartOfSpeechSchema,
  translation: z.string().min(1),
  definitions: z.array(z.string()),
  etymology: z.string().min(1).nullable(),
  pronunciation: z.string().min(1).nullable(),
  type: WordTypeSchema,
  alternate_form: z.string().min(1).nullable(),
  dictionary_entry: z.string().nullable(),
  sort_key: z.string().min(1),
  random_index: z.number().min(0).max(1),
  createdAt: FirestoreTimestampSchema,
  updatedAt: FirestoreTimestampSchema,
});
