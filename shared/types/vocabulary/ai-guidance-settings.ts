import { z } from 'zod';
import { VocabularyAIGuidanceSchema } from './ai-review';

export const VocabularyAIGuidanceRulesSchema = z
  .array(VocabularyAIGuidanceSchema)
  .max(20)
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

export type VocabularyAIGuidanceSettings = z.infer<typeof VocabularyAIGuidanceSettingsSchema>;
export type SaveVocabularyAIGuidance = z.infer<typeof SaveVocabularyAIGuidanceSchema>;
