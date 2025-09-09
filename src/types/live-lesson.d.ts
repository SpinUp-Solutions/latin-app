import { Lesson } from './lesson';

export interface LiveLesson {
  lessonId: string;      // Reference to lessons collection document
  order: number;         // Display order in student dashboard
  publishedAt: string;   // ISO timestamp when made live
  publishedBy: string;   // Admin user ID who published it
}

export interface LiveLessonWithData extends LiveLesson {
  lessonData: Lesson;   // Populated lesson data for display
  progress?: number;     // Student's progress (0-100)
  status?: 'locked' | 'available' | 'in-progress' | 'completed';
}