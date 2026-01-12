import { BaseExercise } from './base';

export interface TranslationGradingExercise extends BaseExercise {
  type: 'translation-grading';
  data: {
    items: {
      latinText: string;
      instructions?: string;
    }[];
  };
}
