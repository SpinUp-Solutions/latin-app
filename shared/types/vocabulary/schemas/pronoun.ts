import { z } from 'zod';
import { BaseWordSchema } from './base-word';
import { DeclensionTableSchema } from './declension';
import { PronounTypeSchema } from './enums';

export const PronounSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('pronoun'),
  pronoun_type: PronounTypeSchema.nullable(),
  declension_table: DeclensionTableSchema,
});

export type Pronoun = z.infer<typeof PronounSchema>;
