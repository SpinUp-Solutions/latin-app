import {
  getTranslationGradingProfile,
  PRODUCTION_TRANSLATION_POLICY,
  type TranslationGradingProfile,
  type TranslationGradingProfileId,
} from './model-registry';
import { openAIStructuredOutputExecutor, type StructuredAIExecutor } from './translation-grading-openai';
import type {
  TranslationGradingRunFailure,
  TranslationGradingRunResult,
  TranslationGradingRunSuccess,
} from './translation-grading-contracts';
import {
  getTranslationGradingTask,
  parseTranslationGradingOutput,
  testTranslationGradingOutputSchema,
  type TestTranslationGradingOutput,
  type TranslationGradingOutput,
  type TranslationGradingOutputByMode,
} from './translation-grading-tasks';
import type { TranslationGradingMode, TranslationGradingRequest, TranslationGradingResponse } from './types';

export type {
  StructuredAIExecutor,
  TestTranslationGradingOutput,
  TranslationGradingMode,
  TranslationGradingOutput,
  TranslationGradingRunFailure,
  TranslationGradingRunResult,
  TranslationGradingRunSuccess,
};
export { parseTranslationGradingOutput, testTranslationGradingOutputSchema };

export interface TranslationGradingService {
  grade<M extends TranslationGradingMode>(
    mode: M,
    request: TranslationGradingRequest,
    profileId?: TranslationGradingProfileId
  ): Promise<TranslationGradingRunResult<TranslationGradingOutputByMode[M]>>;
}

const profileFor = (mode: TranslationGradingMode, profileId?: TranslationGradingProfileId): TranslationGradingProfile =>
  getTranslationGradingProfile(profileId ?? PRODUCTION_TRANSLATION_POLICY[mode]);

/**
 * The single application service for lesson and test grading. A task chooses
 * prompt/schema/output; a profile chooses model behavior; the executor owns
 * the provider API details.
 */
export function createTranslationGradingService(
  executor: StructuredAIExecutor = openAIStructuredOutputExecutor
): TranslationGradingService {
  return {
    async grade(mode, request, profileId) {
      const task = getTranslationGradingTask(mode);
      return executor.execute(task, task.buildPrompt(request), profileFor(mode, profileId));
    },
  };
}

export const translationGrader = createTranslationGradingService();

export async function gradeTranslation(
  request: TranslationGradingRequest
): Promise<TranslationGradingResponse<TranslationGradingOutput>> {
  try {
    const result = await translationGrader.grade('lesson', request);
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        errorDetails: { message: result.error, type: result.code },
        tokensUsed: result.tokensUsed,
        model: result.model,
        cost: result.cost,
      };
    }
    return {
      success: true,
      data: result.data,
      tokensUsed: result.tokensUsed,
      model: result.model,
      cost: result.cost,
    };
  } catch (error) {
    console.error('[translation-grading] unexpected grading error', error);
    return {
      success: false,
      error: 'The translation grader could not complete this request.',
      errorDetails: { message: 'The translation grader could not complete this request.', type: 'unexpected-error' },
    };
  }
}
