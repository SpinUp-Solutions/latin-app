import { z } from 'zod';
import { GenderSchema, NounDeclensionSchema } from '../schemas/enums';
import { DeclensionTableSchema } from '../schemas/declension';
import { WordFormSchema } from '../schemas/word-form';

export const NounFormSchema = z.object({
  gender: GenderSchema.nullable().optional(),
  declension: NounDeclensionSchema.nullable().optional(),
  declension_table: DeclensionTableSchema.nullable().optional(),
  nominative_singular: WordFormSchema.nullable().optional(),
  genitive_singular: WordFormSchema.nullable().optional(),
});

export type NounFormValues = z.infer<typeof NounFormSchema>;
