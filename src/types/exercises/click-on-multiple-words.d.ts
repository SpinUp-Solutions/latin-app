import { BaseExercise } from './base';

export interface ClickOnMultipleWordsExercise extends BaseExercise {
  type: 'click-on-multiple-words';
  data: {
    title?: string;
    passage: string;
    correctWordIndices: number[];
    instructions?: string;
    hint?: string;
    explanation?: string;
    allowOverSelection?: boolean;
    minimumCorrect?: number;
  };
}