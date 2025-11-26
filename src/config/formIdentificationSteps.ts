import type { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import type { FormIdentificationStep } from '@/src/types/exercises/schemas/form-identification';

export const AVAILABLE_STEPS: Readonly<Record<PartOfSpeech, readonly FormIdentificationStep[]>> = {
  verb: ['conjugation', 'tense', 'voice', 'mood', 'person', 'number'],
  noun: ['declension', 'case', 'number', 'gender'],
  adjective: ['declension', 'degree', 'gender', 'number', 'case'],
  pronoun: ['gender', 'number', 'case'],
  adverb: ['degree'],
  preposition: [],
  conjunction: [],
  interjection: [],
} as const;

export const getStepsForPOS = (pos: PartOfSpeech): readonly FormIdentificationStep[] => AVAILABLE_STEPS[pos] || [];
