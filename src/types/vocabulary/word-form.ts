import type { z } from 'zod';
import { WordFormSchema } from './schemas/word-form';

export type WordForm = z.infer<typeof WordFormSchema>;
