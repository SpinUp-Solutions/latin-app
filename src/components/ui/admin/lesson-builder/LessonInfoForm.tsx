import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { BookOpen } from 'lucide-react';
import { Lesson } from '@/src/types/lesson';

interface LessonInfoFormProps {
  lesson: Lesson;
  onUpdateInfo: (updates: Partial<Pick<Lesson, 'id' | 'title' | 'description'>>) => void;
}

export const LessonInfoForm: React.FC<LessonInfoFormProps> = ({ lesson, onUpdateInfo }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Lesson Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">ID</label>
          <input
            type="text"
            value={lesson.id}
            onChange={e => onUpdateInfo({ id: e.target.value })}
            className="w-full p-2 border rounded-md"
            placeholder="lesson-1"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            value={lesson.title}
            onChange={e => onUpdateInfo({ title: e.target.value })}
            className="w-full p-2 border rounded-md"
            placeholder="Enter lesson title..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={lesson.description || ''}
            onChange={e => onUpdateInfo({ description: e.target.value })}
            className="w-full p-2 border rounded-md"
            rows={2}
            placeholder="Enter lesson description..."
          />
        </div>
      </CardContent>
    </Card>
  );
};
