import { z } from 'zod';
import { WordTypeSchema } from '@/shared/types/vocabulary/schemas/enums';

const emptyToNull = z.preprocess(
  val => (typeof val === 'string' && val.trim() === '' ? null : val),
  z.string().min(1).nullable()
);

export const BaseWordFormSchema = z.object({
  word: z.string().min(1),
  translation: z.string().min(1),
  definitions: z.array(z.string()),
  etymology: emptyToNull,
  pronunciation: emptyToNull,
  type: WordTypeSchema,
  alternate_form: z.preprocess(
    val => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().nullable()
  ),
  dictionary_entry: z.preprocess(
    val => (typeof val === 'string' && val.trim() === '' ? null : val),
    z.string().nullable()
  ),
  sort_key: z.string(),
  random_index: z.number().min(0).max(1),
});

export type BaseWordFormValues = z.infer<typeof BaseWordFormSchema>;
