'use client';

import React, { useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { BookOpen } from 'lucide-react';
import { Lesson } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';

// Redux hooks and actions
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import {
  setLesson,
  updateLessonInfo,
  addPage,
  updatePageTitle,
  addContentToPage,
  removeContent,
  removePage,
  startEditingContent,
  loadTooltips,
} from '@/src/store/slices/lessonEditorSlice';

// Components
import { LessonInfoForm } from './lesson-builder/LessonInfoForm';
import { PageSection } from './lesson-builder/PageSection';
import { LessonPreview } from './lesson-builder/LessonPreview';

import { ALL_CONTENT_TYPES } from '@/src/utils/contentTypeConstants';
import { ContentEditor } from './ContentEditor';
import { useClipboard, ClipboardPanel } from '../core/clipboard';
import { extractTooltipsFromLesson } from '@/src/utils/tooltipUtils';

interface LessonBuilderProps {
  initialLesson?: Lesson;
  onSave: (lesson: Lesson) => void;
}

export const LessonBuilder: React.FC<LessonBuilderProps> = ({ initialLesson, onSave }) => {
  const dispatch = useAppDispatch();
  const { currentLesson, saving } = useAppSelector(state => state.lessonEditor);
  const { pasteBulk } = useClipboard();

  useEffect(() => {
    dispatch(setLesson(initialLesson));
    if (initialLesson) {
      const tooltips = extractTooltipsFromLesson(initialLesson);
      dispatch(loadTooltips(tooltips));
    }
  }, [dispatch, initialLesson]);

  if (!currentLesson) {
    return <div>Loading lesson...</div>;
  }

  const handleSaveLesson = () => {
    onSave(currentLesson);
  };

  const handleUpdateLessonInfo = (updates: Partial<Pick<Lesson, 'id' | 'title' | 'description'>>) => {
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

  const handlePasteBulk = (selectedIndices: number[]) => {
    const targetPageIndex = 0;

    if (currentLesson.pages.length === 0) {
      dispatch(addPage());
    }

    pasteBulk({ pageIndex: targetPageIndex }, selectedIndices);
  };

  return (
    <>
      <div className="flex h-screen bg-roman-marble">
        {/* Left Panel - Editor */}
        <div className="w-1/2 overflow-y-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-serif text-gray-800">Lesson Builder</h1>
              <p className="text-roman-stone">Create and edit lesson content</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveLesson} disabled={saving}>
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  'Save Lesson'
                )}
              </Button>
            </div>
          </div>

          {/* Lesson Info */}
          <LessonInfoForm lesson={currentLesson} onUpdateInfo={handleUpdateLessonInfo} />

          {/* Pages */}
          <PageSection
            title="Pages"
            icon={BookOpen}
            pages={currentLesson.pages}
            contentTypes={ALL_CONTENT_TYPES}
            onAddPage={handleAddPage}
            onRemovePage={handleRemovePage}
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
