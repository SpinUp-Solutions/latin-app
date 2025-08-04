import { TextContent, EmphasisContent, TableContent } from './content';
import { VocabularyContent } from './vocabulary';
import {
  MatchingExercise,
  FillExercise,
  TextSelectionExercise,
  VerbAnalysisExercise,
  VerbConjugationExercise,
  SentenceDiagrammingExercise,
  MultipleChoiceExercise,
} from './exercises';

export type RenderableContentItem =
  | TextContent
  | EmphasisContent
  | TableContent
  | VocabularyContent
  | MatchingExercise
  | FillExercise
  | TextSelectionExercise
  | VerbAnalysisExercise
  | VerbConjugationExercise
  | SentenceDiagrammingExercise
  | MultipleChoiceExercise;

export interface BasePage {
  id: string;
  title?: string;
  items: RenderableContentItem[];
  audioPath?: string | null;
}

export interface IntroductionPage extends BasePage {}

export interface ExercisePage extends BasePage {}
