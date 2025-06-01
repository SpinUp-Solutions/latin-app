import { BaseExercise } from './base';

export interface TextSelectionExercise extends BaseExercise {
  type: 'text-selection';
  data: {
    passage: string;
    questions: {
      id: string;
      text: string;
      correctWord: string;
      explanation?: string;
    }[];
  };
}
