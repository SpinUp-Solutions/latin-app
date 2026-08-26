import React from 'react';
import { DiagramAuditSubmission, SentenceDiagramStudent } from '@/src/features/sentence-diagramming';
import { SentenceDiagrammingExercise as SentenceDiagrammingExerciseType } from '@/src/types/exercises/sentence-diagramming';
import type {
  ExerciseAnswer,
  ExerciseAnswerHandler,
  ExerciseCompletionHandler,
  RuntimeMode,
} from '@/src/types/runtime-mode';

interface SentenceDiagrammingExerciseProps {
  exercise: SentenceDiagrammingExerciseType;
  onComplete?: (score: number) => void;
  onCompletionAccepted?: ExerciseCompletionHandler;
  runtimeMode?: RuntimeMode;
  onAnswer?: ExerciseAnswerHandler;
  initialAnswer?: ExerciseAnswer;
  onAttempt?: (attempt: DiagramAuditSubmission) => void;
}

export const SentenceDiagrammingExercise: React.FC<SentenceDiagrammingExerciseProps> = ({
  exercise,
  onComplete,
  onCompletionAccepted,
  runtimeMode,
  onAnswer,
  initialAnswer,
  onAttempt,
}) => {
  return (
    <SentenceDiagramStudent
      exercise={exercise}
      onComplete={onComplete}
      onCompletionAccepted={onCompletionAccepted}
      runtimeMode={runtimeMode}
      onAnswer={onAnswer}
      initialAnswer={initialAnswer}
      onAttempt={onAttempt}
    />
  );
};
