import { z } from 'zod';
import {
  VerbConjugationSchema,
  IndicativeTenseSchema,
  SubjunctiveTenseSchema,
  ImperativeTenseSchema,
  InfinitiveTenseSchema,
  ParticipleTenseSchema,
  VoiceSchema,
  PersonSchema,
  GrammaticalNumberSchema,
  GerundCaseSchema,
  SupineCaseSchema,
} from './enums';
import { AdjectiveDeclensionTableSchema } from './declension';

export const VerbPersonFormsSchema = z.object({
  first: z.array(z.string().min(1)).min(1).nullable(),
  second: z.array(z.string().min(1)).min(1).nullable(),
  third: z.array(z.string().min(1)).min(1).nullable(),
});

export const VerbNumberFormsSchema = z.object({
  singular: VerbPersonFormsSchema,
  plural: VerbPersonFormsSchema,
});

export const IndicativeVoiceSchema = z.object({
  present: VerbNumberFormsSchema,
  imperfect: VerbNumberFormsSchema,
  future: VerbNumberFormsSchema,
  perfect: VerbNumberFormsSchema,
  pluperfect: VerbNumberFormsSchema,
  future_perfect: VerbNumberFormsSchema,
});

export const SubjunctiveVoiceSchema = z.object({
  present: VerbNumberFormsSchema,
  imperfect: VerbNumberFormsSchema,
  perfect: VerbNumberFormsSchema,
  pluperfect: VerbNumberFormsSchema,
});

export const PresentImperativeFormsSchema = z.object({
  singular: z.object({
    second: z.array(z.string().min(1)).min(1).nullable(),
  }),
  plural: z.object({
    second: z.array(z.string().min(1)).min(1).nullable(),
  }),
});

export const FutureImperativeActiveFormsSchema = z.object({
  singular: z.object({
    second: z.array(z.string().min(1)).min(1).nullable(),
    third: z.array(z.string().min(1)).min(1).nullable(),
  }),
  plural: z.object({
    second: z.array(z.string().min(1)).min(1).nullable(),
    third: z.array(z.string().min(1)).min(1).nullable(),
  }),
});

export const FutureImperativePassiveFormsSchema = z.object({
  singular: z.object({
    third: z.array(z.string().min(1)).min(1).nullable(),
  }),
  plural: z.object({
    third: z.array(z.string().min(1)).min(1).nullable(),
  }),
});

export const ImperativeTableSchema = z.object({
  active: z.object({
    present: PresentImperativeFormsSchema,
    future: FutureImperativeActiveFormsSchema,
  }),
  passive: z.object({
    present: PresentImperativeFormsSchema,
    future: FutureImperativePassiveFormsSchema,
  }),
});

export const InfinitiveVoiceSchema = z.object({
  active: z.array(z.string().min(1)).min(1).nullable(),
  passive: z.array(z.string().min(1)).min(1).nullable(),
});

export const InfinitiveTableSchema = z.object({
  present: InfinitiveVoiceSchema,
  perfect: InfinitiveVoiceSchema,
  future: InfinitiveVoiceSchema,
});

export const ParticipleTableSchema = z.object({
  present: z.object({
    active: AdjectiveDeclensionTableSchema.nullable(),
  }),
  perfect: z.object({
    passive: AdjectiveDeclensionTableSchema.nullable(),
  }),
  future: z.object({
    active: AdjectiveDeclensionTableSchema.nullable(),
    passive: AdjectiveDeclensionTableSchema.nullable(),
  }),
});

export const GerundTableSchema = z.object({
  genitive: z.array(z.string().min(1)).min(1).nullable(),
  dative: z.array(z.string().min(1)).min(1).nullable(),
  accusative: z.array(z.string().min(1)).min(1).nullable(),
  ablative: z.array(z.string().min(1)).min(1).nullable(),
});

export const SupineTableSchema = z.object({
  accusative: z.array(z.string().min(1)).min(1).nullable(),
  ablative: z.array(z.string().min(1)).min(1).nullable(),
});

export const ConjugationTableSchema = z.object({
  indicative: z.object({
    active: IndicativeVoiceSchema,
    passive: IndicativeVoiceSchema,
  }),
  subjunctive: z.object({
    active: SubjunctiveVoiceSchema,
    passive: SubjunctiveVoiceSchema,
  }),
  imperative: ImperativeTableSchema,
  nonFinite: z.object({
    infinitive: InfinitiveTableSchema,
    participle: ParticipleTableSchema,
  }),
  gerund: GerundTableSchema,
  supine: SupineTableSchema,
});

export {
  VerbConjugationSchema,
  IndicativeTenseSchema,
  SubjunctiveTenseSchema,
  ImperativeTenseSchema,
  InfinitiveTenseSchema,
  ParticipleTenseSchema,
  VoiceSchema,
  PersonSchema,
  GrammaticalNumberSchema,
  GerundCaseSchema,
  SupineCaseSchema,
};

export type VerbConjugation = z.infer<typeof VerbConjugationSchema>;
export type IndicativeTense = z.infer<typeof IndicativeTenseSchema>;
export type SubjunctiveTense = z.infer<typeof SubjunctiveTenseSchema>;
export type ImperativeTense = z.infer<typeof ImperativeTenseSchema>;
export type InfinitiveTense = z.infer<typeof InfinitiveTenseSchema>;
export type ParticipleTense = z.infer<typeof ParticipleTenseSchema>;
export type Voice = z.infer<typeof VoiceSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type GrammaticalNumber = z.infer<typeof GrammaticalNumberSchema>;
export type GerundCase = z.infer<typeof GerundCaseSchema>;
export type SupineCase = z.infer<typeof SupineCaseSchema>;

export type ConjugationTable = z.infer<typeof ConjugationTableSchema>;
export type InfinitiveTable = z.infer<typeof InfinitiveTableSchema>;
export type ParticipleTable = z.infer<typeof ParticipleTableSchema>;
