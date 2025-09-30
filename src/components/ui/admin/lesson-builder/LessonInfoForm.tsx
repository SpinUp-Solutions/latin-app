import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { BookOpen, Library } from 'lucide-react';
import { Lesson } from '@/src/types/lesson';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { VocabularyPoolSelector } from '../vocabulary-pools/VocabularyPoolSelector';

interface LessonInfoFormProps {
  lesson: Lesson;
  onUpdateInfo: (updates: Partial<Pick<Lesson, 'id' | 'title' | 'description' | 'vocabulary_pool'>>) => void;
}

export const LessonInfoForm: React.FC<LessonInfoFormProps> = ({ lesson, onUpdateInfo }) => {
  return (
    <div className="space-y-4">
      {/* Lesson Basic Information */}
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
              className="w-full p-2 border rounded-md bg-gray-100 cursor-not-allowed"
              placeholder="lesson-1"
              disabled
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <SimpleRichEditor
              content={lesson.title}
              onChange={value => onUpdateInfo({ title: value })}
              placeholder="Enter lesson title..."
              singleLine={true}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <SimpleRichEditor
              content={lesson.description || ''}
              onChange={value => onUpdateInfo({ description: value })}
              placeholder="Enter lesson description..."
              rows={2}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* Vocabulary Pool Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Vocabulary Pool
          </CardTitle>
        </CardHeader>
        <CardContent>
          <VocabularyPoolSelector
            selectedPoolId={lesson.vocabulary_pool}
            onPoolSelect={poolId => onUpdateInfo({ vocabulary_pool: poolId })}
          />
        </CardContent>
      </Card>
    </div>
  );
};
