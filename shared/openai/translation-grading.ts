import { openai } from './client';
import {
  calculateTokenUsageCost,
  parseOpenAIUsage,
  PRODUCTION_TRANSLATION_POLICY,
  TRANSLATION_GRADING_PROFILES,
  type TranslationGradingProfile,
  type TranslationGradingProfileId,
} from './model-registry';
import {
  getTranslationGradingTask,
  taskJsonSchema,
  testTranslationGradingOutputSchema,
  type TestTranslationGradingOutput,
  type TranslationGradingOutput,
  type TranslationGradingOutputByMode,
} from './translation-grading-tasks';
import type {
  CostBreakdown,
  CostMeasurement,
  TokenUsage,
  TranslationGradingMode,
  TranslationGradingRequest,
  TranslationGradingResponse,
} from './types';

export type { TestTranslationGradingOutput, TranslationGradingMode, TranslationGradingOutput };
export { testTranslationGradingOutputSchema };

type TranslationGradingFailureCode =
  | 'provider-error'
  | 'response-incomplete'
  | 'response-missing-message'
  | 'response-missing-text'
  | 'response-malformed-json'
  | 'response-invalid-output';

interface TranslationGradingRunBase {
  requestedModel: string;
  model?: string;
  usage?: TokenUsage;
  tokensUsed?: number;
  cost?: CostBreakdown;
  costMeasurement: CostMeasurement;
  latencyMs: number;
}

export interface TranslationGradingRunSuccess<T = unknown> extends TranslationGradingRunBase {
  success: true;
  data: T;
}

export interface TranslationGradingRunFailure extends TranslationGradingRunBase {
  success: false;
  code: TranslationGradingFailureCode;
  /** Stable, safe-to-display message. Raw provider details stay in server logs. */
  error: string;
}

export type TranslationGradingRunResult<T = unknown> = TranslationGradingRunSuccess<T> | TranslationGradingRunFailure;

const PROMPT_CACHE_SHARDS = 4;

/**
 * Automatic prompt caching benefits from one stable routing key. Explicit
 * caching uses shards so an evaluation burst is spread across cache routes.
 */
function promptCacheKeyFor(
  profile: TranslationGradingProfile,
  variableSuffix: string,
  mode: TranslationGradingMode
): string {
  const baseKey = mode === 'lesson' ? profile.promptCacheKey : `${profile.promptCacheKey}:${mode}`;
  if (profile.promptCacheMode === 'automatic') return baseKey;

  let hash = 2166136261;
  for (let index = 0; index < variableSuffix.length; index += 1) {
    hash ^= variableSuffix.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${baseKey}:shard-${(hash >>> 0) % PROMPT_CACHE_SHARDS}`;
}

/**
 * The single grading entry point for lessons, tests, and the admin evaluation
 * suite. The task chooses prompt/schema/output; the profile chooses model behavior.
 */
async function grade<M extends TranslationGradingMode>(
  mode: M,
  request: TranslationGradingRequest,
  profileId: TranslationGradingProfileId = PRODUCTION_TRANSLATION_POLICY[mode],
  options?: { signal?: AbortSignal; timeout?: number; maxRetries?: number }
): Promise<TranslationGradingRunResult<TranslationGradingOutputByMode[M]>> {
  const task = getTranslationGradingTask(mode);
  const prompt = task.buildPrompt(request);
  const profile = TRANSLATION_GRADING_PROFILES[profileId];
  const startTime = Date.now();
  let response: Awaited<ReturnType<typeof openai.responses.create>>;
  try {
    const explicitPromptCaching = profile.promptCacheMode === 'explicit';
    response = await openai.responses.create(
      {
        model: profile.model,
        max_output_tokens: profile.maxOutputTokens[task.mode],
        instructions: task.systemPrompt,
        reasoning: { effort: profile.reasoningEffort },
        input: explicitPromptCaching
          ? [
              {
                type: 'message',
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: prompt.stablePrefix,
                    prompt_cache_breakpoint: { mode: 'explicit' },
                  },
                  { type: 'input_text', text: prompt.variableSuffix },
                ],
              },
            ]
          : `${prompt.stablePrefix}\n\n${prompt.variableSuffix}`,
        prompt_cache_key: promptCacheKeyFor(profile, prompt.variableSuffix, task.mode),
        ...(explicitPromptCaching
          ? { prompt_cache_options: { mode: 'explicit' as const, ttl: '30m' as const } }
          : {}),
        service_tier: 'default',
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: task.formatName,
            schema: taskJsonSchema(task),
            strict: true,
          },
        },
      },
      options
    );
  } catch (error) {
    console.error('[translation-grading] provider request failed', error);
    return {
      success: false,
      code: 'provider-error',
      error: 'The translation grader could not complete this request.',
      requestedModel: profile.model,
      costMeasurement: { status: 'unavailable', reason: 'No provider usage was returned.' },
      latencyMs: Date.now() - startTime,
    };
  }

  // Capture usage before validating output: rejected responses can still be billable.
  const usage = parseOpenAIUsage(response.usage);
  const cost = usage ? calculateTokenUsageCost(usage, profile.pricing) : undefined;
  const costMeasurement: CostMeasurement = cost
    ? { status: 'measured', cost }
    : { status: 'unavailable', reason: 'The provider did not return complete token usage.' };
  const base = {
    requestedModel: profile.model,
    model: response.model,
    usage,
    tokensUsed: usage?.totalTokens,
    cost,
    costMeasurement,
    latencyMs: Date.now() - startTime,
  };
  const failure = (code: TranslationGradingFailureCode, error: string): TranslationGradingRunFailure => ({
    ...base,
    success: false,
    code,
    error,
  });

  if (response.status === 'incomplete') {
    return failure('response-incomplete', 'The translation grader returned an incomplete response.');
  }

  const messageItem = Array.isArray(response.output)
    ? response.output.find(item => item.type === 'message')
    : undefined;
  if (!messageItem || messageItem.type !== 'message') {
    return failure('response-missing-message', 'The translation grader returned no usable message.');
  }
  if (messageItem.status === 'incomplete') {
    return failure('response-incomplete', 'The translation grader returned an incomplete response.');
  }

  const textContent = messageItem.content.find(content => content.type === 'output_text');
  if (!textContent || textContent.type !== 'output_text') {
    return failure('response-missing-text', 'The translation grader returned no usable text.');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(textContent.text);
  } catch (error) {
    console.error('[translation-grading] malformed JSON response', error);
    return failure('response-malformed-json', 'The translation grader returned malformed structured output.');
  }

  try {
    return { ...base, success: true, data: task.parse(parsedJson) };
  } catch (error) {
    console.error('[translation-grading] invalid structured response', error);
    return failure('response-invalid-output', 'The translation grader returned invalid structured output.');
  }
}

export const translationGrader = { grade };

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
