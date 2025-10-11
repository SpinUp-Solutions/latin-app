import { BaseWord } from './base-word';
import { ConjugationTable, VerbConjugation } from './verb-conjugation';
import { PartOfSpeech } from './enums';
import { WordForm } from './word-form';

export interface Verb extends BaseWord {
  part_of_speech: PartOfSpeech.Verb;
  conjugation: VerbConjugation;
  conjugation_table?: ConjugationTable;
  principal_parts?: WordForm[];
  is_deponent?: boolean;
}
