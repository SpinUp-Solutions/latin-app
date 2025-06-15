import { BaseExercise } from './base';

export interface VerbConjugationExercise extends BaseExercise {
  type: 'verb-conjugation';
  data: {
    passage: {
      latin: string;
      translation: string;
      specialVocab?: Record<string, string>;
      boldWords?: string[];
    };
    conjugationTask?: {
      instructions: string;
      answer: string;
    };
    livingLatinPractice?: {
      examples: {
        latin: string;
        translation: string;
      }[];
      exercises: {
        english: string;
        answer: string;
      }[];
    };
  };
}
