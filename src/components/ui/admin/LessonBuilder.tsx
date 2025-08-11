'use client';

import React, { useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { BookOpen, Target } from 'lucide-react';
import { Lesson } from '@/src/types/lesson';
import { RenderableContentItem } from '@/src/types/page';

// Redux hooks and actions
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import {
  setLesson,
  updateLessonInfo,
  addIntroductionPage,
  addExercisePage,
  updatePageTitle,
  addContentToPage,
  removeContent,
  removePage,
  startEditingContent,
} from '@/src/store/slices/lessonSlice';

// Components
import { LessonInfoForm } from './lesson-builder/LessonInfoForm';
import { PageSection } from './lesson-builder/PageSection';
import { LessonPreview } from './lesson-builder/LessonPreview';
import { PageType } from '@/src/types/clipboard';

import { CONTENT_TYPES, EXERCISE_TYPES } from '@/src/utils/contentTypeConstants';
import { ContentEditor } from './ContentEditor';
import { useClipboard, ClipboardPanel } from '../core/clipboard';

interface LessonBuilderProps {
  initialLesson?: Lesson;
  onSave: (lesson: Lesson) => void;
}

export const LessonBuilder: React.FC<LessonBuilderProps> = ({ initialLesson, onSave }) => {
  const dispatch = useAppDispatch();
  const { currentLesson, saving } = useAppSelector(state => state.lesson);
  const { pasteBulk } = useClipboard();

  useEffect(() => {
    dispatch(setLesson(initialLesson));
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

  const handleEditContent = (pageType: 'introduction' | 'exercises', pageIndex: number, itemIndex: number) => {
    dispatch(startEditingContent({ pageType, pageIndex, itemIndex }));
  };

  // Handle page title updates
  const handleUpdatePageTitle = (pageType: 'introduction' | 'exercises') => (pageIndex: number, title: string) => {
    dispatch(updatePageTitle({ pageType, pageIndex, title }));
  };

  // Handle content operation
  const handleAddContent =
    (pageType: 'introduction' | 'exercises') => (pageIndex: number, content: RenderableContentItem) => {
      dispatch(addContentToPage({ pageType, pageIndex, content }));
    };

  const handleEditContentWrapper =
    (pageType: 'introduction' | 'exercises') => (pageIndex: number, itemIndex: number) => {
      handleEditContent(pageType, pageIndex, itemIndex);
    };

  const handleRemoveContent = (pageType: 'introduction' | 'exercises') => (pageIndex: number, itemIndex: number) => {
    dispatch(removeContent({ pageType, pageIndex, itemIndex }));
  };

  const handleRemovePage = (pageType: 'introduction' | 'exercises') => (pageIndex: number) => {
    dispatch(removePage({ pageType, pageIndex }));
  };

  const handleAddIntroductionPage = () => {
    dispatch(addIntroductionPage());
  };

  const handleAddExercisePage = () => {
    dispatch(addExercisePage());
  };

  const handlePasteBulk = (selectedIndices: number[]) => {
    const targetPageType: PageType = 'introduction';
    const targetPageIndex = 0;

    if (currentLesson.introduction.length === 0) {
      dispatch(addIntroductionPage());
    }

    pasteBulk({ pageType: targetPageType, pageIndex: targetPageIndex }, selectedIndices);
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

          {/* Introduction Pages */}
          <PageSection
            title="Introduction Pages"
            icon={BookOpen}
            pages={currentLesson.introduction}
            pageType="introduction"
            contentTypes={CONTENT_TYPES}
            onAddPage={handleAddIntroductionPage}
            onRemovePage={handleRemovePage('introduction')}
            onUpdatePageTitle={handleUpdatePageTitle('introduction')}
            onAddContent={handleAddContent('introduction')}
            onEditContent={handleEditContentWrapper('introduction')}
            onRemoveContent={handleRemoveContent('introduction')}
          />

          {/* Exercise Pages */}
          <PageSection
            title="Exercise Pages"
            icon={Target}
            pages={currentLesson.exercises}
            pageType="exercises"
            contentTypes={EXERCISE_TYPES}
            onAddPage={handleAddExercisePage}
            onRemovePage={handleRemovePage('exercises')}
            onUpdatePageTitle={handleUpdatePageTitle('exercises')}
            onAddContent={handleAddContent('exercises')}
            onEditContent={handleEditContentWrapper('exercises')}
            onRemoveContent={handleRemoveContent('exercises')}
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
