'use client';

import React from 'react';
import { Button } from '@/src/components/ui/button';
import { BookOpen } from 'lucide-react';
import { Lesson } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';

// Redux hooks and actions
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import {
  updateLessonInfo,
  addPage,
  updatePageTitle,
  addContentToPage,
  removeContent,
  removePage,
  duplicatePage,
  startEditingContent,
} from '@/src/store/slices/lessonEditorSlice';

// Components
import { LessonInfoForm } from './lesson-builder/LessonInfoForm';
import { PageSection } from './lesson-builder/PageSection';
import { LessonPreview } from './lesson-builder/LessonPreview';

import {
  ALL_CONTENT_TYPES,
  SENTENCE_DIAGRAMMING_LESSON_CONTENT_TYPES,
  LISTENING_LESSON_CONTENT_TYPES,
} from '@/src/utils/contentTypeConstants';
import { ContentEditor } from './ContentEditor';
import { useClipboard, ClipboardPanel } from '../core/clipboard';
import {
  formatFormIdentificationConfigurationIssue,
  getGeneratedFormIdentificationConfigurationIssues,
} from '@/src/utils/exercises/formIdentificationConfiguration';

interface LessonBuilderProps {
  initialLesson?: Lesson;
  onSave: (lesson: Lesson) => void;
  saving?: boolean;
}

export const LessonBuilder: React.FC<LessonBuilderProps> = ({ initialLesson, onSave, saving }) => {
  const dispatch = useAppDispatch();
  const { currentLesson } = useAppSelector(state => state.lessonEditor);
  const { pasteBulk } = useClipboard();
  const isNewLesson = !initialLesson;
  const isSaving = saving ?? false;

  if (!currentLesson) {
    return <div>Loading lesson...</div>;
  }

  const formIdentificationIssues = getGeneratedFormIdentificationConfigurationIssues(currentLesson.pages);
  const hasFormIdentificationIssues = formIdentificationIssues.length > 0;

  const handleSaveLesson = () => {
    if (hasFormIdentificationIssues) return;
    onSave(currentLesson);
  };

  const handleUpdateLessonInfo = (
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
  ) => {
    dispatch(updateLessonInfo(updates));
  };

  const handleEditContent = (pageIndex: number, itemIndex: number) => {
    dispatch(startEditingContent({ pageIndex, itemIndex }));
  };

  // Handle page title updates
  const handleUpdatePageTitle = (pageIndex: number, title: string) => {
    dispatch(updatePageTitle({ pageIndex, title }));
  };

  // Handle content operation
  const handleAddContent = (pageIndex: number, content: RenderableContentItem) => {
    dispatch(addContentToPage({ pageIndex, content }));
  };

  const handleEditContentWrapper = (pageIndex: number, itemIndex: number) => {
    handleEditContent(pageIndex, itemIndex);
  };

  const handleRemoveContent = (pageIndex: number, itemIndex: number) => {
    dispatch(removeContent({ pageIndex, itemIndex }));
  };

  const handleRemovePage = (pageIndex: number) => {
    dispatch(removePage({ pageIndex }));
  };

  const handleAddPage = () => {
    dispatch(addPage());
  };

  const handleDuplicatePage = (pageIndex: number) => {
    dispatch(duplicatePage({ pageIndex }));
  };

  const handlePasteBulk = (selectedIndices: number[]) => {
    const targetPageIndex = 0;

    if (currentLesson.pages.length === 0) {
      dispatch(addPage());
    }

    pasteBulk({ pageIndex: targetPageIndex }, selectedIndices);
  };

  return (
    <>
      <div className="flex h-full bg-gray-50">
        {/* Left Panel - Editor */}
        <div className="w-1/2 overflow-y-auto p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between bg-white border rounded-md p-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Lesson Builder</h1>
              <p className="text-xs text-gray-500">Create and edit lesson content</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveLesson} disabled={isSaving || hasFormIdentificationIssues} size="sm">
                {isSaving ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  'Save Lesson'
                )}
              </Button>
            </div>
          </div>

          {hasFormIdentificationIssues && (
            <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Fix the morphology configuration before saving:</p>
              <ul className="mt-1 list-disc pl-5">
                {formIdentificationIssues.map(issue => (
                  <li key={`${issue.pageIndex}-${issue.itemIndex}-${issue.message}`}>
                    {formatFormIdentificationConfigurationIssue(issue)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Lesson Info */}
          <LessonInfoForm
            lesson={currentLesson}
            onUpdateInfo={handleUpdateLessonInfo}
            isNewLesson={isNewLesson}
            disabled={isSaving}
          />

          {/* Pages */}
          <PageSection
            title="Pages"
            icon={BookOpen}
            pages={currentLesson.pages}
            contentTypes={
              currentLesson.type === 'sentence-diagramming'
                ? SENTENCE_DIAGRAMMING_LESSON_CONTENT_TYPES
                : currentLesson.type === 'listening'
                  ? LISTENING_LESSON_CONTENT_TYPES
                  : ALL_CONTENT_TYPES
            }
            onAddPage={handleAddPage}
            onRemovePage={handleRemovePage}
            onDuplicatePage={handleDuplicatePage}
            onUpdatePageTitle={handleUpdatePageTitle}
            onAddContent={handleAddContent}
            onEditContent={handleEditContentWrapper}
            onRemoveContent={handleRemoveContent}
          />
        </div>

        {/* Right Panel - Live Preview */}
        <LessonPreview lesson={currentLesson} />
      </div>

      {/* Content Editor Modal */}
      <ContentEditor />

      {/* Clipboard Panel */}
      <ClipboardPanel onPasteBulk={handlePasteBulk} />
    </>
  );
};
