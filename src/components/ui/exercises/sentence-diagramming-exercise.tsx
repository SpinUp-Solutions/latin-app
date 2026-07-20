import React from 'react';
import { DiagramAttempt, SentenceDiagramStudent } from '@/src/features/sentence-diagramming';
import { SentenceDiagrammingExercise as SentenceDiagrammingExerciseType } from '@/src/types/exercises/sentence-diagramming';
import type { ExerciseAnswerHandler, RuntimeMode } from '@/src/types/runtime-mode';

interface SentenceDiagrammingExerciseProps {
  exercise: SentenceDiagrammingExerciseType;
  onComplete?: (score: number) => void;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  testMode?: boolean;
  onAttempt?: (attempt: DiagramAttempt) => void;
}

export const SentenceDiagrammingExercise: React.FC<SentenceDiagrammingExerciseProps> = ({
  exercise,
  onComplete,
  runtimeMode,
  onAnswer,
  testMode,
  onAttempt,
}) => {
  return (
    <SentenceDiagramStudent
      exercise={exercise}
      onComplete={onComplete}
      runtimeMode={runtimeMode}
      onAnswer={onAnswer}
      testMode={testMode}
      onAttempt={onAttempt}
    />
  );
};
