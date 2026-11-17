import { z } from 'zod';
import {
  AICompletableFieldSchema,
  VocabularyAIFollowUpSchema,
  VocabularyAIReviewSchema,
} from '../types/vocabulary/ai-review';
import { PartOfSpeechSchema } from '../types/vocabulary/schemas/enums';

const commonFields = ['translation', 'definitions', 'etymology', 'pronunciation', 'alternate_form'];
const posFields = {
  noun: ['gender', 'declension', 'declension_table', 'nominative_singular', 'genitive_singular'],
  verb: ['conjugation', 'conjugation_table', 'principal_parts', 'is_deponent'],
  adjective: ['declension', 'dictionary_forms', 'degrees_table'],
  pronoun: ['pronoun_type', 'person', 'declension_table'],
  preposition: ['case'],
  adverb: [],
  conjunction: [],
  interjection: [],
};

/** Editor drafts may contain unfinished content; review metadata must always be valid. */
export const AIAutocompleteRequestSchema = z
  .object({
    word: z.string().trim().min(1).max(500),
    part_of_speech: PartOfSpeechSchema,
    existingData: z.object({ ai_review: VocabularyAIReviewSchema.optional() }).catchall(z.unknown()).optional(),
    fieldsToComplete: z.array(AICompletableFieldSchema).max(19).optional(),
    overwriteExisting: z.boolean().optional(),
    followUp: VocabularyAIFollowUpSchema.optional(),
  })
  .strict()
  .superRefine((request, ctx) => {
    const allowed = [...commonFields, ...posFields[request.part_of_speech]];
    if (
      request.fieldsToComplete?.some(field => !allowed.includes(field)) ||
      (request.followUp && !allowed.includes(request.followUp.field))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['fieldsToComplete'],
        message: 'Field does not apply to this part of speech',
      });
    }
    if (
      request.followUp &&
      request.fieldsToComplete &&
      (request.fieldsToComplete.length !== 1 || request.fieldsToComplete[0] !== request.followUp.field)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['fieldsToComplete'],
        message: 'A follow-up must target only its own field',
      });
    }
    // Bound draft content sent to the provider without rejecting legitimate unfinished forms.
    try {
      if (JSON.stringify(request.existingData ?? {}).length > 200_000) {
        ctx.addIssue({ code: 'custom', path: ['existingData'], message: 'Draft content is too large' });
      }
    } catch {
      ctx.addIssue({ code: 'custom', path: ['existingData'], message: 'Draft content must be JSON serializable' });
    }
  });
