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
  'possessive',
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

export const VoiceSchema = z.enum(['active', 'passive']);

export const PersonSchema = z.enum(['first', 'second', 'third']);

export const GrammaticalNumberSchema = z.enum(['singular', 'plural']);

export const InfinitiveFormSchema = z.enum([
  'active_present',
  'active_perfect',
  'active_future',
  'passive_present',
  'passive_perfect',
  'passive_future',
]);

export const ParticipleFormSchema = z.enum(['present_active', 'perfect_passive', 'future_active', 'future_passive']);

export const GerundCaseSchema = z.enum(['genitive', 'dative', 'accusative', 'ablative']);

export const SupineCaseSchema = z.enum(['accusative', 'ablative']);
