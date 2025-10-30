import { z } from 'zod';

export const WordFormSchema = z.object({
  full_form: z.string().min(1),
  shortened_form: z.string().min(1),
});

export type WordForm = z.infer<typeof WordFormSchema>;
