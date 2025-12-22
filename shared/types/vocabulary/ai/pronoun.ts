import { z } from 'zod';
import { BasePronounSchema } from '../schemas/pronoun';

const PronounStructuredOutputBaseSchema = BasePronounSchema.pick({
  translation: true,
  definitions: true,
  etymology: true,
  pronunciation: true,
  alternate_form: true,
  pronoun_type: true,
  person: true,
  declension_table: true,
});

export const PronounStructuredOutputSchema = PronounStructuredOutputBaseSchema.extend({
  etymology: BasePronounSchema.shape.etymology.nullable(),
  pronunciation: BasePronounSchema.shape.pronunciation.nullable(),
  alternate_form: BasePronounSchema.shape.alternate_form.nullable(),
  person: BasePronounSchema.shape.person.nullable(),
}).strict();

export type PronounStructuredOutput = z.infer<typeof PronounStructuredOutputSchema>;
