import { BaseWord } from './base-word';
import { AdjectiveDeclensionTable, AdjectiveDeclension } from './declension';
import { PartOfSpeech } from './enums';

export interface Adjective extends BaseWord {
  part_of_speech: PartOfSpeech.Adjective;
  declension?: AdjectiveDeclension;
  adjective_declension_table?: AdjectiveDeclensionTable;
}
