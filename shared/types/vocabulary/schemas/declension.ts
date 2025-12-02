import { z } from 'zod';
import { CaseSchema, GenderSchema, NumberSchema, NounDeclensionSchema, AdjectiveDeclensionSchema } from './enums';

export const DeclensionNumberFormsSchema = z.object({
  singular: z.array(z.string().min(1)).min(1).nullable(),
  plural: z.array(z.string().min(1)).min(1).nullable(),
});

export const GenderFormsSchema = z.object({
  masculine: DeclensionNumberFormsSchema,
  feminine: DeclensionNumberFormsSchema,
  neuter: DeclensionNumberFormsSchema,
});

export const DeclensionTableSchema = z.object({
  nominative: z.object({
    singular: z.array(z.string().min(1)).min(1).nullable(),
    plural: z.array(z.string().min(1)).min(1).nullable(),
  }),
  genitive: z.object({
    singular: z.array(z.string().min(1)).min(1).nullable(),
    plural: z.array(z.string().min(1)).min(1).nullable(),
  }),
  dative: z.object({
    singular: z.array(z.string().min(1)).min(1).nullable(),
    plural: z.array(z.string().min(1)).min(1).nullable(),
  }),
  accusative: z.object({
    singular: z.array(z.string().min(1)).min(1).nullable(),
    plural: z.array(z.string().min(1)).min(1).nullable(),
  }),
  ablative: z.object({
    singular: z.array(z.string().min(1)).min(1).nullable(),
    plural: z.array(z.string().min(1)).min(1).nullable(),
  }),
  vocative: z.object({
    singular: z.array(z.string().min(1)).min(1).nullable(),
    plural: z.array(z.string().min(1)).min(1).nullable(),
  }),
  locative: z.object({
    singular: z.array(z.string().min(1)).min(1).nullable(),
    plural: z.array(z.string().min(1)).min(1).nullable(),
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

export type DeclensionNumberForms = z.infer<typeof DeclensionNumberFormsSchema>;
export type GenderForms = z.infer<typeof GenderFormsSchema>;
export type DeclensionTable = z.infer<typeof DeclensionTableSchema>;
export type AdjectiveDeclensionTable = z.infer<typeof AdjectiveDeclensionTableSchema>;
export type DeclensionTableRow = z.infer<typeof DeclensionTableRowSchema>;
export type AdjectiveDeclensionTableRow = z.infer<typeof AdjectiveDeclensionTableRowSchema>;
