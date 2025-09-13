import { UserProgress, Lesson, ExerciseProgress } from '@/src/types/lesson';
import {
  getLiveLessonsSorted,
  calculateOverallProgress,
  calculateAverageScore,
  isLessonComplete,
  getContentCount,
} from '@/src/utils/lessonUtils';
import { auth } from './firebase';

class ProgressService {
  private async getAuthToken(): Promise<string | null> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }

  private async makeRequest(url: string, options: RequestInit = {}) {
    const token = await this.getAuthToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async getUserProgress(userId: string, lessonId: string): Promise<UserProgress | null> {
    try {
      const response = await this.makeRequest(`/api/progress/${userId}/${lessonId}`);
      return response;
    } catch (error) {
      console.error('Error fetching user progress:', error);
      return null;
    }
  }

  async getUserProgressForCourse(userId: string): Promise<Record<string, UserProgress>> {
    const user = auth.currentUser;
    if (!user || user.uid !== userId) {
      throw new Error('Unauthorized access to progress data');
    }

    try {
      const response = await this.makeRequest(`/api/progress/${userId}`);
      return response || {};
    } catch (error) {
      console.error('Error fetching course progress:', error);
      return {};
    }
  }

  async updateProgress(userId: string, lessonId: string, progress: Partial<UserProgress>): Promise<void> {
    await this.makeRequest(`/api/progress/${userId}/${lessonId}`, {
      method: 'POST',
      body: JSON.stringify(progress),
    });
  }

  async markExerciseComplete(
    userId: string,
    lessonId: string,
    exerciseId: string,
    score: number,
    lesson?: Lesson
  ): Promise<void> {
    const existingProgress = await this.getUserProgress(userId, lessonId);
    const exerciseProgress = existingProgress?.exerciseProgress || [];

    const existingExerciseIndex = exerciseProgress.findIndex(ep => ep.exerciseId === exerciseId);
    const newExerciseProgress: ExerciseProgress = {
      exerciseId,
      completedAt: new Date().toISOString(),
      score,
    };

    if (existingExerciseIndex >= 0) {
      exerciseProgress[existingExerciseIndex] = newExerciseProgress;
    } else {
      exerciseProgress.push(newExerciseProgress);
    }

    const totalExercises = lesson ? getContentCount(lesson).exerciseItems : exerciseProgress.length;
    const overallProgress = calculateOverallProgress(exerciseProgress, totalExercises);
    const averageScore = calculateAverageScore(exerciseProgress);
    const isComplete = lesson ? isLessonComplete(exerciseProgress, totalExercises) : false;

    const updateData: Partial<UserProgress> = {
      exerciseProgress,
      progress: overallProgress,
      score: averageScore,
      status: isComplete ? 'completed' : 'in-progress',
      ...(isComplete && { completedAt: new Date().toISOString() }),
    };

    await this.updateProgress(userId, lessonId, updateData);
  }

  async markLessonComplete(userId: string, lessonId: string, score?: number): Promise<void> {
    await this.updateProgress(userId, lessonId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      progress: 100,
      score,
    });
  }

  async markLessonInProgress(userId: string, lessonId: string, progress: number = 0): Promise<void> {
    const existingProgress = await this.getUserProgress(userId, lessonId);

    await this.updateProgress(userId, lessonId, {
      status: 'in-progress',
      progress,
      exerciseProgress: existingProgress?.exerciseProgress || [],
    });
  }

  async canAccessLesson(userId: string, lessonOrder: number, lessons: Lesson[]): Promise<boolean> {
    if (lessonOrder === 0) return true;

    const previousLesson = lessons.find(l => l.liveOrder === lessonOrder - 1);
    if (!previousLesson) return false;

    const progress = await this.getUserProgress(userId, previousLesson.id);

    return progress?.status === 'completed';
  }

  async getCurrentLessonForUser(userId: string, lessons: Lesson[]): Promise<Lesson | null> {
    const sortedLessons = getLiveLessonsSorted(lessons);

    for (const lesson of sortedLessons) {
      const progress = await this.getUserProgress(userId, lesson.id);

      if (!progress || progress.status !== 'completed') {
        const canAccess = await this.canAccessLesson(userId, lesson.liveOrder || 0, lessons);
        return canAccess ? lesson : null;
      }
    }

    return null;
  }
}

export const progressService = new ProgressService();
