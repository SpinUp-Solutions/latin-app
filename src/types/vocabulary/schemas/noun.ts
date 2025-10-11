import { z } from 'zod';
import { BaseWordSchema } from './base-word';
import { DeclensionTableSchema, GenderSchema, NounDeclensionSchema } from './declension';
import { WordFormSchema } from './word-form';

export const NounSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('noun'),
  gender: GenderSchema.nullable().optional(),
  declension: NounDeclensionSchema,
  declension_table: DeclensionTableSchema,
  nominative_singular: WordFormSchema.nullable().optional(),
  genitive_singular: WordFormSchema.nullable().optional(),
});

export type Noun = z.infer<typeof NounSchema>;
