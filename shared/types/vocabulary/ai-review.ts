import { z } from 'zod';

/** Only content fields that autocomplete may propose replacing. */
export const AICompletableFieldSchema = z.enum([
  'translation',
  'definitions',
  'etymology',
  'pronunciation',
  'gender',
  'declension',
  'declension_table',
  'conjugation',
  'conjugation_table',
  'principal_parts',
  'is_deponent',
  'degrees_table',
  'alternate_form',
  'pronoun_type',
  'person',
  'case',
  'dictionary_forms',
  'nominative_singular',
  'genitive_singular',
]);
export type AICompletableField = z.infer<typeof AICompletableFieldSchema>;

export const VocabularyAIUncertaintySchema = z
  .object({
    field: AICompletableFieldSchema,
    explanation: z.string().trim().min(1).max(1200),
  })
  .strict();
export const VocabularyAIGuidanceSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    instruction: z.string().trim().min(1).max(2000),
  })
  .strict();
export const VocabularyAIReviewSchema = z
  .object({
    uncertainties: z.array(VocabularyAIUncertaintySchema).max(20),
    guidance: z.array(VocabularyAIGuidanceSchema).max(20),
  })
  .strict();

/** Review metadata is required in model output, never embedded in lexical content. */
export const VocabularyAIOutputReviewShape = {
  uncertainties: z.array(VocabularyAIUncertaintySchema).max(20),
  review_answer: z.string().trim().min(1).max(4000).nullable(),
};
export const VocabularyAIFollowUpSchema = z
  .object({
    question: z.string().trim().min(1).max(4000),
    uncertainty: VocabularyAIUncertaintySchema,
  })
  .strict();

export type VocabularyAIUncertainty = z.infer<typeof VocabularyAIUncertaintySchema>;
export type VocabularyAIGuidance = z.infer<typeof VocabularyAIGuidanceSchema>;
export type VocabularyAIReview = z.infer<typeof VocabularyAIReviewSchema>;
export type VocabularyAIFollowUp = z.infer<typeof VocabularyAIFollowUpSchema>;
