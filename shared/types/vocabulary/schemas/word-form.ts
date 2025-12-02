import { z } from 'zod';

export const WordFormSchema = z.object({
  full_form: z.string(),
  shortened_form: z.string(),
});

export type WordForm = z.infer<typeof WordFormSchema>;
