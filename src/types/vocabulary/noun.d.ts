import { BaseWord } from './base-word';
import { DeclensionTable, Gender, NounDeclension } from './declension';
import { PartOfSpeech } from './enums';
import { WordForm } from './word-form';

export interface Noun extends BaseWord {
  part_of_speech: PartOfSpeech.Noun;
  gender?: Gender;
  declension: NounDeclension;
  declension_table?: DeclensionTable;
  nominative_singular?: WordForm;
  genitive_singular?: WordForm;
}
