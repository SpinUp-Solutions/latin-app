import { z } from 'zod';

export const IndeclinableFormSchema = z.object({});

export type IndeclinableFormValues = z.infer<typeof IndeclinableFormSchema>;
