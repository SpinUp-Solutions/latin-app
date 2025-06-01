'use client';

import React from 'react';

type LessonMode = 'introduction' | 'exercise';

interface LessonProgressBarProps {
  introLength: number;
  exerciseLength: number;
  currentIntroIndex: number;
  currentExerciseIndex: number;
  mode: LessonMode;
  introCompleted: boolean;
}

interface ProgressSectionProps {
  length: number;
  currentIndex: number;
  isActive: boolean;
  baseColor: string;
  keyPrefix: string;
}

const ProgressSection: React.FC<ProgressSectionProps> = ({ length, currentIndex, isActive, baseColor, keyPrefix }) => {
  return (
    <div className="flex-1 flex gap-0.5">
      {Array.from({ length }).map((_, index) => (
        <div
          key={`${keyPrefix}-${index}`}
          className={`flex-1 h-2 rounded-sm transition-all duration-300 ${
            isActive && index <= currentIndex ? baseColor : 'bg-roman-marble'
          }`}
        />
      ))}
    </div>
  );
};

export const LessonProgressBar: React.FC<LessonProgressBarProps> = ({
  introLength,
  exerciseLength,
  currentIntroIndex,
  currentExerciseIndex,
  mode,
  introCompleted,
}) => {
  const introProgress = currentIntroIndex + 1;
  const exerciseProgress = mode === 'exercise' ? currentExerciseIndex + 1 : 0;

  return (
    <div className="w-full mb-6">
      {/* Progress labels */}
      <div className="flex justify-between text-xs text-roman-stone mb-2">
        <span>
          Introduction ({introProgress}/{introLength})
        </span>
        <span>
          Exercises ({exerciseProgress}/{exerciseLength})
        </span>
      </div>

      {/* Progress bars */}
      <div className="flex w-full gap-1">
        {/* Introduction progress */}
        <ProgressSection
          length={introLength}
          currentIndex={currentIntroIndex}
          isActive={true}
          baseColor="bg-roman-terracotta"
          keyPrefix="intro"
        />

        {/* Separator */}
        <div className="w-1" />

        {/* Exercise progress */}
        <ProgressSection
          length={exerciseLength}
          currentIndex={currentExerciseIndex}
          isActive={introCompleted}
          baseColor="bg-roman-green"
          keyPrefix="exercise"
        />
      </div>
    </div>
  );
};

export default LessonProgressBar;
