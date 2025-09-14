'use client';

import React, { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { Lesson, IntroductionPage, ExercisePage } from '@/src/types/lesson';
import { BookOpen, Check } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/core/roman-card';
import { SimpleRichDisplay } from '../core/simple-rich-display';
import PageTemplate from './page-template';
import useAudio from '@/src/hooks/useAudio';
import LessonProgressBar from './lesson-progress-bar';
import LessonNavigation from '../exercises/lesson-navigation';
import { RootState } from '@/src/store';
import { useMarkExerciseCompleteMutation } from '@/src/store/api/progressApi';

interface LessonPlayerProps {
  lesson: Lesson;
}

type LessonMode = 'introduction' | 'exercise';

export const LessonPlayer: React.FC<LessonPlayerProps> = ({ lesson }) => {
  const { user } = useSelector((state: RootState) => state.auth);
  const [markExerciseComplete] = useMarkExerciseCompleteMutation();

  const [mode, setMode] = useState<LessonMode>('introduction');
  const [currentIntroIndex, setCurrentIntroIndex] = useState(0);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [introCompleted, setIntroCompleted] = useState(false);

  const currentIntroPage: IntroductionPage | undefined =
    mode === 'introduction' ? lesson.introduction[currentIntroIndex] : undefined;
  const currentExercisePage: ExercisePage | undefined =
    mode === 'exercise' ? lesson.exercises[currentExerciseIndex] : undefined;
  const currentContentForAudio = mode === 'introduction' ? currentIntroPage : currentExercisePage;

  const handleNext = useCallback(() => {
    if (mode === 'introduction') {
      if (currentIntroIndex < lesson.introduction.length - 1) {
        setCurrentIntroIndex(currentIntroIndex + 1);
      } else {
        setIntroCompleted(true);
        setMode('exercise');
        setCurrentExerciseIndex(0);
      }
    } else {
      if (currentExerciseIndex < lesson.exercises.length - 1) {
        setCurrentExerciseIndex(currentExerciseIndex + 1);
      } else {
        console.log('All exercises completed!');
      }
    }
  }, [mode, currentIntroIndex, lesson.introduction.length, currentExerciseIndex, lesson.exercises.length]);

  const handleAudioEnded = useCallback(() => {
    console.log('Audio ended - advancing to next content');
    handleNext();
  }, [handleNext]);

  const { audioRef, isPlaying, togglePlay } = useAudio(currentContentForAudio?.audioPath, handleAudioEnded);

  const handleExerciseComplete = useCallback(
    (itemIndex: number, score: number) => {
      if (!user?.uid) return;

      const exerciseId = `page${currentExerciseIndex}-item${itemIndex}`;
      markExerciseComplete({
        userId: user.uid,
        lessonId: lesson.id,
        exerciseId,
        score,
      });
    },
    [markExerciseComplete, user?.uid, lesson.id, currentExerciseIndex]
  );

  function handlePrevious() {
    if (mode === 'introduction') {
      if (currentIntroIndex > 0) {
        console.log(`Moving to previous intro page: ${currentIntroIndex - 1}`);
        setCurrentIntroIndex(currentIntroIndex - 1);
      }
    } else {
      if (currentExerciseIndex > 0) {
        console.log(`Moving to previous exercise: ${currentExerciseIndex - 1}`);
        setCurrentExerciseIndex(currentExerciseIndex - 1);
      } else if (introCompleted) {
        console.log('At first exercise, moving back to introduction');
        setMode('introduction');
        setCurrentIntroIndex(lesson.introduction.length - 1);
      }
    }
  }

  function handleSwitchMode(newMode: LessonMode) {
    if (newMode === 'exercise' && !introCompleted) {
      console.log('Cannot switch to exercise mode - intro not completed');
      return;
    }

    console.log(`Switching mode to ${newMode}`);
    setMode(newMode);

    if (newMode === 'introduction') {
      setCurrentIntroIndex(0);
    } else {
      setCurrentExerciseIndex(0);
    }
  }

  if (!lesson || (mode === 'introduction' && !currentIntroPage) || (mode === 'exercise' && !currentExercisePage)) {
    return (
      <div className="min-h-[300px] flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  const displayContentId = mode === 'introduction' ? currentIntroPage!.id : currentExercisePage!.id;
  const displayAudioPath = mode === 'introduction' ? currentIntroPage!.audioPath : currentExercisePage!.audioPath;
  const hasAudio = Boolean(displayAudioPath);

  const totalItems = mode === 'introduction' ? lesson.introduction.length : lesson.exercises.length;
  const currentIndex = mode === 'introduction' ? currentIntroIndex : currentExerciseIndex;
  const progress = `${currentIndex + 1}/${totalItems}`;

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
          <LessonProgressBar
            introLength={lesson.introduction.length}
            exerciseLength={lesson.exercises.length}
            currentIntroIndex={currentIntroIndex}
            currentExerciseIndex={currentExerciseIndex}
            mode={mode}
            introCompleted={introCompleted}
          />

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Button
                variant={mode === 'introduction' ? 'default' : 'outline'}
                onClick={() => handleSwitchMode('introduction')}
                className="flex items-center gap-1">
                {introCompleted && <Check className="h-4 w-4 text-green-500" />}
                Introduction
              </Button>
              <Button
                variant={mode === 'exercise' ? 'default' : 'outline'}
                onClick={() => handleSwitchMode('exercise')}
                disabled={!introCompleted}>
                Exercises
              </Button>
            </div>

            <div className="text-xs text-gray-400 mb-2">
              <div>Content ID: {displayContentId}</div>
              <div>Audio path: {displayAudioPath || 'none'}</div>
              <div>Playing: {isPlaying ? 'Yes' : 'No'}</div>
            </div>

            <div className="lesson-content">
              <AnimatePresence mode="wait">
                {mode === 'introduction' && currentIntroPage && (
                  <PageTemplate key={currentIntroPage.id} page={currentIntroPage} pageIndex={currentIntroIndex} />
                )}
                {mode === 'exercise' && currentExercisePage && (
                  <PageTemplate
                    key={currentExercisePage.id}
                    page={currentExercisePage}
                    pageIndex={currentExerciseIndex}
                    onExerciseComplete={handleExerciseComplete}
                  />
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="text-sm text-roman-stone">
              {mode === 'introduction' ? 'Introduction' : 'Exercise'} • {progress}
            </div>

            <LessonNavigation
              onPrevious={handlePrevious}
              onNext={handleNext}
              onTogglePlay={togglePlay}
              isPlaying={isPlaying}
              hasAudio={hasAudio}
              canGoPrevious={!(mode === 'introduction' && currentIntroIndex === 0)}
            />
          </div>
        </RomanCardContent>
      </RomanCard>
    </div>
  );
};

export default LessonPlayer;
