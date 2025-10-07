import { BaseExercise } from './base';

export interface OddOneOutItem {
  id: string;
  text: string;
  isOddOneOut: boolean;
}

export interface OddOneOutExercise extends BaseExercise {
  type: 'odd-one-out';
  data: {
    question: string;
    items: OddOneOutItem[];
    hint?: string; // Optional hint shown on incorrect answers
    explanation?: string;
    requireExplanation?: boolean; // Whether student must provide their own explanation
  };
}
