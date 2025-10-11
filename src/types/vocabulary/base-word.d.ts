import { Timestamp } from 'firebase/firestore';
import { PartOfSpeech, WordType } from './enums';

export interface BaseWord {
  word: string;
  part_of_speech: PartOfSpeech;
  translation: string;
  definitions: string[];
  etymology?: string;
  pronunciation?: string;
  type: WordType;
  alternate_form?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
