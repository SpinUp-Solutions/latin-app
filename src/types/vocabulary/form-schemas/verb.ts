import { z } from 'zod';
import { VerbConjugationSchema } from '../schemas/enums';
import { ConjugationTableSchema } from '../schemas/verb-conjugation';
import { WordFormSchema } from '../schemas/word-form';

export const VerbFormSchema = z.object({
  conjugation: VerbConjugationSchema.nullable().optional(),
  is_deponent: z.boolean().nullable().optional(),
  principal_parts: z.array(WordFormSchema).nullable().optional(),
  conjugation_table: ConjugationTableSchema.nullable().optional(),
});

export type VerbFormValues = z.infer<typeof VerbFormSchema>;
