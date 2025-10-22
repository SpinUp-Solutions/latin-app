import { z } from 'zod';
import { VerbSchema } from '../schemas/verb';

export const VerbFormSchema = VerbSchema.omit({
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
  conjugation_table: true,
});

export type VerbFormValues = z.infer<typeof VerbFormSchema>;
