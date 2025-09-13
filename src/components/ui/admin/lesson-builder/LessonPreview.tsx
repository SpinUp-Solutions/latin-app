import React from 'react';
import { BookOpen } from 'lucide-react';
import { Lesson } from '@/src/types/lesson';
import { hasLessonContent } from '@/src/utils/lessonUtils';
import { LessonPlayer } from '@/src/components/ui/lesson/lesson-player';

interface LessonPreviewProps {
  lesson: Lesson;
}

export const LessonPreview: React.FC<LessonPreviewProps> = ({ lesson }) => {
  const hasContent = hasLessonContent(lesson);

  return (
    <div className="w-1/2 border-l border-border bg-white overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-border p-4 z-10">
        <h2 className="text-xl font-serif text-gray-800 flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Live Preview
        </h2>
        <p className="text-sm text-roman-stone">See how your lesson will look to students</p>
      </div>
      <div className="p-4">
        {hasContent ? (
          <LessonPlayer lesson={lesson} />
        ) : (
          <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg">
            <div className="text-center">
              <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Add pages to see preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
