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
    explanation?: string;
    requireExplanation?: boolean; // Whether student must provide their own explanation
  };
}
