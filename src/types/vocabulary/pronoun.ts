import type { z } from 'zod';
import { PronounSchema } from './schemas/pronoun';

export type Pronoun = z.infer<typeof PronounSchema>;
