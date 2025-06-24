import { BaseExercise } from './base';

export interface FillExercise extends BaseExercise {
  type: 'fill';
  data: {
    items: {
      text: string;
      answer: string;
      hint?: string;
    }[];
  };
}
