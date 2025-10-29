import { z } from 'zod';
import { NounSchema } from '@/src/types/vocabulary/schemas/noun';

const NounStructuredOutputBaseSchema = NounSchema.pick({
  translation: true,
  definitions: true,
  etymology: true,
  pronunciation: true,
  alternate_form: true,
  gender: true,
  declension: true,
  declension_table: true,
  nominative_singular: true,
  genitive_singular: true,
});

export const NounStructuredOutputSchema = NounStructuredOutputBaseSchema.extend({
  etymology: NounSchema.shape.etymology.nullable(),
  pronunciation: NounSchema.shape.pronunciation.nullable(),
  alternate_form: NounSchema.shape.alternate_form.nullable(),
  gender: NounSchema.shape.gender.nullable(),
  declension: NounSchema.shape.declension.nullable(),
  nominative_singular: NounSchema.shape.nominative_singular.nullable(),
  genitive_singular: NounSchema.shape.genitive_singular.nullable(),
  notes: z.string().nullable(),
}).strict();
export type NounStructuredOutput = z.infer<typeof NounStructuredOutputSchema>;
