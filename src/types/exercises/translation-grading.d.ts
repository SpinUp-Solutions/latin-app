import { BaseExercise } from './base';

export interface TranslationGradingExercise extends BaseExercise {
  type: 'translation-grading';
  translationDirection?: 'latin-to-english' | 'english-to-latin';
  data: {
    items: {
      latinText: string;
      instructions?: string;
    }[];
  };
}
