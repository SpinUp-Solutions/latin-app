import { z } from 'zod';
import { PronounSchema } from '@/src/types/vocabulary/schemas/pronoun';

const PronounStructuredOutputBaseSchema = PronounSchema.pick({
  translation: true,
  definitions: true,
  etymology: true,
  pronunciation: true,
  alternate_form: true,
  pronoun_type: true,
  declension_table: true,
});

export const PronounStructuredOutputSchema = PronounStructuredOutputBaseSchema.extend({
  etymology: PronounSchema.shape.etymology.nullable(),
  pronunciation: PronounSchema.shape.pronunciation.nullable(),
  alternate_form: PronounSchema.shape.alternate_form.nullable(),
  pronoun_type: PronounSchema.shape.pronoun_type.nullable(),
}).strict();

export type PronounStructuredOutput = z.infer<typeof PronounStructuredOutputSchema>;
