import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { BookOpen, Library, Search } from 'lucide-react';
import { Lesson } from '@/src/types/lesson';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Switch } from '@/src/components/ui/switch';
import { SimpleRichEditor } from '../../core/simple-rich-editor';
import { VocabularyPoolSelector } from '../vocabulary-pools/VocabularyPoolSelector';
import { PracticeCategorySelector } from '../practice-categories/PracticeCategorySelector';
import { ConfirmationDialog } from '../../core/ConfirmationDialog';
import {
  getLessonPracticeCategoryIds,
  getLessonPracticeCategorySelections,
  isPracticeLessonType,
} from '@/src/utils/practiceCategoryLessons';

interface LessonInfoFormProps {
  lesson: Lesson;
  onUpdateInfo: (
    updates: Partial<
      Pick<
        Lesson,
        | 'id'
        | 'title'
        | 'description'
        | 'type'
        | 'vocabulary_pool'
        | 'showWordSearch'
        | 'practiceCategorySelections'
        | 'practiceCategoryIds'
        | 'practiceCategories'
      >
    >
  ) => void;
  isNewLesson?: boolean;
  disabled?: boolean;
}

export const LessonInfoForm: React.FC<LessonInfoFormProps> = ({
  lesson,
  onUpdateInfo,
  isNewLesson = false,
  disabled = false,
}) => {
  const [pendingType, setPendingType] = useState<Lesson['type'] | null>(null);
  const selectedCategoryIds = getLessonPracticeCategoryIds(lesson);
  const selectedCategorySelections = getLessonPracticeCategorySelections(lesson);

  const applyTypeChange = (nextType: Lesson['type']) => {
    onUpdateInfo({
      type: nextType,
      practiceCategorySelections: [],
      practiceCategoryIds: [],
      practiceCategories: [],
    });
  };

  const handleTypeChange = (nextType: Lesson['type']) => {
    if (nextType === lesson.type) return;

    if (selectedCategoryIds.length > 0) {
      setPendingType(nextType);
      return;
    }

    applyTypeChange(nextType);
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4" />
            Lesson Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">ID</label>
            <input
              type="text"
              value={lesson.id}
              onChange={e => onUpdateInfo({ id: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded bg-gray-100 cursor-not-allowed"
              placeholder="lesson-1"
              disabled
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Title</label>
            <Input
              type="text"
              value={lesson.title}
              onChange={e => onUpdateInfo({ title: e.target.value })}
              placeholder="Enter lesson title..."
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Type</label>
            <Select
              value={lesson.type}
              onValueChange={value => handleTypeChange(value as Lesson['type'])}
              disabled={!isNewLesson || disabled}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="vocab">Vocab</SelectItem>
                <SelectItem value="sentence-diagramming">Sentence Diagramming</SelectItem>
                <SelectItem value="listening">Listening</SelectItem>
              </SelectContent>
            </Select>
            {!isNewLesson && <p className="text-xs text-gray-500 mt-1">Type cannot be changed</p>}
          </div>
          {isPracticeLessonType(lesson.type) && (
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">Categories</label>
              <PracticeCategorySelector
                lessonType={lesson.type}
                selectedIds={selectedCategoryIds}
                selectedSelections={selectedCategorySelections}
                assignedCategories={lesson.practiceCategories}
                disabled={disabled}
                onSelectionChange={(practiceCategorySelections, practiceCategories) =>
                  onUpdateInfo({
                    practiceCategorySelections,
                    practiceCategoryIds: practiceCategorySelections.map(selection => selection.categoryId),
                    practiceCategories,
                  })
                }
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Description</label>
            <SimpleRichEditor
              content={lesson.description || ''}
              onChange={value => onUpdateInfo({ description: value })}
              placeholder="Enter lesson description..."
              rows={2}
              className="w-full text-sm"
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
            <div className="flex min-w-0 items-start gap-2">
              <Search className="mt-0.5 h-4 w-4 flex-shrink-0 text-roman-red" />
              <div>
                <label htmlFor="show-word-search" className="block text-sm font-medium text-gray-800">
                  Show word search
                </label>
                <p className="mt-0.5 text-xs text-gray-500">
                  Allow students to search the full vocabulary database from this lesson.
                </p>
              </div>
            </div>
            <Switch
              id="show-word-search"
              checked={lesson.showWordSearch ?? true}
              disabled={disabled}
              onCheckedChange={showWordSearch => onUpdateInfo({ showWordSearch })}
              aria-label="Show word search in this lesson"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Library className="h-4 w-4" />
            Vocabulary Pool
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-3">
          <VocabularyPoolSelector
            selectedPoolId={lesson.vocabulary_pool}
            onPoolSelect={poolId => onUpdateInfo({ vocabulary_pool: poolId })}
          />
        </CardContent>
      </Card>

      <ConfirmationDialog
        isOpen={pendingType !== null}
        onClose={() => setPendingType(null)}
        onConfirm={() => {
          if (pendingType) applyTypeChange(pendingType);
          setPendingType(null);
        }}
        title="Change lesson type?"
        description="Changing the lesson type will clear the selected practice categories because categories only apply to one lesson type. This cannot be undone after you confirm."
        confirmText="Change type and clear categories"
        cancelText="Keep current type"
      />
    </div>
  );
};
