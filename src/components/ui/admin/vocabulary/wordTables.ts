import type { z } from 'zod';
import { DeclensionTableSchema, AdjectiveDeclensionTableSchema } from '@/shared/types/vocabulary/schemas/declension';
import type { PronounType, PronounPerson } from '@/shared/types/vocabulary/schemas/enums';
import { ConjugationTableSchema } from '@/shared/types/vocabulary/schemas/verb-conjugation';
import { DegreesTableSchema } from '@/shared/types/vocabulary/schemas/adjective';

export type EditableTable = { field: string; tableType: string; title: string; color: string; schema: z.ZodTypeAny };

/** The one inflection table each part of speech edits; pronoun schema and title depend on type and person. */
const EDITABLE_TABLES: Partial<Record<string, EditableTable>> = {
  noun: {
    field: 'declension_table',
    tableType: 'declension',
    title: 'Declension Table',
    color: 'text-blue-700',
    schema: DeclensionTableSchema,
  },
  pronoun: {
    field: 'declension_table',
    tableType: 'declension',
    title: 'Pronoun Declension Table',
    color: 'text-indigo-700',
    schema: AdjectiveDeclensionTableSchema,
  },
  adjective: {
    field: 'degrees_table',
    tableType: 'adjective-declension',
    title: 'Degrees of Comparison',
    color: 'text-purple-700',
    schema: DegreesTableSchema,
  },
  verb: {
    field: 'conjugation_table',
    tableType: 'conjugation',
    title: 'Conjugation Table',
    color: 'text-green-700',
    schema: ConjugationTableSchema,
  },
};

export const getEditableTable = (word: { part_of_speech: string } | null) =>
  word ? EDITABLE_TABLES[word.part_of_speech] : undefined;

export { getPronounTableSchema } from '@/shared/types/vocabulary/schemas/pronoun';

export const getPronounTableTitle = (pronounType: PronounType | null, person: PronounPerson | null): string => {
  if (!pronounType) return 'Pronoun Declension Table';

  if (pronounType === 'personal' && person) {
    return `${person} Person Personal Pronoun Declension Table`;
  }

  const typeLabels: Record<PronounType, string> = {
    personal: 'Personal',
    reflexive: 'Reflexive',
    demonstrative: 'Demonstrative',
    intensive: 'Intensive',
    relative: 'Relative',
    interrogative: 'Interrogative',
    indefinite: 'Indefinite',
    possessive: 'Possessive',
  };
  return `${typeLabels[pronounType]} Pronoun Declension Table`;
};
