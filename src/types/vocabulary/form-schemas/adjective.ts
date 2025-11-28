import { z } from 'zod';
import { AdjectiveSchema } from '@/shared/types/vocabulary/schemas/adjective';

export const AdjectiveFormSchema = AdjectiveSchema.omit({
  part_of_speech: true,
  word: true,
  translation: true,
  definitions: true,
  etymology: true,
  pronunciation: true,
  type: true,
  alternate_form: true,
  createdAt: true,
  updatedAt: true,
  degrees_table: true,
  dictionary_forms: true,
});

export type AdjectiveFormValues = z.infer<typeof AdjectiveFormSchema>;
