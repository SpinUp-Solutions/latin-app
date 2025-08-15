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
    hint?: string; // Optional hint shown on incorrect matches
  };
}
