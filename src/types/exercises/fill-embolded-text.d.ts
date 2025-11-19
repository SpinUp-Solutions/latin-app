import { BaseExercise } from './base';

export interface FillEmboldedTextExercise extends BaseExercise {
  type: 'fill-embolded-text';
  data: {
    passage: string;
    words: {
      wordIndex: number;
      correctAnswer: string;
      question?: string;
      explanation?: string;
      hint?: string;
    }[];
  };
}
