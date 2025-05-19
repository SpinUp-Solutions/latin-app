import { ContentItem } from './lesson';

export interface BaseExercise extends ContentItem {
  instructions: string;
}

export interface MatchingExercise extends BaseExercise {
  type: 'matching';
  data: {
    leftColumn: string[];
    rightColumn: string[];
    answers: Record<string, string>;
  };
}

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

export interface TextSelectionExercise extends BaseExercise {
  type: 'text-selection';
  data: {
    passage: string;
    questions: {
      id: string;
      text: string;
      correctWord: string;
      explanation?: string;
    }[];
  };
}

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

export type Exercise = MatchingExercise | FillExercise | TextSelectionExercise | VerbAnalysisExercise;
