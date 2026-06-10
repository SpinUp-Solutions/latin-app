import { Page } from './page';
import type { VocabularyPoolWithWords } from './vocabulary-pool';

export interface Lesson {
  id: string;
  title: string;
  description?: string;
  type: 'vocab' | 'normal' | 'sentence-diagramming' | 'listening';
  vocabulary_pool?: string;
  pages: Page[];

  isLive: boolean;
  liveOrder: number | null;
  publishedAt: string | null;
  publishedBy: string | null;

  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  version?: number;
  totalPages?: number;
  totalItems?: number;
  totalExercises?: number;
}

export type LessonSummary = Omit<Lesson, 'pages'> & {
  totalPages: number;
  totalItems: number;
  totalExercises: number;
};

export interface LessonWithVocabularyPool extends Lesson {
  vocabularyPoolData?: VocabularyPoolWithWords;
}

export type LessonStatus = 'available' | 'in-progress' | 'completed' | 'locked';

export interface LessonWithProgress extends Lesson {
  progress?: number;
  status?: LessonStatus;
  currentPageIndex?: number;
  exerciseProgress?: ExerciseProgress[];
  completedAt?: string;
  score?: number;
  lastAccessedAt?: string;
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
  currentPageIndex: number;
  exerciseProgress: ExerciseProgress[];
  score?: number;
  lastAccessedAt: string;
  progress?: number;
}

export type { Page } from './page';
export type { RenderableContentItem } from './page';
export type { ContentItem, TextContent, EmphasisContent, TableContent, ComponentNarration } from './content';
export type { VocabularyItem, VocabularyContent, VocabularyPoolContent } from './vocabulary';
export type {
  BaseExercise,
  MatchingExercise,
  FillExercise,
  TextSelectionExercise,
  FillEmboldedTextExercise,
  MultipleChoiceExercise,
  OddOneOutExercise,
  Exercise,
} from './exercise';
