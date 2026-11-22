import { z } from 'zod';
import { BaseWordSchema } from './base-word';
import { AdjectiveDeclensionTableSchema, PersonalPronounDeclensionTableSchema } from './declension';
import { PronounTypeSchema, PronounPersonSchema } from './enums';

/** First- and second-person personal pronouns have no gender columns. */
export const getPronounTableSchema = (type: unknown, person: unknown) =>
  type === 'personal' && (person === '1st' || person === '2nd')
    ? PersonalPronounDeclensionTableSchema
    : AdjectiveDeclensionTableSchema;

/** A partial AI reply must not implicitly replace the editor's existing table with an empty one. */
export function pronounProposalError(existing: Record<string, unknown>, changes: Record<string, unknown>) {
  const next = { ...existing, ...changes };
  const schema = getPronounTableSchema(next.pronoun_type, next.person);
  const replacesShape =
    existing.declension_table != null && schema !== getPronounTableSchema(existing.pronoun_type, existing.person);
  if (
    (replacesShape || ('declension_table' in changes && next.pronoun_type != null)) &&
    !schema.safeParse(changes.declension_table).success
  ) {
    return 'Ask for the person and its matching declension table together. No changes were applied.';
  }
  return null;
}

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
