import type { z } from 'zod';
import { AdverbSchema, PrepositionSchema, ConjunctionSchema, InterjectionSchema } from './schemas/indeclinable-words';

export type Adverb = z.infer<typeof AdverbSchema>;
export type Preposition = z.infer<typeof PrepositionSchema>;
export type Conjunction = z.infer<typeof ConjunctionSchema>;
export type Interjection = z.infer<typeof InterjectionSchema>;
