import { z } from 'zod';
import { BaseWordSchema } from './base-word';
import { PrepositionCaseSchema } from './enums';

export const AdverbSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('adverb'),
});

export const PrepositionSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('preposition'),
  case: PrepositionCaseSchema.optional(),
});

export const ConjunctionSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('conjunction'),
});

export const InterjectionSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('interjection'),
});

export type Adverb = z.infer<typeof AdverbSchema>;
export type Preposition = z.infer<typeof PrepositionSchema>;
export type Conjunction = z.infer<typeof ConjunctionSchema>;
export type Interjection = z.infer<typeof InterjectionSchema>;
