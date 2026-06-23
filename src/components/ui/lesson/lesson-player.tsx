'use client';

import React, { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LessonWithProgress } from '@/src/types/lesson';
import { BookOpen, Headphones, CheckCircle } from 'lucide-react';
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '../core/simple-rich-display';
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
  navigationPlacement?: 'fixed' | 'contained';
}

export const LessonPlayer: React.FC<LessonPlayerProps> = ({ lesson, navigationPlacement = 'fixed' }) => {
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

  const handleGoToPage = useCallback(
    (newPageIndex: number) => {
      if (newPageIndex < 0 || newPageIndex >= totalPages || newPageIndex === currentPageIndex) return;
      setCurrentPageIndex(newPageIndex);

      if (user?.uid && newPageIndex > (lesson.currentPageIndex || 0)) {
        updatePageProgress({
          userId: user.uid,
          lessonId: lesson.id,
          currentPageIndex: newPageIndex,
        });
      }
    },
    [currentPageIndex, totalPages, user?.uid, lesson.id, lesson.currentPageIndex, updatePageProgress]
  );

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
        <RomanCardHeader className="relative overflow-hidden border-b border-roman-red/10 bg-roman-parchment/30">
          {/* Decorative top accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-roman-red" />

          <div className="relative flex items-start gap-4 pt-3">
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-full bg-roman-parchment flex items-center justify-center border-2 border-roman-gold/40 shadow-sm">
                {isListeningLesson ? (
                  <Headphones className="h-7 w-7 text-roman-red" />
                ) : (
                  <BookOpen className="h-7 w-7 text-roman-red" />
                )}
              </div>
              {isLessonCompleted && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-roman-green text-white flex items-center justify-center border-2 border-white shadow-sm">
                  <CheckCircle className="h-3.5 w-3.5" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-roman-red/8 px-2.5 py-0.5 text-xs font-medium text-roman-red border border-roman-red/15">
                  {isListeningLesson ? (
                    <>
                      <Headphones className="h-3 w-3" />
                      Listening
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-3 w-3" />
                      Lesson
                    </>
                  )}
                </span>
                <span className="text-xs text-roman-stone tabular-nums">
                  Page {currentPageIndex + 1} of {totalPages}
                </span>
              </div>

              <h3 className="text-2xl font-serif text-roman-red leading-tight tracking-wide">
                <SimpleRichDisplay content={lesson.title} />
              </h3>

              {lesson.description && (
                <div className="text-sm text-roman-stone mt-1 leading-relaxed line-clamp-2">
                  <SimpleRichDisplay content={lesson.description} />
                </div>
              )}
            </div>
          </div>
        </RomanCardHeader>

        <RomanCardContent>
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

          <LessonNavigation
            currentPageIndex={currentPageIndex}
            totalPages={totalPages}
            pageTitles={lesson.pages.map(page => page.title)}
            placement={navigationPlacement}
            onPrevious={handlePrevious}
            onNext={handleNext}
            onGoToPage={handleGoToPage}
            onTogglePlay={togglePlay}
            isPlaying={isPlaying}
            hasAudio={hasAudio}
          />
        </RomanCardContent>
      </RomanCard>
    </div>
  );
};

export default LessonPlayer;
