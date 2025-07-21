import { BaseExercise } from './base';

export interface SentenceWord {
  id: string;
  text: string;
  index: number;
  startPosition: number;
  endPosition: number;
}

export type AnnotationType =
  | 'preposition'
  | 'subordination'
  | 'verb-circle'
  | 'subject-underline'
  | 'direct-object-underline'
  | 'indirect-object-bracket'
  | 'genitive-arrow'
  | 'ablative-phrase';

export interface SentenceDiagrammingSolution {
  annotations: Record<string, AnnotationType>;
}

export interface SentenceDiagrammingExercise extends BaseExercise {
  type: 'sentence-diagramming';
  data: {
    sentence: {
      latin: string;
      translation: string;
      words: SentenceWord[];
      content?: string;
    };
    solution: SentenceDiagrammingSolution;
    hints: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
  };
}
