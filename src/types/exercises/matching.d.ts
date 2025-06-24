import { BaseExercise } from './base';

export interface MatchingExercise extends BaseExercise {
  type: 'matching';
  data: {
    leftColumn: string[];
    rightColumn: string[];
    answers: Record<string, string>;
  };
}
