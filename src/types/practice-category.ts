import type { LessonSummary } from '@/src/types/lesson';

export const PRACTICE_LESSON_TYPES = ['vocab', 'sentence-diagramming', 'listening'] as const;

export type PracticeLessonType = (typeof PRACTICE_LESSON_TYPES)[number];
export type PracticeCategoryStatus = 'active' | 'archived';

export interface PracticeCategorySummary {
  id: string;
  lessonType: PracticeLessonType;
  name: string;
  description?: string;
  status: PracticeCategoryStatus;
  categoryOrder: number;
}

export interface PracticeCategory extends PracticeCategorySummary {
  normalizedName: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PracticeCategoryMembership {
  id: string;
  categoryId: string;
  lessonId: string;
  lessonOrder: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Student-facing ordering metadata for one lesson inside one practice category. */
export interface PracticeCategoryPlacement {
  categoryId: string;
  lessonOrder: number;
}

export interface PracticeCategoryWithCounts extends PracticeCategory {
  assignedLessonCount: number;
  liveLessonCount: number;
  draftLessonCount: number;
}

export type PracticeCategoryLesson = LessonSummary & {
  membershipId: string;
  lessonOrder: number;
};
