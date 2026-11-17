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
export const AI_QUESTION_MAX = 300;
export const AI_SUGGESTED_ANSWER_MAX = 200;
export const AI_SUGGESTED_ANSWER_LIMIT = 3;
export const ADMIN_NOTE_MAX = 2000;
export const AI_REPLY_MAX = 2000;
export const AI_RULE_MAX = 500;
export const AI_REVIEW_ITEM_LIMIT = 20;
/** Earlier messages sent back with a new one, so the AI can follow up on its own answer. */
export const AI_CONVERSATION_HISTORY_LIMIT = 8;
export const AI_REMEMBER_LIMIT = 3;

const explanationText = z.string().trim().min(1).max(UNCERTAINTY_EXPLANATION_MAX);
const questionText = z.string().trim().min(1).max(AI_QUESTION_MAX);
const suggestedAnswer = z.string().trim().min(1).max(AI_SUGGESTED_ANSWER_MAX);

/**
 * A question the AI asked about one field, kept on the word until the admin
 * answers it. Drafts saved before questions existed have only the explanation.
 */
export const VocabularyAIUncertaintySchema = z
  .object({
    field: AICompletableFieldSchema,
    explanation: explanationText,
    question: questionText.optional(),
    /** Answers the admin can pick instead of typing one. */
    options: z.array(suggestedAnswer).max(AI_SUGGESTED_ANSWER_LIMIT).optional(),
  })
  .strict();

/** The same report as the model writes it: strict structured outputs have no optional keys. */
export const VocabularyAIOutputUncertaintySchema = z
  .object({
    field: AICompletableFieldSchema,
    question: questionText,
    explanation: explanationText,
    options: z.array(suggestedAnswer).max(AI_SUGGESTED_ANSWER_LIMIT),
  })
  .strict();

/**
 * An instruction for the model. On a word it is a note, usually tied to one
 * field (`field`); in the global settings it is a rule for every word.
 */
export const VocabularyAIGuidanceSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    instruction: z.string().trim().min(1).max(ADMIN_NOTE_MAX),
    field: AICompletableFieldSchema.optional(),
  })
  .strict();

/**
 * A note on one word. `source` is the admin's message the AI drew it from, kept
 * so the note can be judged later; it is the message the AI interpreted, not
 * proof the note is faithful to it. Notes an admin wrote, or older ones, have none.
 */
export const VocabularyAINoteSchema = VocabularyAIGuidanceSchema.extend({
  source: z.string().trim().min(1).max(ADMIN_NOTE_MAX).optional(),
}).strict();

export const VocabularyAIReviewSchema = z
  .object({
    uncertainties: z.array(VocabularyAIUncertaintySchema).max(AI_REVIEW_ITEM_LIMIT),
    guidance: z.array(VocabularyAINoteSchema).max(AI_REVIEW_ITEM_LIMIT),
  })
  .strict();

/** Review metadata is required in model output, never embedded in lexical content. */
export const VocabularyAIOutputReviewShape = {
  uncertainties: z.array(VocabularyAIOutputUncertaintySchema).max(AI_REVIEW_ITEM_LIMIT),
};

/** One earlier message in the admin's conversation with the AI about a word. */
export const VocabularyAIChatTurnSchema = z
  .object({
    from: z.enum(['admin', 'ai']),
    text: z.string().trim().min(1).max(AI_REPLY_MAX),
  })
  .strict();

/** The admin's newest message to the AI about a word, with the conversation so far. */
export const VocabularyAIConversationSchema = z
  .object({
    message: z.string().trim().min(1).max(ADMIN_NOTE_MAX),
    history: z.array(VocabularyAIChatTurnSchema).max(AI_CONVERSATION_HISTORY_LIMIT),
  })
  .strict();

/** A fact the admin stated about a word, written down by the AI for later requests. */
export const VocabularyAIMemorySchema = z
  .object({
    field: AICompletableFieldSchema.nullable(),
    note: z.string().trim().min(1).max(ADMIN_NOTE_MAX),
  })
  .strict();

/** What the AI says back to the admin; the values it proposes travel separately. */
export const VocabularyAIReplySchema = z
  .object({
    message: z.string().trim().min(1).max(AI_REPLY_MAX),
    /** Open questions that the admin's message settled. */
    answered: z.array(AICompletableFieldSchema).max(AICompletableFieldSchema.options.length),
    remember: z.array(VocabularyAIMemorySchema).max(AI_REMEMBER_LIMIT),
    /** A rule for every word drawn from the admin's message, when the message states one. */
    rule: z.string().trim().min(1).max(AI_RULE_MAX).nullable(),
  })
  .strict();

export type VocabularyAIUncertainty = z.infer<typeof VocabularyAIUncertaintySchema>;
export type VocabularyAIGuidance = z.infer<typeof VocabularyAIGuidanceSchema>;
export type VocabularyAINote = z.infer<typeof VocabularyAINoteSchema>;
export type VocabularyAIReview = z.infer<typeof VocabularyAIReviewSchema>;
export type VocabularyAIChatTurn = z.infer<typeof VocabularyAIChatTurnSchema>;
export type VocabularyAIConversation = z.infer<typeof VocabularyAIConversationSchema>;
export type VocabularyAIMemory = z.infer<typeof VocabularyAIMemorySchema>;
export type VocabularyAIReply = z.infer<typeof VocabularyAIReplySchema>;

export const EMPTY_AI_REVIEW: VocabularyAIReview = { uncertainties: [], guidance: [] };

/**
 * One question per field. The model may raise several problems with one
 * field; the admin answers them together, so they are asked as one.
 */
export function combineUncertaintiesByField(reports: readonly VocabularyAIUncertainty[]): VocabularyAIUncertainty[] {
  const byField = new Map<AICompletableField, VocabularyAIUncertainty[]>();
  for (const report of reports) byField.set(report.field, [...(byField.get(report.field) ?? []), report]);
  return [...byField].map(([field, group]) => {
    const explanations = [...new Set(group.map(report => report.explanation))];
    const question = group.find(report => report.question)?.question;
    const options = [...new Set(group.flatMap(report => report.options ?? []))].slice(0, AI_SUGGESTED_ANSWER_LIMIT);
    // Firestore rejects undefined values, so absent parts are left out rather than set to undefined.
    return {
      field,
      explanation: explanations.join('\n').slice(0, UNCERTAINTY_EXPLANATION_MAX).trim(),
      ...(question ? { question } : {}),
      ...(options.length ? { options } : {}),
    };
  });
}

/**
 * Adds new questions for fields that have no open question. An open question
 * stays as the admin last saw it until the admin answers it; the model never closes one.
 */
export function addOpenUncertainties(
  open: readonly VocabularyAIUncertainty[],
  incoming: readonly VocabularyAIUncertainty[]
): VocabularyAIUncertainty[] {
  const openFields = new Set(open.map(report => report.field));
  return [...open, ...combineUncertaintiesByField(incoming).filter(report => !openFields.has(report.field))];
}
