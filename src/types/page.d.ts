import { TextContent, EmphasisContent, TableContent } from './content';
import { VocabularyContent, VocabularyPoolContent } from './vocabulary';
import {
  MatchingExercise,
  FillExercise,
  TextSelectionExercise,
  VerbAnalysisExercise,
  VerbConjugationExercise,
  SentenceDiagrammingExercise,
  MultipleChoiceExercise,
  OddOneOutExercise,
} from './exercises';
import { FeedbackConfig } from './exercises/base';

export type RenderableContentItem =
  | TextContent
  | EmphasisContent
  | TableContent
  | VocabularyContent
  | VocabularyPoolContent
  | MatchingExercise
  | FillExercise
  | TextSelectionExercise
  | VerbAnalysisExercise
  | VerbConjugationExercise
  | SentenceDiagrammingExercise
  | MultipleChoiceExercise
  | OddOneOutExercise;

export interface BasePage {
  id: string;
  title?: string;
  items: RenderableContentItem[];
  audioPath?: string | null;
}

export interface Page extends BasePage {
  feedbackConfig?: FeedbackConfig;
}
