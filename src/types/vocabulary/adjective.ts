import type { z } from 'zod';
import { AdjectiveSchema } from './schemas/adjective';

export type Adjective = z.infer<typeof AdjectiveSchema>;
