'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { Lesson } from '@/src/types/lesson';
import { BookOpen } from 'lucide-react';
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { LessonProgress } from '../core/lesson-progress';
import PageTemplate from './page-template';
import useAudio from '@/src/hooks/useAudio';
import LessonNavigation from '../exercises/lesson-navigation';
import { RootState } from '@/src/store';
import {
  useMarkExerciseCompleteMutation,
  useUpdatePageProgressMutation,
  useGetBatchUserProgressQuery,
} from '@/src/store/api/progressApi';

interface LessonPlayerProps {
  lesson: Lesson;
}

export const LessonPlayer: React.FC<LessonPlayerProps> = ({ lesson }) => {
  const { user } = useSelector((state: RootState) => state.auth);
  const [markExerciseComplete] = useMarkExerciseCompleteMutation();
  const [updatePageProgress] = useUpdatePageProgressMutation();

  const { data: userProgress } = useGetBatchUserProgressQuery(user?.uid || '', {
    skip: !user?.uid,
  });

  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  useEffect(() => {
    if (userProgress?.[lesson.id]?.currentPageIndex !== undefined) {
      setCurrentPageIndex(userProgress[lesson.id].currentPageIndex);
    }
  }, [userProgress, lesson.id]);

  const currentPage = lesson.pages[currentPageIndex];
  const totalPages = lesson.pages.length;

  const handleNext = useCallback(() => {
    if (currentPageIndex < totalPages - 1) {
      const newPageIndex = currentPageIndex + 1;
      setCurrentPageIndex(newPageIndex);

      if (user?.uid && newPageIndex > (userProgress?.[lesson.id]?.currentPageIndex || 0)) {
        updatePageProgress({
          userId: user.uid,
          lessonId: lesson.id,
          currentPageIndex: newPageIndex,
        });
      }
    }
  }, [currentPageIndex, totalPages, user?.uid, lesson.id, userProgress, updatePageProgress]);

  const handlePageComplete = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const handlePrevious = useCallback(() => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  }, [currentPageIndex]);

  const handleAudioEnded = useCallback(() => {
    handleNext();
  }, [handleNext]);

  const { audioRef, isPlaying, togglePlay } = useAudio(currentPage?.audioPath, handleAudioEnded);

  const handleExerciseComplete = useCallback(
    (itemIndex: number, score: number) => {
      if (!user?.uid) return;

      const exerciseId = `page${currentPageIndex}-item${itemIndex}`;
      markExerciseComplete({
        userId: user.uid,
        lessonId: lesson.id,
        exerciseId,
        score,
      });
    },
    [markExerciseComplete, user?.uid, lesson.id, currentPageIndex]
  );

  if (!lesson || !currentPage) {
    return (
      <div className="min-h-[300px] flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  const hasAudio = Boolean(currentPage.audioPath);

  return (
    <div className="lesson-player">
      <audio ref={audioRef} className="hidden" controls preload="auto" />

      <RomanCard>
        <RomanCardHeader>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-roman-parchment flex items-center justify-center flex-shrink-0 border border-roman-terracotta/20">
              <BookOpen className="h-6 w-6 text-roman-terracotta" />
            </div>
            <div>
              <h3 className="text-xl font-serif">
                <SimpleRichDisplay content={lesson.title} />
              </h3>
              <p className="text-sm text-roman-stone">
                <SimpleRichDisplay content={lesson.description || ''} />
              </p>
            </div>
          </div>
        </RomanCardHeader>

        <RomanCardContent>
          <div className="mb-4">
            <LessonProgress currentPage={currentPageIndex} totalPages={totalPages} />
          </div>

          <div className="mb-6">
            <div className="text-xs text-gray-400 mb-2">
              <div>Page ID: {currentPage.id}</div>
              <div>Audio path: {currentPage.audioPath || 'none'}</div>
              <div>Playing: {isPlaying ? 'Yes' : 'No'}</div>
            </div>

            <div className="lesson-content">
              <AnimatePresence mode="wait">
                <PageTemplate
                  key={currentPage.id}
                  page={currentPage}
                  pageIndex={currentPageIndex}
                  onExerciseComplete={handleExerciseComplete}
                  onPageComplete={handlePageComplete}
                />
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <LessonNavigation
              onPrevious={handlePrevious}
              onNext={handleNext}
              onTogglePlay={togglePlay}
              isPlaying={isPlaying}
              hasAudio={hasAudio}
              canGoPrevious={currentPageIndex > 0}
              canGoNext={currentPageIndex < totalPages - 1}
            />
          </div>
        </RomanCardContent>
      </RomanCard>
    </div>
  );
};

export default LessonPlayer;
