import type { VocabularyPoolWithWords } from './vocabulary-pool';
import type {
  PracticeCategoryPlacement,
  PracticeCategorySelection,
  PracticeCategorySummary,
} from './practice-category';
import type { LessonUnit } from './learning-unit';
import type { TestAttemptOriginSummary, TestUnitSummary } from './test';
import type { StudentMockTestSummary } from './test';
import type { StudentPastMockResult } from './test-results';

/**
 * Temporary compatibility shape for callers that still create legacy lesson
 * objects without an explicit kind or description.
 */
export type Lesson = Omit<LessonUnit, 'kind' | 'description' | 'vocabulary_pool'> & {
  kind?: 'lesson';
  description?: string;
  vocabulary_pool?: string;

  /** Mutation/local-only category IDs. Never persisted on lesson documents. */
  practiceCategoryIds?: string[];
  /** Canonical mutation/local-only category and tag selections. Never persisted on lesson documents. */
  practiceCategorySelections?: PracticeCategorySelection[];
  /** Response-only joined category records. Never persisted on lesson documents. */
  practiceCategories?: PracticeCategorySummary[];
  /** Response-only student ordering metadata. Never persisted on lesson documents. */
  practiceCategoryPlacements?: PracticeCategoryPlacement[];
};

export type LessonSummary = Omit<Lesson, 'pages'> & {
  totalPages: number;
  totalItems: number;
  totalExercises: number;
};

export type StudentLessonSummary = Omit<LessonSummary, 'kind'> & {
  kind: 'lesson';
  progress: number;
  status: LessonStatus;
  lockedReason?: string;
  furthestPageIndex: number;
  /** @deprecated Schema-v1 cursor mirrored during migration. Prefer furthestPageIndex. */
  currentPageIndex: number;
  /**
   * Per-exercise history for lesson playback. The dashboard projection no
   * longer ships this (it reads progress with a summary field mask); the
   * per-lesson endpoint still returns it.
  */
  exerciseProgress?: ExerciseProgress[];
  completedAt?: string;
  score?: number;
  lastAccessedAt?: string;
  progressSchemaVersion?: number;
  progressLessonVersion?: number;
};

export type StudentTestSummary = TestUnitSummary & {
  status: LessonStatus;
  lockedReason?: string;
  completedAt?: string;
  attemptSummary: TestAttemptOriginSummary;
  relatedLiveMocks?: Array<{ id: string; title: string; passingPercentage: number | null }>;
};

export type StudentLearningUnitSummary = StudentLessonSummary | StudentTestSummary;

export interface StudentDashboard {
  learningPath: StudentLearningUnitSummary[];
  practiceLessons: StudentLessonSummary[];
  mockTests?: StudentMockTestSummary[];
  /** Latest submitted results for hidden/archived mocks; review-only entries. */
  pastMockResults?: StudentPastMockResult[];
}

export type LessonWithVocabularyPool = Lesson & {
  vocabularyPoolData?: VocabularyPoolWithWords;
};

export type LessonStatus = 'available' | 'in-progress' | 'completed' | 'locked';

export type LessonWithProgress = Lesson & {
  progress?: number;
  status?: LessonStatus;
  furthestPageIndex?: number;
  /** @deprecated Schema-v1 cursor mirrored during migration. Prefer furthestPageIndex. */
  currentPageIndex?: number;
  exerciseProgress?: ExerciseProgress[];
  completedExerciseCount?: number;
  requiredExerciseCount?: number;
  completedAt?: string;
  score?: number;
  lastAccessedAt?: string;
  progressSchemaVersion?: number;
  progressLessonVersion?: number;
};

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
  furthestPageIndex?: number;
  /** @deprecated Schema-v1 cursor mirrored during migration. Prefer furthestPageIndex. */
  currentPageIndex?: number;
  exerciseProgress: ExerciseProgress[];
  completedExerciseCount?: number;
  requiredExerciseCount?: number;
  score?: number;
  lastAccessedAt: string;
  progress?: number;
  progressSchemaVersion?: number;
  progressLessonVersion?: number;
  progressMigrationId?: string;
  progressMigratedAt?: string;
  progressMigratedBy?: string;
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
