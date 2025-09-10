import { LiveLessonWithData } from '@/src/types/live-lesson';
import { Lesson } from '@/src/types/lesson';
import { auth } from './firebase';

class LiveLessonService {
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

  // Admin methods
  async getAdminLiveLessons(): Promise<{ liveLessons: LiveLessonWithData[]; availableLessons: Lesson[] }> {
    return this.makeRequest('/api/admin/live-lessons');
  }

  async publishLesson(lessonId: string, order?: number): Promise<{ success: boolean; message: string }> {
    return this.makeRequest('/api/admin/live-lessons', {
      method: 'POST',
      body: JSON.stringify({ lessonId, order }),
    });
  }

  async unpublishLesson(lessonId: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`/api/admin/live-lessons/${lessonId}`, {
      method: 'DELETE',
    });
  }

  async reorderLiveLessons(lessons: { lessonId: string; order: number }[]): Promise<{ success: boolean }> {
    return this.makeRequest('/api/admin/live-lessons/reorder', {
      method: 'PUT',
      body: JSON.stringify({ lessons }),
    });
  }

  async batchPublish(lessonIds: string[]): Promise<{ success: boolean; message: string; processedCount: number }> {
    return this.makeRequest('/api/admin/live-lessons/batch', {
      method: 'POST',
      body: JSON.stringify({ action: 'publish', lessonIds }),
    });
  }

  async batchUnpublish(lessonIds: string[]): Promise<{ success: boolean; message: string; processedCount: number }> {
    return this.makeRequest('/api/admin/live-lessons/batch', {
      method: 'POST',
      body: JSON.stringify({ action: 'unpublish', lessonIds }),
    });
  }

  // Student methods (public)
  async getStudentLiveLessons(): Promise<{ lessons: LiveLessonWithData[] }> {
    const token = await this.getAuthToken();

    const response = await fetch('/api/live-lessons', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch lessons');
    }

    return response.json();
  }

  async getLessonById(lessonId: string): Promise<LiveLessonWithData> {
    const token = await this.getAuthToken();

    const response = await fetch(`/api/lessons/${lessonId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Lesson not found');
      }
      throw new Error('Failed to fetch lesson');
    }

    const data = await response.json();
    return data.lesson;
  }
}

export const liveLessonService = new LiveLessonService();
