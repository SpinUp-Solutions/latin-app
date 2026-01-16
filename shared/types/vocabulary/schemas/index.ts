import { z } from 'zod';

export * from './enums';
export * from './declension';
export * from './verb-conjugation';
export * from './word-form';
export * from './base-word';
export * from './noun';
export * from './verb';
export * from './pronoun';
export * from './adjective';
export * from './indeclinable-words';

import { NounSchema } from './noun';
import { VerbSchema } from './verb';
import { BasePronounSchema } from './pronoun';
import { AdjectiveSchema } from './adjective';
import { AdverbSchema, PrepositionSchema, ConjunctionSchema, InterjectionSchema } from './indeclinable-words';

export const VocabularyWordSchema = z.discriminatedUnion('part_of_speech', [
  NounSchema,
  VerbSchema,
  BasePronounSchema,
  AdjectiveSchema,
  AdverbSchema,
  PrepositionSchema,
  ConjunctionSchema,
  InterjectionSchema,
]);

export const VocabularyWordWithIdSchema = z.discriminatedUnion('part_of_speech', [
  NounSchema.extend({ id: z.string() }),
  VerbSchema.extend({ id: z.string() }),
  BasePronounSchema.extend({ id: z.string() }),
  AdjectiveSchema.extend({ id: z.string() }),
  AdverbSchema.extend({ id: z.string() }),
  PrepositionSchema.extend({ id: z.string() }),
  ConjunctionSchema.extend({ id: z.string() }),
  InterjectionSchema.extend({ id: z.string() }),
]);

export type VocabularyWord = z.infer<typeof VocabularyWordSchema>;
export type VocabularyWordWithId = z.infer<typeof VocabularyWordWithIdSchema>;
