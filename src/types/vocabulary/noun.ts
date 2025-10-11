import type { z } from 'zod';
import { NounSchema } from './schemas/noun';

export type Noun = z.infer<typeof NounSchema>;
