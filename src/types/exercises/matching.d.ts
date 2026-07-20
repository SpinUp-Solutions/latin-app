import { BaseExercise } from './base';

export interface MatchingItem {
  id: string;
  value: string;
}

export interface MatchingExercise extends BaseExercise {
  type: 'matching';
  data: {
    leftColumn: MatchingItem[];
    rightColumn: MatchingItem[];
    answers: Record<string, string>; // leftId -> rightId
    /** Public completion count used when test delivery strips the answer map. */
    expectedMatchCount?: number;
    hint?: string; // Optional hint shown on incorrect matches
    requiredRepetitions?: number; // Number of rounds students must complete (default: 1)
  };
}
