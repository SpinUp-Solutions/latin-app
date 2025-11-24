import { z } from 'zod';

export const PartOfSpeechSchema = z.enum([
  'noun',
  'verb',
  'pronoun',
  'adjective',
  'adverb',
  'preposition',
  'conjunction',
  'interjection',
]);

export const WordTypeSchema = z.enum(['core']);

export const PronounTypeSchema = z.enum([
  'personal',
  'reflexive',
  'demonstrative',
  'intensive',
  'relative',
  'interrogative',
  'indefinite',
]);

export const CaseSchema = z.enum([
  'nominative',
  'genitive',
  'dative',
  'accusative',
  'ablative',
  'vocative',
  'locative',
]);

export const GenderSchema = z.enum(['masculine', 'feminine', 'neuter']);

export const NumberSchema = z.enum(['singular', 'plural']);

export const NounDeclensionSchema = z.enum(['1', '2', '3', '3-istem', '4', '5']);

export const AdjectiveDeclensionSchema = z.enum(['1-2', '3']);

export const DegreeSchema = z.enum(['positive', 'comparative', 'superlative']);

export const VerbConjugationSchema = z.enum(['1', '2', '3', '3io', '4']);

export const IndicativeTenseSchema = z.enum([
  'present',
  'imperfect',
  'future',
  'perfect',
  'pluperfect',
  'future_perfect',
]);

export const SubjunctiveTenseSchema = z.enum(['present', 'imperfect', 'perfect', 'pluperfect']);

export const ImperativeTenseSchema = z.enum(['present', 'future']);

export const InfinitiveTenseSchema = z.enum(['present', 'perfect', 'future']);

export const ParticipleTenseSchema = z.enum(['present', 'perfect', 'future']);

export const VoiceSchema = z.enum(['active', 'passive']);

export const PersonSchema = z.enum(['first', 'second', 'third']);

export const GrammaticalNumberSchema = z.enum(['singular', 'plural']);

export const GerundCaseSchema = z.enum(['genitive', 'dative', 'accusative', 'ablative']);

export const SupineCaseSchema = z.enum(['accusative', 'ablative']);

export type PartOfSpeech = z.infer<typeof PartOfSpeechSchema>;
export type WordType = z.infer<typeof WordTypeSchema>;
export type PronounType = z.infer<typeof PronounTypeSchema>;
export type Case = z.infer<typeof CaseSchema>;
export type Gender = z.infer<typeof GenderSchema>;
export type Number = z.infer<typeof NumberSchema>;
export type NounDeclension = z.infer<typeof NounDeclensionSchema>;
export type AdjectiveDeclension = z.infer<typeof AdjectiveDeclensionSchema>;
export type Degree = z.infer<typeof DegreeSchema>;
