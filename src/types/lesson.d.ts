import { IntroductionPage, ExercisePage } from './page';
import type { VocabularyPoolWithWords } from './vocabulary-pool';

export interface Lesson {
  id: string;
  title: string;
  description?: string;
  vocabulary_pool?: string; // Reference to vocabulary_pools document ID
  introduction: IntroductionPage[];
  exercises: ExercisePage[];
}

export interface LessonWithVocabularyPool extends Lesson {
  vocabularyPoolData?: VocabularyPoolWithWords;
}

export type { IntroductionPage, ExercisePage } from './page';
export type { RenderableContentItem } from './page';
export type { ContentItem, TextContent, EmphasisContent, TableContent, ComponentNarration } from './content';
export type { VocabularyItem, VocabularyContent, VocabularyPoolContent } from './vocabulary';
export type {
  BaseExercise,
  MatchingExercise,
  FillExercise,
  TextSelectionExercise,
  VerbAnalysisExercise,
  VerbConjugationExercise,
  MultipleChoiceExercise,
  OddOneOutExercise,
  Exercise,
} from './exercise';
