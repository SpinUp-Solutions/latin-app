import { z } from 'zod';
import { PrepositionSchema } from '@/shared/types/vocabulary/schemas/indeclinable-words';

export const PrepositionFormSchema = PrepositionSchema.omit({
  part_of_speech: true,
  word: true,
  translation: true,
  definitions: true,
  etymology: true,
  pronunciation: true,
  type: true,
  alternate_form: true,
  dictionary_entry: true,
  sort_key: true,
  random_index: true,
  createdAt: true,
  updatedAt: true,
});

export type PrepositionFormValues = z.infer<typeof PrepositionFormSchema>;
