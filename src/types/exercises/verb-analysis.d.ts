import { BaseExercise } from './base';

export interface VerbAnalysisExercise extends BaseExercise {
  type: 'verb-analysis';
  data: {
    passage: string;
    verbs: {
      word: string;
      correctPronoun: string;
      explanation?: string;
    }[];
  };
}
