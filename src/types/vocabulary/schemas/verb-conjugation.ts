import { z } from 'zod';
import {
  VerbConjugationSchema,
  IndicativeTenseSchema,
  SubjunctiveTenseSchema,
  ImperativeTenseSchema,
  VoiceSchema,
  PersonSchema,
  GrammaticalNumberSchema,
  InfinitiveFormSchema,
  ParticipleFormSchema,
  GerundCaseSchema,
  SupineCaseSchema,
} from './enums';
import { AdjectiveDeclensionTableSchema } from './declension';

export const VerbPersonFormsSchema = z
  .object({
    first: z.array(z.string()).nullable().optional(),
    second: z.array(z.string()).nullable().optional(),
    third: z.array(z.string()).nullable().optional(),
  })
  .nullable()
  .optional();

export const VerbNumberFormsSchema = z
  .object({
    singular: VerbPersonFormsSchema,
    plural: VerbPersonFormsSchema,
  })
  .nullable()
  .optional();

export const IndicativeVoiceSchema = z
  .object({
    present: VerbNumberFormsSchema,
    imperfect: VerbNumberFormsSchema,
    future: VerbNumberFormsSchema,
    perfect: VerbNumberFormsSchema,
    pluperfect: VerbNumberFormsSchema,
    future_perfect: VerbNumberFormsSchema,
  })
  .nullable()
  .optional();

export const SubjunctiveVoiceSchema = z
  .object({
    present: VerbNumberFormsSchema,
    imperfect: VerbNumberFormsSchema,
    perfect: VerbNumberFormsSchema,
    pluperfect: VerbNumberFormsSchema,
  })
  .nullable()
  .optional();

export const PresentImperativeFormsSchema = z
  .object({
    singular: z
      .object({
        second: z.array(z.string()).nullable().optional(),
      })
      .nullable()
      .optional(),
    plural: z
      .object({
        second: z.array(z.string()).nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .nullable()
  .optional();

export const FutureImperativeActiveFormsSchema = z
  .object({
    singular: z
      .object({
        second: z.array(z.string()).nullable().optional(),
        third: z.array(z.string()).nullable().optional(),
      })
      .nullable()
      .optional(),
    plural: z
      .object({
        second: z.array(z.string()).nullable().optional(),
        third: z.array(z.string()).nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .nullable()
  .optional();

export const FutureImperativePassiveFormsSchema = z
  .object({
    singular: z
      .object({
        third: z.array(z.string()).nullable().optional(),
      })
      .nullable()
      .optional(),
    plural: z
      .object({
        third: z.array(z.string()).nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .nullable()
  .optional();

export const ImperativeTableSchema = z
  .object({
    active: z
      .object({
        present: PresentImperativeFormsSchema,
        future: FutureImperativeActiveFormsSchema,
      })
      .nullable()
      .optional(),
    passive: z
      .object({
        present: PresentImperativeFormsSchema,
        future: FutureImperativePassiveFormsSchema,
      })
      .nullable()
      .optional(),
  })
  .nullable()
  .optional();

export const InfinitiveTableSchema = z
  .object({
    active_present: z.array(z.string()).nullable().optional(),
    active_perfect: z.array(z.string()).nullable().optional(),
    active_future: z.array(z.string()).nullable().optional(),
    passive_present: z.array(z.string()).nullable().optional(),
    passive_perfect: z.array(z.string()).nullable().optional(),
    passive_future: z.array(z.string()).nullable().optional(),
  })
  .nullable()
  .optional();

export const ParticipleTableSchema = z
  .object({
    present_active: AdjectiveDeclensionTableSchema,
    perfect_passive: AdjectiveDeclensionTableSchema,
    future_active: AdjectiveDeclensionTableSchema,
    future_passive: AdjectiveDeclensionTableSchema,
  })
  .nullable()
  .optional();

export const GerundTableSchema = z
  .object({
    genitive: z.array(z.string()).nullable().optional(),
    dative: z.array(z.string()).nullable().optional(),
    accusative: z.array(z.string()).nullable().optional(),
    ablative: z.array(z.string()).nullable().optional(),
  })
  .nullable()
  .optional();

export const SupineTableSchema = z
  .object({
    accusative: z.array(z.string()).nullable().optional(),
    ablative: z.array(z.string()).nullable().optional(),
  })
  .nullable()
  .optional();

export const ConjugationTableSchema = z
  .object({
    indicative: z
      .object({
        active: IndicativeVoiceSchema,
        passive: IndicativeVoiceSchema,
      })
      .nullable()
      .optional(),
    subjunctive: z
      .object({
        active: SubjunctiveVoiceSchema,
        passive: SubjunctiveVoiceSchema,
      })
      .nullable()
      .optional(),
    imperative: ImperativeTableSchema,
    nonFinite: z
      .object({
        infinitive: InfinitiveTableSchema,
        participle: ParticipleTableSchema,
      })
      .nullable()
      .optional(),
    gerund: GerundTableSchema,
    supine: SupineTableSchema,
  })
  .nullable()
  .optional();

export {
  VerbConjugationSchema,
  IndicativeTenseSchema,
  SubjunctiveTenseSchema,
  ImperativeTenseSchema,
  VoiceSchema,
  PersonSchema,
  GrammaticalNumberSchema,
  InfinitiveFormSchema,
  ParticipleFormSchema,
  GerundCaseSchema,
  SupineCaseSchema,
};
