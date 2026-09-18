import { openai } from './client';
import { calculateProfileCost, parseOpenAIUsage, type TranslationGradingProfile } from './model-registry';
import type { CostBreakdown, CostMeasurement, OpenAIRequestContext, TokenUsage } from './types';
import type { TranslationGradingMode } from './types';
import type { TranslationGradingRunFailure, TranslationGradingRunResult } from './translation-grading-contracts';
import {
  taskJsonSchema,
  type TranslationGradingOutputByMode,
  type TranslationGradingPrompt,
  type TranslationGradingTask,
} from './translation-grading-tasks';
import { withOpenAIProviderLease } from './provider-concurrency.server';

const PROMPT_CACHE_SHARDS = 4;

/** Provider-facing seam that keeps OpenAI response handling out of the grading service. */
export interface StructuredAIExecutor {
  execute<M extends TranslationGradingMode>(
    task: TranslationGradingTask<M>,
    prompt: TranslationGradingPrompt,
    profile: TranslationGradingProfile,
    context?: OpenAIRequestContext
  ): Promise<TranslationGradingRunResult<TranslationGradingOutputByMode[M]>>;
}

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

const costMeasurementFor = (usage: TokenUsage | undefined, cost: CostBreakdown | undefined): CostMeasurement =>
  usage && cost
    ? { status: 'measured', cost }
    : { status: 'unavailable', reason: 'The provider did not return complete token usage.' };

const responseUsage = (response: { usage?: unknown }, profile: TranslationGradingProfile) => {
  const usage = parseOpenAIUsage(response.usage);
  const cost = usage ? calculateProfileCost(response.usage, profile) : undefined;
  return { usage, cost, costMeasurement: costMeasurementFor(usage, cost) };
};

const providerFailure = (profile: TranslationGradingProfile, latencyMs: number): TranslationGradingRunFailure => ({
  success: false,
  code: 'provider-error',
  error: 'The translation grader could not complete this request.',
  requestedModel: profile.model,
  costMeasurement: { status: 'unavailable', reason: 'No provider usage was returned.' },
  latencyMs,
});

export const openAIStructuredOutputExecutor: StructuredAIExecutor = {
  async execute(task, prompt, profile, context = {}) {
    const startTime = Date.now();
    let response: Awaited<ReturnType<typeof openai.responses.create>>;
    try {
      const explicitPromptCaching = profile.promptCacheMode === 'explicit';
      response = await withOpenAIProviderLease(
        signal =>
          openai.responses.create(
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
              safety_identifier: context.safetyIdentifier,
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
            { signal }
          ),
        context.capacityClass ?? 'production',
        context.signal
      );
    } catch (error) {
      console.error('[translation-grading] provider request failed', error);
      return providerFailure(profile, Date.now() - startTime);
    }

    // Capture usage before validating output: rejected responses can still be billable.
    const diagnostic = responseUsage(response, profile);
    const base = {
      requestedModel: profile.model,
      model: response.model,
      usage: diagnostic.usage,
      tokensUsed: diagnostic.usage?.totalTokens,
      cost: diagnostic.cost,
      costMeasurement: diagnostic.costMeasurement,
      latencyMs: Date.now() - startTime,
    };

    if (response.status === 'incomplete') {
      return {
        ...base,
        success: false,
        code: 'response-incomplete',
        error: 'The translation grader returned an incomplete response.',
      };
    }

    const messageItem = Array.isArray(response.output)
      ? response.output.find(item => item.type === 'message')
      : undefined;
    if (!messageItem || messageItem.type !== 'message') {
      return {
        ...base,
        success: false,
        code: 'response-missing-message',
        error: 'The translation grader returned no usable message.',
      };
    }
    if (messageItem.status === 'incomplete') {
      return {
        ...base,
        success: false,
        code: 'response-incomplete',
        error: 'The translation grader returned an incomplete response.',
      };
    }

    const textContent = messageItem.content.find(content => content.type === 'output_text');
    if (!textContent || textContent.type !== 'output_text') {
      return {
        ...base,
        success: false,
        code: 'response-missing-text',
        error: 'The translation grader returned no usable text.',
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(textContent.text);
    } catch (error) {
      console.error('[translation-grading] malformed JSON response', error);
      return {
        ...base,
        success: false,
        code: 'response-malformed-json',
        error: 'The translation grader returned malformed structured output.',
      };
    }

    try {
      return { ...base, success: true, data: task.parse(parsedJson) };
    } catch (error) {
      console.error('[translation-grading] invalid structured response', error);
      return {
        ...base,
        success: false,
        code: 'response-invalid-output',
        error: 'The translation grader returned invalid structured output.',
      };
    }
  },
};
