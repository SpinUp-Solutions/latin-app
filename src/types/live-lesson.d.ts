import { Lesson } from './lesson';

export type LessonStatus = 'available' | 'in-progress' | 'completed' | 'locked' | 'current' | 'upcoming';

export interface LiveLesson {
  lessonId: string;
  order: number;
  publishedAt: string;
  publishedBy: string;
}

export interface LiveLessonWithData extends LiveLesson {
  lessonData: Lesson;
  progress?: number;
  status?: LessonStatus;
}
