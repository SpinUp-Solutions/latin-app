export type { BaseExercise } from './base';
export type { MatchingExercise } from './matching';
export type { FillExercise } from './fill';
export type { TextSelectionExercise } from './text-selection';
export type { VerbAnalysisExercise } from './verb-analysis';
export type { VerbConjugationExercise } from './verb-conjugation';
export type { SentenceDiagrammingExercise } from './sentence-diagramming';
export type { MultipleChoiceExercise } from './multiple-choice';
export type { OddOneOutExercise } from './odd-one-out';
export type { TableFillExercise } from './table-fill';

import type { MatchingExercise } from './matching';
import type { FillExercise } from './fill';
import type { TextSelectionExercise } from './text-selection';
import type { VerbAnalysisExercise } from './verb-analysis';
import type { VerbConjugationExercise } from './verb-conjugation';
import type { SentenceDiagrammingExercise } from './sentence-diagramming';
import type { MultipleChoiceExercise } from './multiple-choice';
import type { OddOneOutExercise } from './odd-one-out';
import type { TableFillExercise } from './table-fill';

export type Exercise =
  | MatchingExercise
  | FillExercise
  | TextSelectionExercise
  | VerbAnalysisExercise
  | VerbConjugationExercise
  | SentenceDiagrammingExercise
  | MultipleChoiceExercise
  | OddOneOutExercise
  | TableFillExercise;
