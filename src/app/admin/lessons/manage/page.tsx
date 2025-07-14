'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, BookOpen, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { LessonManager } from '@/src/components/ui/admin/LessonManager';
import { Lesson } from '@/src/types/lesson';

export default function ManageLessonsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
      toast.error('Access denied. Admin privileges required.');
    }
  }, [user, authLoading, router]);

  const handleEditLesson = (lesson: Lesson) => {
    router.push(`/admin/lessons/edit/${lesson.id}`);
  };

  const handleBackToAdmin = () => {
    router.push('/admin');
  };

  const handleCreateNewLesson = () => {
    router.push('/admin/lessons/create');
  };

  const handleContinueDraft = (lessonId: string) => {
    router.push(`/admin/lessons/create?continue=true&lessonId=${lessonId}`);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBackToAdmin}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">Manage Lessons</h1>
              <p className="text-sm text-roman-stone">View and edit existing lessons</p>
            </div>
          </div>
        </div>
        <Button onClick={handleCreateNewLesson} className="bg-roman-red hover:bg-roman-red/90">
          <Plus className="h-4 w-4 mr-2" />
          Create New Lesson
        </Button>
      </header>

      <main className="container mx-auto py-8 px-4">
        <LessonManager onEditLesson={handleEditLesson} onContinueDraft={handleContinueDraft} />
      </main>
    </div>
  );
}
