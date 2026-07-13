import React from 'react';
import { DiagramAttempt, SentenceDiagramStudent } from '@/src/features/sentence-diagramming';
import { SentenceDiagrammingExercise as SentenceDiagrammingExerciseType } from '@/src/types/exercises/sentence-diagramming';

interface SentenceDiagrammingExerciseProps {
  exercise: SentenceDiagrammingExerciseType;
  onComplete?: (score: number) => void;
  testMode?: boolean;
  onAttempt?: (attempt: DiagramAttempt) => void;
}

export const SentenceDiagrammingExercise: React.FC<SentenceDiagrammingExerciseProps> = ({
  exercise,
  onComplete,
  testMode = false,
  onAttempt,
}) => {
  return (
    <SentenceDiagramStudent exercise={exercise} onComplete={onComplete} testMode={testMode} onAttempt={onAttempt} />
  );
};
