import { z } from 'zod';
import { PronounTypeSchema } from '../schemas/enums';
import { DeclensionTableSchema } from '../schemas/declension';

export const PronounFormSchema = z.object({
  pronoun_type: PronounTypeSchema.nullable().optional(),
  declension_table: DeclensionTableSchema.nullable().optional(),
});

export type PronounFormValues = z.infer<typeof PronounFormSchema>;
