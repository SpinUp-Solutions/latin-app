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

export const UNCERTAINTY_EXPLANATION_MAX = 1200;
export const ADMIN_NOTE_MAX = 2000;
export const AI_REVIEW_ITEM_LIMIT = 20;

export const VocabularyAIUncertaintySchema = z
  .object({
    field: AICompletableFieldSchema,
    explanation: z.string().trim().min(1).max(UNCERTAINTY_EXPLANATION_MAX),
  })
  .strict();

/**
 * An admin-written instruction for the model. On a word it is a note, usually
 * left while correcting one field (`field`); in the global settings it is a rule
 * for every word.
 */
export const VocabularyAIGuidanceSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    instruction: z.string().trim().min(1).max(ADMIN_NOTE_MAX),
    field: AICompletableFieldSchema.optional(),
  })
  .strict();

export const VocabularyAIReviewSchema = z
  .object({
    uncertainties: z.array(VocabularyAIUncertaintySchema).max(AI_REVIEW_ITEM_LIMIT),
    guidance: z.array(VocabularyAIGuidanceSchema).max(AI_REVIEW_ITEM_LIMIT),
  })
  .strict();

/** Review metadata is required in model output, never embedded in lexical content. */
export const VocabularyAIOutputReviewShape = {
  uncertainties: z.array(VocabularyAIUncertaintySchema).max(AI_REVIEW_ITEM_LIMIT),
  review_answer: z.string().trim().min(1).max(4000).nullable(),
};

/** An admin's note about the correct value of one field, sent back to the model for a corrected proposal. */
export const VocabularyAIFollowUpSchema = z
  .object({
    field: AICompletableFieldSchema,
    note: z.string().trim().min(1).max(ADMIN_NOTE_MAX),
    /** The model's earlier doubt about this field, when the admin is answering one. */
    doubt: z.string().trim().min(1).max(UNCERTAINTY_EXPLANATION_MAX).optional(),
  })
  .strict();

export type VocabularyAIUncertainty = z.infer<typeof VocabularyAIUncertaintySchema>;
export type VocabularyAIGuidance = z.infer<typeof VocabularyAIGuidanceSchema>;
export type VocabularyAIReview = z.infer<typeof VocabularyAIReviewSchema>;
export type VocabularyAIFollowUp = z.infer<typeof VocabularyAIFollowUpSchema>;

export const EMPTY_AI_REVIEW: VocabularyAIReview = { uncertainties: [], guidance: [] };

/**
 * One report per field. The model may describe several problems with one
 * field; the admin answers them together, so they are shown as one.
 */
export function combineUncertaintiesByField(reports: readonly VocabularyAIUncertainty[]): VocabularyAIUncertainty[] {
  const byField = new Map<AICompletableField, string[]>();
  for (const report of reports) {
    const explanations = byField.get(report.field) ?? [];
    if (!explanations.includes(report.explanation)) explanations.push(report.explanation);
    byField.set(report.field, explanations);
  }
  return [...byField].map(([field, explanations]) => ({
    field,
    explanation: explanations.join('\n').slice(0, UNCERTAINTY_EXPLANATION_MAX).trim(),
  }));
}

/**
 * Adds new reports for fields that have no open report. An open report stays
 * as the admin last saw it until the admin resolves it; the model never closes one.
 */
export function addOpenUncertainties(
  open: readonly VocabularyAIUncertainty[],
  incoming: readonly VocabularyAIUncertainty[]
): VocabularyAIUncertainty[] {
  const openFields = new Set(open.map(report => report.field));
  return [...open, ...combineUncertaintiesByField(incoming).filter(report => !openFields.has(report.field))];
}
