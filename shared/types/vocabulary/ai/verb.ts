import { z } from 'zod';
import { VocabularyAIOutputReviewShape } from '../ai-review';
import { VerbSchema } from '../schemas';

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

export const VerbStructuredOutputSchema = VerbStructuredOutputBaseSchema.extend(VocabularyAIOutputReviewShape).strict();

export type VerbStructuredOutput = z.infer<typeof VerbStructuredOutputSchema>;
