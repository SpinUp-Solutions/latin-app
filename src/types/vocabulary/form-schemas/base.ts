import { z } from 'zod';
import { BaseWordSchema } from '@/shared/types/vocabulary/schemas/base-word';

export const BaseWordFormSchema = BaseWordSchema.omit({
  part_of_speech: true,
  createdAt: true,
  updatedAt: true,
});

export type BaseWordFormValues = z.infer<typeof BaseWordFormSchema>;
