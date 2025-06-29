import { BaseExercise } from './base';

export interface VerbAnalysisExercise extends BaseExercise {
  type: 'verb-analysis';
  data: {
    passage: string;
    verbs: {
      wordIndex: number; // Index of the verb in the passage
      correctPronoun: string;
      explanation?: string;
      hint?: string;
    }[];
  };
}
