import { z } from 'zod';
import { BaseWordSchema } from './base-word';
import { DeclensionTableSchema, GenderSchema, NounDeclensionSchema } from './declension';
import { WordFormSchema } from './word-form';

export const NounSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('noun'),
  gender: GenderSchema.nullable(),
  declension: NounDeclensionSchema.nullable(),
  declension_table: DeclensionTableSchema,
  nominative_singular: WordFormSchema.nullable(),
  genitive_singular: WordFormSchema.nullable(),
});

export type Noun = z.infer<typeof NounSchema>;
