import { z } from 'zod';
import { BaseWordSchema } from './base-word';
import { AdjectiveDeclensionTableSchema, AdjectiveDeclensionSchema } from './declension';
import { WordFormSchema } from './word-form';

export const DegreesTableSchema = z.object({
  positive: AdjectiveDeclensionTableSchema,
  comparative: AdjectiveDeclensionTableSchema,
  superlative: AdjectiveDeclensionTableSchema,
});

export const AdjectiveSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('adjective'),
  declension: AdjectiveDeclensionSchema.nullable(),
  dictionary_forms: z.array(WordFormSchema).nullable(),
  degrees_table: DegreesTableSchema,
});

export type Adjective = z.infer<typeof AdjectiveSchema>;
