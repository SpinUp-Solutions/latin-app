'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { Button } from '@/src/components/ui/button';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { LessonBuilder } from '@/src/components/ui/admin';
import { ClipboardProvider } from '@/src/components/ui/core/clipboard';
import { Lesson } from '@/src/types/lesson';
import { useAppDispatch } from '@/src/store/hooks';
import {
  saveLesson,
  resetLessonState,
  clearError,
  clearLastSavedLesson,
  setLesson,
} from '@/src/store/slices/lessonSlice';
import { lessonService } from '@/src/services/lessonService';

interface EditLessonPageProps {
  params: {
    id: string;
  };
}

export default function EditLessonPage({ params }: EditLessonPageProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, loading: authLoading } = useSelector((state: RootState) => state.auth);
  const { saving, error, lastSavedLesson, currentLesson } = useSelector((state: RootState) => state.lesson);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
      toast.error('Access denied. Admin privileges required.');
      return;
    }

    if (user?.role === 'admin' && params.id) {
      loadLesson();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, router, params.id]);

  const loadLesson = async () => {
    try {
      setLoading(true);
      const lessonData = await lessonService.getLesson(params.id);
      if (lessonData) {
        dispatch(setLesson(lessonData));
      } else {
        toast.error('Lesson not found');
        router.push('/admin/lessons/manage');
      }
    } catch (error) {
      console.error('Error loading lesson:', error);
      toast.error('Failed to load lesson');
      router.push('/admin/lessons/manage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (lastSavedLesson && !saving && !error) {
      toast.success('Lesson updated successfully!');
      // Clear the lastSavedLesson flag to prevent repeated notifications
      dispatch(clearLastSavedLesson());
    }
  }, [lastSavedLesson, saving, error, dispatch]);

  // Handle save error
  useEffect(() => {
    if (error && !saving) {
      toast.error(error);
      dispatch(clearError());
    }
  }, [error, saving, dispatch]);

  const handleSaveLesson = async (updatedLesson: Lesson) => {
    try {
      const isUpdate = true; // Always an update for edit page
      dispatch(saveLesson({ lesson: updatedLesson, isUpdate }));
    } catch (error) {
      console.error('Error dispatching save lesson:', error);
    }
  };

  const handleBackToManage = () => {
    setNavigating(true);
    router.push('/admin/lessons/manage');
    // Reset state after navigation starts
    setTimeout(() => dispatch(resetLessonState()), 100);
  };

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return null;
  }

  if (navigating || !currentLesson) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBackToManage} disabled={saving}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Manage Lessons
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">Edit Lesson</h1>
              <p className="text-sm text-roman-stone">Editing: {currentLesson.title || 'Untitled Lesson'}</p>
            </div>
          </div>
        </div>
        {saving && (
          <div className="flex items-center gap-2 text-sm text-roman-stone">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-roman-red"></div>
            Saving lesson...
          </div>
        )}
      </header>

      <ClipboardProvider>
        <LessonBuilder initialLesson={currentLesson} onSave={handleSaveLesson} />
      </ClipboardProvider>
    </div>
  );
}
