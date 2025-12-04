import { z } from 'zod';
import { NounSchema } from '@/shared/types/vocabulary/schemas/noun';

export const NounFormSchema = NounSchema.omit({
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
  declension_table: true,
});

export type NounFormValues = z.infer<typeof NounFormSchema>;
