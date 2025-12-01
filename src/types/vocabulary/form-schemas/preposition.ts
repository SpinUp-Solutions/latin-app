import { z } from 'zod';
import { PrepositionCaseSchema } from '@/shared/types/vocabulary/schemas/enums';

export const PrepositionFormSchema = z.object({
  case: PrepositionCaseSchema,
});

export type PrepositionFormValues = z.infer<typeof PrepositionFormSchema>;
