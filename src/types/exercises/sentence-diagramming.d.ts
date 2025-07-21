import { BaseExercise } from './base';
import { TooltipData } from '../tooltip';

export interface SentenceWord {
  id: string;
  text: string;
  index: number;
  startPosition: number;
  endPosition: number;
  tooltipData?: TooltipData;
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

export interface BaseAnnotation {
  id: string;
  type: AnnotationType;
  wordIds: string[];
  timestamp: number;
}

export interface PrepositionAnnotation extends BaseAnnotation {
  type: 'preposition';
  wordIds: [string];
}

export interface SubordinationAnnotation extends BaseAnnotation {
  type: 'subordination';
  wordIds: string[];
  clauseType: 'relative' | 'temporal' | 'causal' | 'purpose' | 'result';
}

export interface VerbCircleAnnotation extends BaseAnnotation {
  type: 'verb-circle';
  wordIds: [string];
  voice: 'active' | 'passive';
  expectsDirectObject: boolean;
  expectsAgent: boolean;
}

export interface SubjectUnderlineAnnotation extends BaseAnnotation {
  type: 'subject-underline';
  wordIds: string[];
  person: '1st' | '2nd' | '3rd';
  number: 'singular' | 'plural';
}

export interface DirectObjectUnderlineAnnotation extends BaseAnnotation {
  type: 'direct-object-underline';
  wordIds: string[];
}

export interface IndirectObjectBracketAnnotation extends BaseAnnotation {
  type: 'indirect-object-bracket';
  wordIds: string[];
}

export interface GenitiveArrowAnnotation extends BaseAnnotation {
  type: 'genitive-arrow';
  genitiveWordId: string;
  modifiedWordId: string;
  wordIds: [string, string];
  relationshipType: 'possession' | 'description' | 'partitive';
}

export interface AblativePhraseAnnotation extends BaseAnnotation {
  type: 'ablative-phrase';
  wordIds: string[];
  ablativeType: 'agent' | 'means' | 'manner' | 'place' | 'time' | 'accompaniment' | 'separation';
  hasPreposition: boolean;
}

export type UserAnnotation =
  | PrepositionAnnotation
  | SubordinationAnnotation
  | VerbCircleAnnotation
  | SubjectUnderlineAnnotation
  | DirectObjectUnderlineAnnotation
  | IndirectObjectBracketAnnotation
  | GenitiveArrowAnnotation
  | AblativePhraseAnnotation;

export interface SentenceDiagrammingSolution {
  words: SentenceWord[];
  annotations: Record<string, AnnotationType>;
  explanations: {
    [wordId: string]: string;
  };
}

export interface StepValidationResult {
  stepComplete: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  feedback: FeedbackMessage[];
}

export interface ValidationError {
  type: 'missing' | 'incorrect' | 'extra';
  message: string;
  wordIds: string[];
  expectedAnnotation?: UserAnnotation;
  actualAnnotation?: UserAnnotation;
}

export interface ValidationWarning {
  type: 'suggestion' | 'alternative';
  message: string;
  wordIds: string[];
}

export interface FeedbackMessage {
  type: 'success' | 'error' | 'hint';
  message: string;
  wordIds: string[];
  showAnswer?: boolean;
}

export interface DiagrammingProgress {
  totalTimeSpent: number;
  annotations: UserAnnotation[];
  hintsUsed: number;
  attempts: number;
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

export interface DiagrammingEditorConfig {
  showHints: boolean;
  showValidation: boolean;
  allowAllAnnotations: boolean;
}

export interface TipTapAnnotationData {
  type: AnnotationType;
  wordIds: string[];
  attributes: Record<string, any>;
}

export interface TipTapDocumentState {
  content: any;
  annotations: TipTapAnnotationData[];
  lastModified: number;
}
