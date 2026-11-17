import { z } from 'zod';
import { ADMIN_NOTE_MAX, AI_REVIEW_ITEM_LIMIT, VocabularyAIGuidanceSchema } from './ai-review';

/** The admin's answer the AI drew a rule from, so an admin reviewing the rules can judge it. */
const LearnedFromSchema = z
  .object({
    word: z.string().trim().min(1).max(500),
    message: z.string().trim().min(1).max(ADMIN_NOTE_MAX),
  })
  .strict();

/** A rule for every word. An admin writes it, or the AI draws it from an admin's answer (`learnedFrom`). */
export const VocabularyAIRuleSchema = VocabularyAIGuidanceSchema.extend({
  learnedFrom: LearnedFromSchema.optional(),
}).strict();

export const VocabularyAIGuidanceRulesSchema = z
  .array(VocabularyAIRuleSchema)
  .max(AI_REVIEW_ITEM_LIMIT)
  .refine(rules => new Set(rules.map(rule => rule.id)).size === rules.length, {
    message: 'Guidance rule IDs must be unique',
  });

export const VocabularyAIGuidanceSettingsSchema = z.object({
  revision: z.number().int().nonnegative(),
  rules: VocabularyAIGuidanceRulesSchema,
  updatedAt: z.string().datetime().nullable(),
  updatedBy: z.string().min(1).nullable(),
});

export const SaveVocabularyAIGuidanceSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    rules: VocabularyAIGuidanceRulesSchema,
  })
  .strict();

/** A rule the AI drew from an admin's answer, added when the admin accepts that answer. */
export const LearnVocabularyAIRuleSchema = z
  .object({
    instruction: z.string().trim().min(1).max(ADMIN_NOTE_MAX),
    learnedFrom: LearnedFromSchema,
  })
  .strict();

export type VocabularyAIRule = z.infer<typeof VocabularyAIRuleSchema>;
export type VocabularyAIGuidanceSettings = z.infer<typeof VocabularyAIGuidanceSettingsSchema>;
export type SaveVocabularyAIGuidance = z.infer<typeof SaveVocabularyAIGuidanceSchema>;
export type LearnVocabularyAIRule = z.infer<typeof LearnVocabularyAIRuleSchema>;

export interface LearnVocabularyAIRuleResult {
  settings: VocabularyAIGuidanceSettings;
  rule: VocabularyAIRule;
  /** False when an existing rule already said the same thing. */
  added: boolean;
}

/** Rules that differ only in spacing, case or a closing full stop say the same thing. */
export function sameAIRule(left: string, right: string): boolean {
  const normalize = (text: string) =>
    text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.!]+$/, '')
      .toLowerCase();
  return normalize(left) === normalize(right);
}
