import { BaseExercise } from './base';
import type {
  AnnotationKind,
  DiagramAnnotation,
  DiagramDifficulty,
  DiagramSpan,
  DiagramToken,
  SentenceDiagramDocument,
} from '@/src/features/sentence-diagramming';

export type SentenceWord = DiagramToken;
export type DiagramMarkType = AnnotationKind;
export type DiagramToolKey = AnnotationKind;
export type AnnotationType = AnnotationKind;
export type DiagramSelectionMark = DiagramAnnotation;
export type SentenceDiagrammingSolution = DiagramAnnotation[];
export type SentenceDiagramSpan = DiagramSpan;
export type SentenceDiagrammingDifficulty = DiagramDifficulty;

export interface SentenceDiagrammingExercise extends BaseExercise {
  type: 'sentence-diagramming';
  data: SentenceDiagramDocument;
}
