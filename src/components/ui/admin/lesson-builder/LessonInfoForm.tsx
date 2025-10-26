import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { BookOpen, Library } from 'lucide-react';
import { Lesson } from '@/src/types/lesson';
import { Input } from '@/src/components/ui/input';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { VocabularyPoolSelector } from '../vocabulary-pools/VocabularyPoolSelector';

interface LessonInfoFormProps {
  lesson: Lesson;
  onUpdateInfo: (updates: Partial<Pick<Lesson, 'id' | 'title' | 'description' | 'type' | 'vocabulary_pool'>>) => void;
  isNewLesson?: boolean;
}

export const LessonInfoForm: React.FC<LessonInfoFormProps> = ({ lesson, onUpdateInfo, isNewLesson = false }) => {
  return (
    <div className="space-y-4">
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
            <Input
              type="text"
              value={lesson.title}
              onChange={e => onUpdateInfo({ title: e.target.value })}
              placeholder="Enter lesson title..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="lessonType"
                  value="normal"
                  checked={lesson.type === 'normal'}
                  onChange={e => onUpdateInfo({ type: e.target.value as 'normal' | 'vocab' })}
                  disabled={!isNewLesson}
                  className="w-4 h-4"
                />
                <span className={!isNewLesson ? 'text-gray-500' : ''}>Normal</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="lessonType"
                  value="vocab"
                  checked={lesson.type === 'vocab'}
                  onChange={e => onUpdateInfo({ type: e.target.value as 'normal' | 'vocab' })}
                  disabled={!isNewLesson}
                  className="w-4 h-4"
                />
                <span className={!isNewLesson ? 'text-gray-500' : ''}>Vocab</span>
              </label>
            </div>
            {!isNewLesson && <p className="text-xs text-gray-500 mt-1">Lesson type cannot be changed after creation</p>}
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
