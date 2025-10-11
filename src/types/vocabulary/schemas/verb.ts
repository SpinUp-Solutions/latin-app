import { z } from 'zod';
import { BaseWordSchema } from './base-word';
import { ConjugationTableSchema, VerbConjugationSchema } from './verb-conjugation';
import { WordFormSchema } from './word-form';

export const VerbSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('verb'),
  conjugation: VerbConjugationSchema,
  conjugation_table: ConjugationTableSchema,
  principal_parts: z.array(WordFormSchema).nullable().optional(),
  is_deponent: z.boolean().nullable().optional(),
});

export type Verb = z.infer<typeof VerbSchema>;
