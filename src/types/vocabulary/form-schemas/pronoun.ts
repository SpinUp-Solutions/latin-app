import { z } from 'zod';
import { PronounSchema } from '../schemas/pronoun';

export const PronounFormSchema = PronounSchema.omit({
  part_of_speech: true,
  word: true,
  translation: true,
  definitions: true,
  etymology: true,
  pronunciation: true,
  type: true,
  alternate_form: true,
  createdAt: true,
  updatedAt: true,
  declension_table: true,
});

export type PronounFormValues = z.infer<typeof PronounFormSchema>;
