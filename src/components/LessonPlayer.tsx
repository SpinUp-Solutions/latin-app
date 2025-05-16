'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Lesson, IntroductionPage, ContentItem } from '@/src/types/lesson';
import { BookOpen, Play, Pause, SkipForward, SkipBack, Check } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { RomanCard, RomanCardHeader, RomanCardContent } from '@/src/components/ui/roman-card';
import ContentRenderer from './lesson/ContentRenderer';
import useAudio from '@/src/hooks/useAudio';

interface LessonPlayerProps {
  lesson: Lesson;
}

type LessonMode = 'introduction' | 'exercise';

export const LessonPlayer: React.FC<LessonPlayerProps> = ({ lesson }) => {
  const [mode, setMode] = useState<LessonMode>('introduction');
  const [currentIntroIndex, setCurrentIntroIndex] = useState(0);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [introCompleted, setIntroCompleted] = useState(false);

  const currentIntroPage: IntroductionPage | undefined =
    mode === 'introduction' ? lesson.introduction[currentIntroIndex] : undefined;
  const currentExercise = mode === 'exercise' ? lesson.exercises[currentExerciseIndex] : undefined;
  const currentContentForAudio = mode === 'introduction' ? currentIntroPage : currentExercise;

  const handleAudioEnded = useCallback(() => {
    console.log('Audio ended - advancing to next content');
    handleNext();
  }, []);

  const { audioRef, isPlaying, togglePlay } = useAudio(currentContentForAudio?.audioPath, handleAudioEnded);

  useEffect(() => {
    if (audioRef.current && currentContentForAudio?.audioPath) {
      console.log(`Updating audio source directly: ${currentContentForAudio.audioPath}`);
      audioRef.current.src = currentContentForAudio.audioPath;
    }
  }, [currentContentForAudio, audioRef]);

  function handleNext() {
    if (mode === 'introduction') {
      if (currentIntroIndex < lesson.introduction.length - 1) {
        console.log(`Moving to next intro page: ${currentIntroIndex + 1}`);
        setCurrentIntroIndex(currentIntroIndex + 1);
      } else {
        console.log('Introduction completed, moving to exercises');
        setIntroCompleted(true);
        setMode('exercise');
        setCurrentExerciseIndex(0);
      }
    } else {
      if (currentExerciseIndex < lesson.exercises.length - 1) {
        console.log(`Moving to next exercise: ${currentExerciseIndex + 1}`);
        setCurrentExerciseIndex(currentExerciseIndex + 1);
      } else {
        console.log('All exercises completed, looping back to first exercise');
        setCurrentExerciseIndex(0);
      }
    }
  }

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

  if (!lesson || (mode === 'introduction' && !currentIntroPage) || (mode === 'exercise' && !currentExercise)) {
    return (
      <div className="min-h-[300px] flex items-center justify-center bg-roman-marble">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-roman-red"></div>
      </div>
    );
  }

  const displayContentId = mode === 'introduction' ? currentIntroPage!.id : currentExercise!.id;
  const displayAudioPath = mode === 'introduction' ? currentIntroPage!.audioPath : currentExercise!.audioPath;
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
              <h3 className="text-xl font-serif">{lesson.title}</h3>
              <p className="text-sm text-roman-stone">{lesson.description}</p>
            </div>
          </div>
        </RomanCardHeader>

        <RomanCardContent>
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

            <div className="lesson-content space-y-6">
              {mode === 'introduction' && currentIntroPage && (
                <>
                  {currentIntroPage.title && (
                    <h2 className="text-xl font-serif text-roman-red mb-4">{currentIntroPage.title}</h2>
                  )}
                  {currentIntroPage.items.map((item: ContentItem) => (
                    <ContentRenderer key={item.id} content={item} onComplete={handleNext} />
                  ))}
                </>
              )}
              {mode === 'exercise' && currentExercise && (
                <ContentRenderer content={currentExercise} onComplete={handleNext} />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-4">
            <div className="text-sm text-roman-stone">
              {mode === 'introduction' ? 'Introduction' : 'Exercise'} • {progress}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevious}
                className="rounded-full"
                disabled={mode === 'introduction' && currentIntroIndex === 0}>
                <SkipBack className="h-4 w-4" />
              </Button>

              {hasAudio ? (
                <Button variant="outline" size="icon" onClick={togglePlay} className="rounded-full">
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              ) : (
                <Button variant="outline" size="icon" disabled className="rounded-full opacity-50 cursor-not-allowed">
                  <Play className="h-4 w-4" />
                </Button>
              )}

              <Button variant="outline" size="icon" onClick={handleNext} className="rounded-full">
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </RomanCardContent>
      </RomanCard>
    </div>
  );
};

export default LessonPlayer;
