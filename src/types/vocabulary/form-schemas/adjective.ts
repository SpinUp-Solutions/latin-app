import { z } from 'zod';
import { AdjectiveDeclensionSchema } from '../schemas/enums';
import { AdjectiveDeclensionTableSchema } from '../schemas/declension';

export const AdjectiveFormSchema = z.object({
  declension: AdjectiveDeclensionSchema.nullable().optional(),
  adjective_declension_table: AdjectiveDeclensionTableSchema.nullable().optional(),
});

export type AdjectiveFormValues = z.infer<typeof AdjectiveFormSchema>;
