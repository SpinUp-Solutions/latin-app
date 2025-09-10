'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '@/src/store';
import { fetchLessonById } from '@/src/store/slices/liveLessonSlice';
import LessonPlayer from '@/src/components/ui/lesson/lesson-player';

export default function DynamicLessonPage() {
  const params = useParams();
  const lessonId = params.lessonId as string;
  const dispatch = useDispatch<AppDispatch>();

  const { currentLesson, lessonLoading, error } = useSelector((state: RootState) => state.liveLesson);

  useEffect(() => {
    if (lessonId) {
      dispatch(fetchLessonById(lessonId));
    }
  }, [lessonId, dispatch]);

  if (lessonLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-roman-marble">
        <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <span className="text-xl">L</span>
            </div>
            <h1 className="text-xl font-serif tracking-wide">Latin App</h1>
          </div>
        </header>
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-8 bg-white rounded-lg border border-border text-center">
              <h2 className="text-2xl font-serif text-gray-800 mb-4">Lesson Not Found</h2>
              <p className="text-roman-stone">{error}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!currentLesson) {
    return (
      <div className="min-h-screen bg-roman-marble">
        <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
              <span className="text-xl">L</span>
            </div>
            <h1 className="text-xl font-serif tracking-wide">Latin App</h1>
          </div>
        </header>
        <main className="container mx-auto py-8 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-8 bg-white rounded-lg border border-border text-center">
              <h2 className="text-2xl font-serif text-gray-800 mb-4">Lesson Not Available</h2>
              <p className="text-roman-stone">The requested lesson could not be found.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
            <span className="text-xl">L</span>
          </div>
          <h1 className="text-xl font-serif tracking-wide">Latin App</h1>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-serif text-gray-800 mb-6">{currentLesson.title}</h2>
          <LessonPlayer lesson={currentLesson} />
        </div>
      </main>
    </div>
  );
}
