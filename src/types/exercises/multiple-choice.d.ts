import { BaseExercise } from './base';

export interface MultipleChoiceOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface MultipleChoiceExercise extends BaseExercise {
  type: 'multiple-choice';
  data: {
    question: string;
    options: MultipleChoiceOption[];
    hint?: string; // Optional hint shown on incorrect answers
    explanation?: string; // Optional explanation shown after correct answer
  };
}
