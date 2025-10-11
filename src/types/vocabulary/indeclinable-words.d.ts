import { BaseWord } from './base-word';
import { PartOfSpeech } from './enums';

export interface Adverb extends BaseWord {
  part_of_speech: PartOfSpeech.Adverb;
}

export interface Preposition extends BaseWord {
  part_of_speech: PartOfSpeech.Preposition;
}

export interface Conjunction extends BaseWord {
  part_of_speech: PartOfSpeech.Conjunction;
}

export interface Interjection extends BaseWord {
  part_of_speech: PartOfSpeech.Interjection;
}
