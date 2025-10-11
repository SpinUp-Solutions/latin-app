import { z } from 'zod';
import { BaseWordSchema } from './base-word';
import { AdjectiveDeclensionTableSchema, AdjectiveDeclensionSchema } from './declension';

export const AdjectiveSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('adjective'),
  declension: AdjectiveDeclensionSchema.nullable().optional(),
  adjective_declension_table: AdjectiveDeclensionTableSchema,
});

export type Adjective = z.infer<typeof AdjectiveSchema>;
