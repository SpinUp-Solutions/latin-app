import { z } from 'zod';

export const FormIdentificationStepSchema = z.enum([
  'conjugation',
  'declension',
  'tense',
  'voice',
  'mood',
  'person',
  'number',
  'case',
  'gender',
  'degree',
]);

export type FormIdentificationStep = z.infer<typeof FormIdentificationStepSchema>;

export const FormIdentificationItemSchema = z.object({
  id: z.string(),
  wordId: z.string(),
  word: z.string(),
  root_word: z.string(),
  selected_form: z.string(),
  step: FormIdentificationStepSchema,
  correctAnswer: z.string(),
  acceptedAnswers: z.array(z.string()),
  hint: z.string().optional(),
  primaryFormPaths: z.array(z.record(z.string(), z.string().optional())),
  optionalFormPaths: z.array(z.record(z.string(), z.string().optional())),
});

export type FormIdentificationItem = z.infer<typeof FormIdentificationItemSchema>;

export const SingleFieldFormIdentificationItemSchema = z.object({
  id: z.string(),
  wordId: z.string(),
  word: z.string(),
  root_word: z.string(),
  selected_form: z.string(),
  steps: z.array(FormIdentificationStepSchema),
  correctAnswerDisplay: z.string(),
  hint: z.string().optional(),
  primaryFormPaths: z.array(z.record(z.string(), z.string().optional())),
  optionalFormPaths: z.array(z.record(z.string(), z.string().optional())),
});

export type SingleFieldFormIdentificationItem = z.infer<typeof SingleFieldFormIdentificationItemSchema>;
