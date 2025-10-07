import { BaseExercise } from './base';

export interface FillEmboldedTextExercise extends BaseExercise {
  type: 'fill-embolded-text';
  data: {
    passage: string;
    verbs: {
      wordIndex: number;
      correctPronoun: string;
      explanation?: string;
      hint?: string;
    }[];
  };
}
