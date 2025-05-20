'use client';

import React from 'react';
import LessonPlayer from '@/src/components/ui/page/LessonPlayer';
import lessons from '@/src/lib/lesson-config';

export default function LessonPage() {
  const lesson = lessons[0];

  return (
    <div className="min-h-screen bg-roman-marble">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-roman-red flex items-center justify-center text-white font-serif">
            <span className="text-xl">L</span>
          </div>
          <h1 className="text-xl font-serif tracking-wide">Latin App</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-serif text-gray-800 mb-6">Lesson Player</h2>

          {lesson ? (
            <LessonPlayer lesson={lesson} />
          ) : (
            <div className="p-8 bg-white rounded-lg border border-border text-center">
              <p className="text-roman-stone">No lesson available</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
