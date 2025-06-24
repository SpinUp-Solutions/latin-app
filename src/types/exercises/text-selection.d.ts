import { BaseExercise } from './base';

export interface TextSelectionExercise extends BaseExercise {
  type: 'text-selection';
  data: {
    passage: string;
    questions: {
      id: string;
      text: string;
      correctWordIndex: number;
      explanation?: string;
    }[];
  };
}
