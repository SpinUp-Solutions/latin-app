import { Lesson } from '@/src/types/lesson';
import { auth } from './firebase';

class LessonService {
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

  async createLesson(lesson: Lesson): Promise<{ success: boolean; lesson: Lesson; message: string }> {
    return this.makeRequest('/api/admin/lessons', {
      method: 'POST',
      body: JSON.stringify(lesson),
    });
  }

  async updateLesson(lesson: Lesson): Promise<{ success: boolean; lesson: Lesson; message: string }> {
    return this.makeRequest('/api/admin/lessons', {
      method: 'PUT',
      body: JSON.stringify(lesson),
    });
  }

  async saveLesson(
    lesson: Lesson,
    isUpdate: boolean = false
  ): Promise<{ success: boolean; lesson: Lesson; message: string }> {
    if (isUpdate) {
      return this.updateLesson(lesson);
    } else {
      return this.createLesson(lesson);
    }
  }

  async getLessons(): Promise<{ lessons: Lesson[] }> {
    return this.makeRequest('/api/admin/lessons');
  }

  async getLesson(id: string): Promise<Lesson> {
    const response = await this.makeRequest(`/api/admin/lessons/${id}`);
    return response.lesson;
  }

  async deleteLesson(id: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`/api/admin/lessons/${id}`, {
      method: 'DELETE',
    });
  }
}

export const lessonService = new LessonService();
