import { z } from 'zod';
import { BasePronounSchema } from '@/shared/types/vocabulary/schemas/pronoun';

const BasePronounFormSchema = BasePronounSchema.omit({
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

export const PronounFormSchema = BasePronounFormSchema.refine(
  data => {
    if (data.pronoun_type === 'personal') {
      return data.person !== null;
    }
    return true;
  },
  {
    message: 'Person is required for personal pronouns',
    path: ['person'],
  }
);

export type PronounFormValues = z.infer<typeof PronounFormSchema>;
