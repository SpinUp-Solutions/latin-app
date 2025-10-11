import { z } from 'zod';
import { WordTypeSchema } from '../schemas/enums';

export const BaseWordFormSchema = z.object({
  word: z.string().min(1),
  translation: z.string().min(1),
  definitions: z.array(z.string()),
  etymology: z.string().nullable().optional(),
  pronunciation: z.string().nullable().optional(),
  type: WordTypeSchema,
  alternate_form: z.string().nullable().optional(),
});

export type BaseWordFormValues = z.infer<typeof BaseWordFormSchema>;
