import { z } from 'zod';
import { AdjectiveSchema } from '../schemas/adjective';

const AdjectiveStructuredOutputBaseSchema = AdjectiveSchema.pick({
  translation: true,
  definitions: true,
  etymology: true,
  pronunciation: true,
  alternate_form: true,
  declension: true,
  dictionary_forms: true,
  degrees_table: true,
});

export const AdjectiveStructuredOutputSchema = AdjectiveStructuredOutputBaseSchema.extend({
  etymology: AdjectiveSchema.shape.etymology.nullable(),
  pronunciation: AdjectiveSchema.shape.pronunciation.nullable(),
  alternate_form: AdjectiveSchema.shape.alternate_form.nullable(),
  declension: AdjectiveSchema.shape.declension.nullable(),
  dictionary_forms: AdjectiveSchema.shape.dictionary_forms.nullable(),
}).strict();
export type AdjectiveStructuredOutput = z.infer<typeof AdjectiveStructuredOutputSchema>;
