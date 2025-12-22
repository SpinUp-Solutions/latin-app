import { z } from 'zod';
import { BaseWordSchema } from './base-word';
import { AdjectiveDeclensionTableSchema, PersonalPronounDeclensionTableSchema } from './declension';
import { PronounTypeSchema, PronounPersonSchema } from './enums';

export const PronounDeclensionTableSchema = z.union([
  PersonalPronounDeclensionTableSchema,
  AdjectiveDeclensionTableSchema,
]);

export const BasePronounSchema = BaseWordSchema.extend({
  part_of_speech: z.literal('pronoun'),
  pronoun_type: PronounTypeSchema,
  person: PronounPersonSchema.nullable(),
  declension_table: PronounDeclensionTableSchema,
});

export const PronounSchema = BasePronounSchema.refine(
  data => {
    if (data.pronoun_type === 'personal') {
      return data.person !== null;
    }
    return data.person === null;
  },
  {
    message: 'Person is required for personal pronouns and must be null for other pronoun types',
    path: ['person'],
  }
);

export type Pronoun = z.infer<typeof PronounSchema>;
export type PronounDeclensionTable = z.infer<typeof PronounDeclensionTableSchema>;
