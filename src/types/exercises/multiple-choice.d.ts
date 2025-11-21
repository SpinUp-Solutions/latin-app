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
    hint?: string;
    explanation?: string;
    allowMultipleSelections: boolean;
  };
}
