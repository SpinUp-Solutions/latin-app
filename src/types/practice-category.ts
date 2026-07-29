import type { LessonSummary } from '@/src/types/lesson';

export const PRACTICE_LESSON_TYPES = ['vocab', 'sentence-diagramming', 'listening'] as const;

export type PracticeLessonType = (typeof PRACTICE_LESSON_TYPES)[number];
export type PracticeCategoryStatus = 'active' | 'archived';
export type PracticeTagStatus = 'active' | 'archived';

export interface PracticeTagSummary {
  id: string;
  name: string;
  status: PracticeTagStatus;
  tagOrder: number;
}

export interface PracticeTag extends PracticeTagSummary {
  normalizedName: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PracticeCategorySummary {
  id: string;
  lessonType: PracticeLessonType;
  name: string;
  description?: string;
  status: PracticeCategoryStatus;
  categoryOrder: number;
  tags: PracticeTagSummary[];
}

export interface PracticeCategory extends PracticeCategorySummary {
  tags: PracticeTag[];
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
  tagIds: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Complete desired category/tag assignment submitted by lesson editors. */
export interface PracticeCategorySelection {
  categoryId: string;
  tagIds: string[];
}

/** Student-facing ordering metadata for one lesson inside one practice category. */
export interface PracticeCategoryPlacement extends PracticeCategorySelection {
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
  tagIds: string[];
};
