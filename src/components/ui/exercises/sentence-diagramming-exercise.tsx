import React from 'react';
import { SentenceDiagramStudent } from '@/src/features/sentence-diagramming';
import { SentenceDiagrammingExercise as SentenceDiagrammingExerciseType } from '@/src/types/exercises/sentence-diagramming';

interface SentenceDiagrammingExerciseProps {
  exercise: SentenceDiagrammingExerciseType;
  onComplete?: (score: number) => void;
}

export const SentenceDiagrammingExercise: React.FC<SentenceDiagrammingExerciseProps> = ({ exercise, onComplete }) => {
  return <SentenceDiagramStudent exercise={exercise} onComplete={onComplete} />;
};
