import type { z } from 'zod';
import { BaseWordSchema } from './schemas/base-word';

export type BaseWord = z.infer<typeof BaseWordSchema>;
