'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/src/store';
import { Button } from '@/src/components/ui/button';
import { RomanCard, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { ArrowLeft, Shield, Plus, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { LessonBuilder } from '@/src/components/ui/admin';
import { LessonManager } from '@/src/components/ui/admin/LessonManager';
import { Lesson } from '@/src/types/lesson';
import { useAppDispatch } from '@/src/store/hooks';
import { saveLesson, resetLessonState, clearError } from '@/src/store/slices/lessonSlice';

export default function AdminPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, loading: authLoading } = useSelector((state: RootState) => state.auth);
  const { saving, error, lastSavedLesson } = useSelector((state: RootState) => state.lesson);
  const [showLessonBuilder, setShowLessonBuilder] = useState(false);
  const [showLessonManager, setShowLessonManager] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | undefined>(undefined);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
      toast.error('Access denied. Admin privileges required.');
    }
  }, [user, authLoading, router]);

  // Handle save success
  useEffect(() => {
    if (lastSavedLesson && !saving && !error) {
      toast.success('Lesson saved successfully!');
      setShowLessonBuilder(false);
      setEditingLesson(undefined);
      dispatch(resetLessonState());
    }
  }, [lastSavedLesson, saving, error, dispatch]);

  // Handle save error
  useEffect(() => {
    if (error && !saving) {
      toast.error(error);
      dispatch(clearError());
    }
  }, [error, saving, dispatch]);

  const handleSaveLesson = async (lesson: Lesson) => {
    try {
      const isUpdate = lesson.hasOwnProperty('createdAt') || lesson.hasOwnProperty('version');

      dispatch(saveLesson({ lesson, isUpdate }));
    } catch (error) {
      console.error('Error dispatching save lesson:', error);
    }
  };

  const handleCreateNewLesson = () => {
    setEditingLesson(undefined);
    setShowLessonBuilder(true);
    setShowLessonManager(false);
    dispatch(clearError());
  };

  const handleManageExistingLessons = () => {
    setShowLessonManager(true);
    setShowLessonBuilder(false);
    dispatch(clearError());
  };

  const handleEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setShowLessonBuilder(true);
    setShowLessonManager(false);
    dispatch(clearError());
  };

  const handleBackToAdmin = () => {
    setShowLessonBuilder(false);
    setShowLessonManager(false);
    setEditingLesson(undefined);
    dispatch(resetLessonState());
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

  if (showLessonManager) {
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
                <h1 className="text-xl font-serif tracking-wide">Lesson Manager</h1>
                <p className="text-sm text-roman-stone">Manage existing lessons</p>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto py-8 px-4">
          <LessonManager onEditLesson={handleEditLesson} onBackToAdmin={handleBackToAdmin} />
        </main>
      </div>
    );
  }

  if (showLessonBuilder) {
    return (
      <div className="min-h-screen bg-roman-marble">
        <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={handleBackToAdmin} disabled={saving}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-serif tracking-wide">{editingLesson ? 'Edit Lesson' : 'Lesson Builder'}</h1>
                <p className="text-sm text-roman-stone">
                  {editingLesson ? 'Edit existing lesson' : 'Create and edit lessons'}
                </p>
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

        <LessonBuilder initialLesson={editingLesson} onSave={handleSaveLesson} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif tracking-wide">Admin Panel</h1>
              <p className="text-sm text-roman-stone">Latin App Administration</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Lesson Management */}
          <RomanCard className="cursor-pointer hover:shadow-lg transition-shadow">
            <RomanCardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-800">Lesson Management</h3>
                  <p className="text-sm text-roman-stone">Create and edit lessons</p>
                </div>
              </div>
              <div className="space-y-2">
                <Button onClick={handleCreateNewLesson} className="w-full justify-start" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Lesson
                </Button>
                <Button onClick={handleManageExistingLessons} className="w-full justify-start" variant="outline">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Manage Existing Lessons
                </Button>
              </div>
            </RomanCardContent>
          </RomanCard>

          {/* Vocabulary Management */}
          <RomanCard className="cursor-pointer hover:shadow-lg transition-shadow">
            <RomanCardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <BookOpen className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-800">Vocabulary Management</h3>
                  <p className="text-sm text-roman-stone">View and edit Latin words</p>
                </div>
              </div>
              <div className="space-y-2">
                <Button
                  onClick={() => router.push('/admin/vocabulary')}
                  className="w-full justify-start"
                  variant="outline">
                  <BookOpen className="h-4 w-4 mr-2" />
                  View All Words
                </Button>
              </div>
            </RomanCardContent>
          </RomanCard>

          {/* User Management */}
          <RomanCard className="cursor-pointer hover:shadow-lg transition-shadow">
            <RomanCardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-serif text-gray-800">User Management</h3>
                  <p className="text-sm text-roman-stone">Manage users and roles</p>
                </div>
              </div>
              <div className="space-y-2">
                <Button className="w-full justify-start" variant="outline" disabled>
                  View All Users
                </Button>
                <Button className="w-full justify-start" variant="outline" disabled>
                  Manage Roles
                </Button>
              </div>
            </RomanCardContent>
          </RomanCard>
        </div>

        {/* Quick Stats */}
      </main>
    </div>
  );
}
