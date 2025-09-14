import { IntroductionPage, ExercisePage } from './page';
import type { VocabularyPoolWithWords } from './vocabulary-pool';

export interface Lesson {
  id: string;
  title: string;
  description?: string;
  vocabulary_pool?: string;
  introduction: IntroductionPage[];
  exercises: ExercisePage[];

  isLive: boolean;
  liveOrder: number | null;
  publishedAt: string | null;
  publishedBy: string | null;

  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  version?: number;
}

export interface LessonWithVocabularyPool extends Lesson {
  vocabularyPoolData?: VocabularyPoolWithWords;
}

export type LessonStatus = 'available' | 'in-progress' | 'completed' | 'locked';

export interface LessonWithProgress extends Lesson {
  progress?: number;
  status?: LessonStatus;
}

export interface ExerciseProgress {
  exerciseId: string;
  completedAt: string;
  score: number;
}

export interface UserProgress {
  userId: string;
  lessonId: string;
  status: LessonStatus;
  completedAt?: string;
  progress: number;
  exerciseProgress: ExerciseProgress[];
  score?: number;
  overallProgress?: number;
  exercisesCompleted?: number;
  totalExercises?: number;
}

export interface LessonWithAccess extends Lesson {
  isAccessible: boolean;
  userProgress?: UserProgress;
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
