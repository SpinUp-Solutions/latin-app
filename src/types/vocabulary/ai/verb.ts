import { z } from 'zod';
import { VerbSchema } from '@/src/types/vocabulary/schemas';

const VerbStructuredOutputBaseSchema = VerbSchema.pick({
  translation: true,
  definitions: true,
  etymology: true,
  pronunciation: true,
  alternate_form: true,
  conjugation: true,
  conjugation_table: true,
  principal_parts: true,
  is_deponent: true,
});

export const VerbStructuredOutputSchema = VerbStructuredOutputBaseSchema.strict();

export type VerbStructuredOutput = z.infer<typeof VerbStructuredOutputSchema>;
