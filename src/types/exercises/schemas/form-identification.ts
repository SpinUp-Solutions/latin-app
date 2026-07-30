import { z } from 'zod';

export const FormIdentificationStepSchema = z.enum([
  'conjugation',
  'declension',
  'tense',
  'voice',
  'verb_form',
  'mood',
  'person',
  'number',
  'case',
  'gender',
  'degree',
  'pronoun_type',
]);

export type FormIdentificationStep = z.infer<typeof FormIdentificationStepSchema>;

export const FormIdentificationItemSchema = z.object({
  id: z.string(),
  wordId: z.string(),
  word: z.string(),
  root_word: z.string(),
  dictionary_entry: z.string().nullable(),
  selected_form: z.string(),
  hasSelectedForm: z.boolean(),
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
  dictionary_entry: z.string().nullable(),
  selected_form: z.string(),
  hasSelectedForm: z.boolean(),
  steps: z.array(FormIdentificationStepSchema),
  correctAnswerDisplay: z.string(),
  hint: z.string().optional(),
  primaryFormPaths: z.array(z.record(z.string(), z.string().optional())),
  optionalFormPaths: z.array(z.record(z.string(), z.string().optional())),
});

export type SingleFieldFormIdentificationItem = z.infer<typeof SingleFieldFormIdentificationItemSchema>;

export const MultiAnswerFormIdentificationItemSchema = z.object({
  id: z.string(),
  wordId: z.string(),
  word: z.string(),
  root_word: z.string(),
  dictionary_entry: z.string().nullable(),
  selected_form: z.string(),
  hasSelectedForm: z.boolean(),
  step: FormIdentificationStepSchema,
  steps: z.array(FormIdentificationStepSchema),
  stepIndex: z.number(),
  totalSteps: z.number(),
  primaryFormPaths: z.array(z.record(z.string(), z.string().optional())),
  optionalFormPaths: z.array(z.record(z.string(), z.string().optional())),
  hint: z.string().optional(),
  expectedAnswerCount: z.number(),
  correctAnswerDisplay: z.string(),
});

export type MultiAnswerFormIdentificationItem = z.infer<typeof MultiAnswerFormIdentificationItemSchema>;
