import { z } from 'zod';
import { CaseSchema, GenderSchema, NumberSchema, NounDeclensionSchema, AdjectiveDeclensionSchema } from './enums';

export const DeclensionNumberFormsSchema = z.object({
  singular: z.array(z.string()).nullable(),
  plural: z.array(z.string()).nullable(),
});

export const GenderFormsSchema = z.object({
  masculine: DeclensionNumberFormsSchema,
  feminine: DeclensionNumberFormsSchema,
  neuter: DeclensionNumberFormsSchema,
});

export const DeclensionTableSchema = z.object({
  nominative: z.object({
    singular: z.array(z.string()).nullable(),
    plural: z.array(z.string()).nullable(),
  }),
  genitive: z.object({
    singular: z.array(z.string()).nullable(),
    plural: z.array(z.string()).nullable(),
  }),
  dative: z.object({
    singular: z.array(z.string()).nullable(),
    plural: z.array(z.string()).nullable(),
  }),
  accusative: z.object({
    singular: z.array(z.string()).nullable(),
    plural: z.array(z.string()).nullable(),
  }),
  ablative: z.object({
    singular: z.array(z.string()).nullable(),
    plural: z.array(z.string()).nullable(),
  }),
  vocative: z.object({
    singular: z.array(z.string()).nullable(),
    plural: z.array(z.string()).nullable(),
  }),
  locative: z.object({
    singular: z.array(z.string()).nullable(),
    plural: z.array(z.string()).nullable(),
  }),
});

export const AdjectiveDeclensionTableSchema = z.object({
  nominative: GenderFormsSchema,
  genitive: GenderFormsSchema,
  dative: GenderFormsSchema,
  accusative: GenderFormsSchema,
  ablative: GenderFormsSchema,
  vocative: GenderFormsSchema,
  locative: GenderFormsSchema,
});

export const DeclensionTableRowSchema = z.object({
  case: CaseSchema,
  singular: z.array(z.string()),
  plural: z.array(z.string()),
});

export const AdjectiveDeclensionTableRowSchema = z.object({
  case: CaseSchema,
  masculine: DeclensionNumberFormsSchema,
  feminine: DeclensionNumberFormsSchema,
  neuter: DeclensionNumberFormsSchema,
});

export { CaseSchema, GenderSchema, NumberSchema, NounDeclensionSchema, AdjectiveDeclensionSchema };
