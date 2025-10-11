import { BaseWord } from './base-word';
import { DeclensionTable } from './declension';
import { PartOfSpeech, PronounType } from './enums';

export interface Pronoun extends BaseWord {
  part_of_speech: PartOfSpeech.Pronoun;
  pronoun_type: PronounType;
  declension_table?: DeclensionTable;
}
