import { BaseExercise } from './base';

export interface SentenceWord {
  id: string;
  text: string;
  index: number;
  startPosition: number;
  endPosition: number;
}

export type DiagramMarkType =
  | 'verb-circle'
  | 'infinitive-double-circle'
  | 'participle-box'
  | 'nominative-underline'
  | 'accusative-double-underline'
  | 'predicate-nominative-squiggle'
  | 'predicate-accusative-double-squiggle'
  | 'genitive-bold'
  | 'shared-italic'
  | 'vocative-v'
  | 'passive'
  | 'compound'
  | 'prepositional-parentheses'
  | 'subordinate-brackets';

export type DiagramToolKey = DiagramMarkType;
export type AnnotationType = DiagramToolKey;

export interface DiagramSelectionMark {
  id: string;
  type: DiagramMarkType;
  startWordIndex: number;
  endWordIndex: number;
}

export interface SentenceDiagrammingSolution {
  marks: DiagramSelectionMark[];
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
    availableStudentTools: DiagramToolKey[];
    hints: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
  };
}
