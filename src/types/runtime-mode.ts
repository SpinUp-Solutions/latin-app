import type { DiagramAnnotation } from '@/src/features/sentence-diagramming/model';

export type RuntimeMode = 'practice' | 'test' | 'preview';

export type ExerciseAnswer =
  | { type: 'matching'; matches: Record<string, string> }
  | { type: 'fill'; answers: string[] }
  | { type: 'multiple-choice'; selectedOptionIds: string[] }
  | { type: 'odd-one-out'; selectedItemId: string; explanation: string }
  | { type: 'text-selection'; selectedWordIndices: number[] }
  | { type: 'fill-embolded-text'; answers: string[] }
  | { type: 'table-fill'; answers: Record<string, string> }
  | { type: 'click-on-multiple-words'; selectedWordIndices: number[] }
  | { type: 'generated-translation'; answers: string[] }
  | { type: 'generated-form-identification'; answers: Record<string, string> }
  | { type: 'sentence-diagramming'; annotations: DiagramAnnotation[] };

export interface ExerciseAnswerEvent {
  exerciseId: string;
  answer: ExerciseAnswer;
  pageIndex?: number;
  itemIndex?: number;
}

export type ExerciseAnswerHandler = (answer: ExerciseAnswer) => void;

export const resolveRuntimeMode = (runtimeMode?: RuntimeMode, testMode?: boolean): RuntimeMode =>
  runtimeMode ?? (testMode ? 'test' : 'practice');
