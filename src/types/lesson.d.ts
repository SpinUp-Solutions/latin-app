import { IntroductionPage, ExercisePage } from './page';

export interface Lesson {
  id: string;
  title: string;
  description?: string;
  introduction: IntroductionPage[];
  exercises: ExercisePage[];
}

export type { IntroductionPage, ExercisePage } from './page';
export type { RenderableContentItem } from './page';
export type { ContentItem, TextContent, EmphasisContent, TableContent, ComponentNarration } from './content';
export type { VocabularyItem, VocabularyContent } from './vocabulary';
export type {
  BaseExercise,
  MatchingExercise,
  FillExercise,
  TextSelectionExercise,
  VerbAnalysisExercise,
  VerbConjugationExercise,
  MultipleChoiceExercise,
  Exercise,
} from './exercise';
