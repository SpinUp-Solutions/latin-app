import { z } from 'zod';
import { VerbSchema } from '@/shared/types/vocabulary/schemas/verb';

export const VerbFormSchema = VerbSchema.omit({
  part_of_speech: true,
  word: true,
  translation: true,
  definitions: true,
  etymology: true,
  pronunciation: true,
  type: true,
  alternate_form: true,
  dictionary_entry: true,
  sort_key: true,
  random_index: true,
  createdAt: true,
  updatedAt: true,
  conjugation_table: true,
});

export type VerbFormValues = z.infer<typeof VerbFormSchema>;
