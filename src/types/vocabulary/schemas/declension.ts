import { z } from 'zod';
import { CaseSchema, GenderSchema, NumberSchema, NounDeclensionSchema, AdjectiveDeclensionSchema } from './enums';

export const DeclensionNumberFormsSchema = z
  .object({
    singular: z.array(z.string()),
    plural: z.array(z.string()),
  })
  .nullable()
  .optional();

export const GenderFormsSchema = z
  .object({
    masculine: DeclensionNumberFormsSchema,
    feminine: DeclensionNumberFormsSchema,
    neuter: DeclensionNumberFormsSchema,
  })
  .nullable()
  .optional();

export const DeclensionTableSchema = z
  .object({
    nominative: z
      .object({
        singular: z.array(z.string()),
        plural: z.array(z.string()),
      })
      .nullable()
      .optional(),
    genitive: z
      .object({
        singular: z.array(z.string()),
        plural: z.array(z.string()),
      })
      .nullable()
      .optional(),
    dative: z
      .object({
        singular: z.array(z.string()),
        plural: z.array(z.string()),
      })
      .nullable()
      .optional(),
    accusative: z
      .object({
        singular: z.array(z.string()),
        plural: z.array(z.string()),
      })
      .nullable()
      .optional(),
    ablative: z
      .object({
        singular: z.array(z.string()),
        plural: z.array(z.string()),
      })
      .nullable()
      .optional(),
    vocative: z
      .object({
        singular: z.array(z.string()),
        plural: z.array(z.string()),
      })
      .nullable()
      .optional(),
    locative: z
      .object({
        singular: z.array(z.string()),
        plural: z.array(z.string()),
      })
      .nullable()
      .optional(),
  })
  .nullable()
  .optional();

export const AdjectiveDeclensionTableSchema = z
  .object({
    nominative: GenderFormsSchema,
    genitive: GenderFormsSchema,
    dative: GenderFormsSchema,
    accusative: GenderFormsSchema,
    ablative: GenderFormsSchema,
    vocative: GenderFormsSchema,
    locative: GenderFormsSchema,
  })
  .nullable()
  .optional();

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
