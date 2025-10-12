import { z } from 'zod';
import { NounSchema } from '../schemas/noun';

export const NounFormSchema = NounSchema.omit({
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

export type NounFormValues = z.infer<typeof NounFormSchema>;
