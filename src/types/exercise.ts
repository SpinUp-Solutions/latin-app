import { ContentItem } from './lesson';

// Base exercise structure extending ContentItem
export interface BaseExercise extends ContentItem {
  instructions: string;
}

// Matching exercise type
export interface MatchingExercise extends BaseExercise {
  type: 'matching';
  data: {
    leftColumn: string[];
    rightColumn: string[];
    answers: Record<string, string>;
  };
}

// Fill-in-the-blank exercise
export interface FillExercise extends BaseExercise {
  type: 'fill';
  data: {
    text: string;
    blanks: Record<string, string>;
  };
}

// Union type for all exercises
export type Exercise = MatchingExercise | FillExercise;
