import { z } from 'zod';
import { PronounSchema } from '@/shared/types/vocabulary/schemas/pronoun';

export const PronounFormSchema = PronounSchema.omit({
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

export type PronounFormValues = z.infer<typeof PronounFormSchema>;
