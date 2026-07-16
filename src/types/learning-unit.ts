import type { Page } from './page';
import type { UserProgress } from './lesson';
import type { RotationVersionReference } from './test';

export const LESSON_UNIT_TYPES = ['vocab', 'normal', 'sentence-diagramming', 'listening'] as const;

export type LessonUnitType = (typeof LESSON_UNIT_TYPES)[number];
export interface LearningUnitBase {
  id: string;
  kind: 'lesson' | 'test';
  title: string;
  description: string;
  isLive: boolean;
  liveOrder: number | null;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface LessonUnit extends LearningUnitBase {
  kind: 'lesson';
  type: LessonUnitType;
  pages: Page[];
  vocabulary_pool?: string | null;

  // Existing lesson documents may carry these cached summary fields.
  version?: number;
  totalPages?: number;
  totalItems?: number;
  totalExercises?: number;
}

export interface TestUnit extends LearningUnitBase {
  kind: 'test';
  rotationVersions: RotationVersionReference[];
  passingPercentage: number | null;
}

export type LearningUnit = LessonUnit | TestUnit;

export interface TestUnitCompletionProgress {
  userId: string;
  /** Compatibility field for the ID of a document in the shared lessons collection. */
  lessonId: string;
  status: 'completed';
  exerciseProgress: [];
  completedAt: string;
  lastAccessedAt: string;
  updatedAt: string;
  progressSchemaVersion: 2;
  furthestPageIndex?: never;
  currentPageIndex?: never;
  score?: never;
  progress?: never;
}

export type LessonUnitProgress = UserProgress & { progressSchemaVersion: 2 };
export type LearningUnitProgress = LessonUnitProgress | TestUnitCompletionProgress;
export type LearningUnitProgressFor<Unit extends LearningUnit> = Unit extends TestUnit
  ? TestUnitCompletionProgress
  : LessonUnitProgress;
