import type { Page } from './page';
import type { RotationVersionReference } from './test';

export const LESSON_UNIT_TYPES = ['vocab', 'normal', 'sentence-diagramming', 'listening'] as const;

export type LessonUnitType = (typeof LESSON_UNIT_TYPES)[number];
export interface LearningUnitBase {
  id: string;
  kind: 'lesson' | 'test';
  title: string;
  description: string;
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
  /**
   * Controls whether the full-database word search is shown in the lesson's
   * Practice sidebar. Legacy lesson documents may omit this field and are
   * treated as enabled.
   */
  showWordSearch?: boolean;
  isLive: boolean;
  liveOrder: number | null;
  publishedAt: string | null;
  publishedBy: string | null;

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

export interface LearningPathDocument {
  id: 'default';
  revision: number;
  unitIds: string[];
  updatedAt: string;
  updatedBy: string;
}

export type LearningPathLessonIssueCode = 'INVALID_LESSON_DATA' | 'INCOMPLETE_LESSON';

export interface LearningPathLessonIssue {
  code: LearningPathLessonIssueCode;
  message: string;
  path?: Array<string | number>;
}

export interface AdminLearningPathView {
  path: LearningPathDocument | null;
  effectiveUnitIds: string[];
  source: 'learning-path';
  canEdit: boolean;
  editBlockedReason?: string;
  /**
   * Non-blocking content warnings for the normal lessons currently in the
   * canonical path. This is optional for compatibility with older clients;
   * the admin endpoint always returns an object.
   */
  lessonIssuesById?: Record<string, LearningPathLessonIssue[]>;
}

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
