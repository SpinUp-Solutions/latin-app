import type { z } from 'zod';
import { VerbSchema } from './schemas/verb';

export type Verb = z.infer<typeof VerbSchema>;
