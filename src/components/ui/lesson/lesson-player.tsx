'use client';

import React, { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LessonWithProgress } from '@/src/types/lesson';
import { BookOpen, CheckCircle } from 'lucide-react';
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import { LessonProgress } from '../core/lesson-progress';
import { Button } from '@/src/components/ui/button';
import PageTemplate from './page-template';
import useAudio from '@/src/hooks/useAudio';
import LessonNavigation from '../exercises/lesson-navigation';
import {
  useMarkExerciseCompleteMutation,
  useUpdatePageProgressMutation,
  useMarkLessonCompleteMutation,
} from '@/src/store/api/lessonApi';
import { useAuth } from '@/src/hooks/useAuth';
import { toast } from 'sonner';

interface LessonPlayerProps {
  lesson: LessonWithProgress;
}

export const LessonPlayer: React.FC<LessonPlayerProps> = ({ lesson }) => {
  const { user } = useAuth();
  const [markExerciseComplete] = useMarkExerciseCompleteMutation();
  const [updatePageProgress] = useUpdatePageProgressMutation();
  const [markLessonComplete] = useMarkLessonCompleteMutation();

  const [currentPageIndex, setCurrentPageIndex] = useState(
    Math.min(lesson.currentPageIndex || 0, lesson.pages.length - 1)
  );

  const currentPage = lesson.pages[currentPageIndex];
  const totalPages = lesson.pages.length;

  const handleNext = useCallback(() => {
    if (currentPageIndex < totalPages - 1) {
      const newPageIndex = currentPageIndex + 1;
      setCurrentPageIndex(newPageIndex);

      if (user?.uid && newPageIndex > (lesson.currentPageIndex || 0)) {
        updatePageProgress({
          userId: user.uid,
          lessonId: lesson.id,
          currentPageIndex: newPageIndex,
        });
      }
    }
  }, [currentPageIndex, totalPages, user?.uid, lesson.id, lesson.currentPageIndex, updatePageProgress]);

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

  const isListeningLesson = lesson.type === 'listening';
  const isLessonCompleted = lesson.status === 'completed';

  const handleMarkLessonComplete = useCallback(async () => {
    if (!user?.uid) return;
    try {
      await markLessonComplete({ userId: user.uid, lessonId: lesson.id, score: 100 }).unwrap();
      toast.success('Lesson marked as completed!');
    } catch {
      toast.error('Failed to mark lesson as completed');
    }
  }, [user?.uid, lesson.id, markLessonComplete]);

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
              <div className="text-sm text-roman-stone">
                <SimpleRichDisplay content={lesson.description || ''} />
              </div>
            </div>
          </div>
        </RomanCardHeader>

        <RomanCardContent>
          <div className="mb-4">
            <LessonProgress currentPage={currentPageIndex} totalPages={totalPages} />
          </div>

          <div className="mb-6">
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

          {isListeningLesson && (
            <div className="flex justify-center pt-4 border-t border-border mt-4">
              {isLessonCompleted ? (
                <div className="text-roman-green font-medium flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Completed
                </div>
              ) : (
                <Button
                  onClick={handleMarkLessonComplete}
                  variant="outline"
                  className="text-roman-green border-roman-green/30 hover:bg-roman-green/10">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark as Completed
                </Button>
              )}
            </div>
          )}
        </RomanCardContent>
      </RomanCard>
    </div>
  );
};

export default LessonPlayer;
