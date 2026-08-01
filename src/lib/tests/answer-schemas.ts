import { z } from 'zod';
import type { ExerciseAnswer } from '@/src/types/runtime-mode';
import { ANNOTATION_SPECS } from '@/src/features/sentence-diagramming/annotation-spec';

const stringArray = z.array(z.string());

const diagramAnnotationSchema = z
  .object({
    id: z.string(),
    kind: z.string().refine(kind => kind in ANNOTATION_SPECS, 'Invalid sentence-diagram annotation kind'),
    span: z
      .object({
        startTokenIndex: z.number().int().nonnegative(),
        endTokenIndex: z.number().int().nonnegative(),
        startCharOffset: z.number().int().nonnegative(),
        endCharOffset: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const EXERCISE_ANSWER_SCHEMAS = {
  matching: z.object({ type: z.literal('matching'), rounds: z.array(z.record(z.string(), z.string())) }).strict(),
  fill: z.object({ type: z.literal('fill'), answers: stringArray }).strict(),
  'multiple-choice': z.object({ type: z.literal('multiple-choice'), selectedOptionIds: stringArray }).strict(),
  'odd-one-out': z
    .object({
      type: z.literal('odd-one-out'),
      selectedItemId: z.string(),
      explanation: z.string(),
    })
    .strict(),
  'text-selection': z
    .object({ type: z.literal('text-selection'), selectedWordIndices: z.array(z.number().int()) })
    .strict(),
  'fill-embolded-text': z.object({ type: z.literal('fill-embolded-text'), answers: stringArray }).strict(),
  'table-fill': z.object({ type: z.literal('table-fill'), answers: z.record(z.string(), z.string()) }).strict(),
  'click-on-multiple-words': z
    .object({
      type: z.literal('click-on-multiple-words'),
      selectedWordIndices: z.array(z.number().int().nonnegative()),
    })
    .strict(),
  'generated-translation': z.object({ type: z.literal('generated-translation'), answers: stringArray }).strict(),
  'generated-form-identification': z
    .object({
      type: z.literal('generated-form-identification'),
      answers: z.record(z.string(), z.string()),
    })
    .strict(),
  'sentence-diagramming': z
    .object({
      type: z.literal('sentence-diagramming'),
      annotations: z.array(diagramAnnotationSchema),
    })
    .strict(),
} as const;

export function parseExerciseAnswer(value: unknown): ExerciseAnswer {
  if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') {
    throw new Error('Exercise answer must include a type');
  }

  const schema = EXERCISE_ANSWER_SCHEMAS[value.type as keyof typeof EXERCISE_ANSWER_SCHEMAS];
  if (!schema) {
    throw new Error(`Unsupported exercise answer type: ${value.type}`);
  }

  return schema.parse(value) as ExerciseAnswer;
}

export function isAnswerForExercise(answer: ExerciseAnswer, exerciseType: string): boolean {
  return answer.type === exerciseType;
}
