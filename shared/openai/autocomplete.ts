import { zodTextFormat } from 'openai/helpers/zod';
import type { Response } from 'openai/resources/responses/responses';
import { openai } from './client';
import {
  calculateTokenUsageCost,
  parseOpenAIUsage,
  PRODUCTION_VOCABULARY_AUTOCOMPLETE_PROFILE,
  VOCABULARY_AUTOCOMPLETE_PROFILES,
  type VocabularyAutocompleteProfileId,
} from './model-registry';
import { getPromptForPartOfSpeech, SYSTEM_PROMPT } from './prompts';
import type {
  AIAutocompleteRequest,
  AIAutocompleteResponse,
  AICompletableField,
  CostBreakdown,
  ErrorDetails,
  TokenUsage,
} from './types';
import { PartOfSpeech } from '../types/vocabulary/schemas/enums';
import { VocabularyWord } from '../types/vocabulary/schemas';
import {
  VerbStructuredOutputSchema,
  NounStructuredOutputSchema,
  AdjectiveStructuredOutputSchema,
  PronounStructuredOutputSchema,
  AdverbStructuredOutputSchema,
  PrepositionStructuredOutputSchema,
  ConjunctionStructuredOutputSchema,
  InterjectionStructuredOutputSchema,
} from '../types/vocabulary/ai';

const OUTPUT_SCHEMAS = {
  verb: VerbStructuredOutputSchema,
  noun: NounStructuredOutputSchema,
  adjective: AdjectiveStructuredOutputSchema,
  pronoun: PronounStructuredOutputSchema,
  adverb: AdverbStructuredOutputSchema,
  preposition: PrepositionStructuredOutputSchema,
  conjunction: ConjunctionStructuredOutputSchema,
  interjection: InterjectionStructuredOutputSchema,
} satisfies Record<PartOfSpeech, unknown>;

/** Everything that decides what one autocomplete request sends to the model. */
export function vocabularyAutocompleteRequestBody(part_of_speech: PartOfSpeech, word: string) {
  const schema = OUTPUT_SCHEMAS[part_of_speech];
  return {
    schema,
    instructions: SYSTEM_PROMPT,
    input: getPromptForPartOfSpeech(part_of_speech, word),
    format: zodTextFormat(schema, `${part_of_speech}_structured_output`),
  };
}

export type VocabularyAutocompleteFailureCode =
  | 'unsupported-part-of-speech'
  | 'provider-error'
  | 'token-budget'
  | 'missing-text'
  | 'malformed-json';

interface VocabularyAutocompleteRunBase {
  requestedModel: string;
  model?: string;
  maxOutputTokens: number;
  usage?: TokenUsage;
  cost?: CostBreakdown;
  latencyMs: number;
}

export interface VocabularyAutocompleteRunSuccess extends VocabularyAutocompleteRunBase {
  success: true;
  /** Every field the part-of-speech schema asks for, exactly as the model returned it. */
  structured: Record<string, unknown>;
}

export interface VocabularyAutocompleteRunFailure extends VocabularyAutocompleteRunBase {
  success: false;
  code: VocabularyAutocompleteFailureCode;
  error: string;
  errorDetails?: ErrorDetails;
  /** OpenAI's reason for an incomplete response, e.g. max_output_tokens. */
  incompleteReason?: string;
}

export type VocabularyAutocompleteRunResult = VocabularyAutocompleteRunSuccess | VocabularyAutocompleteRunFailure;

function tokenBudgetFailure(
  prefix: string,
  response: Response,
  base: VocabularyAutocompleteRunBase
): VocabularyAutocompleteRunFailure {
  const usage = response.usage;
  const outputTypes = response.output.map(
    item => `${item.type}${'status' in item && item.status ? `:${item.status}` : ''}`
  );
  const reason = response.incomplete_details?.reason;
  const tokenMessage =
    usage?.output_tokens !== undefined
      ? ` Used ${usage.output_tokens}/${base.maxOutputTokens} output tokens${
          usage.output_tokens_details?.reasoning_tokens !== undefined
            ? `, including ${usage.output_tokens_details.reasoning_tokens} reasoning tokens`
            : ''
        }.`
      : '';

  return {
    ...base,
    success: false,
    code: 'token-budget',
    error: `${prefix}.${tokenMessage}${reason ? ` Reason: ${reason}.` : ''}`,
    incompleteReason: reason ?? undefined,
    errorDetails: {
      message: prefix,
      type: 'OpenAIIncompleteResponse',
      details: JSON.stringify({
        model: response.model,
        maxOutputTokens: base.maxOutputTokens,
        usage,
        outputTypes,
        incompleteDetails: response.incomplete_details,
      }),
    },
  };
}

/**
 * One autocomplete request with the given profile. The admin editor goes
 * through `autocompleteVocabularyWord`; the evaluation suite calls this
 * directly to compare profiles on the raw model output.
 */
export async function runVocabularyAutocomplete(
  request: Pick<AIAutocompleteRequest, 'word' | 'part_of_speech'>,
  profileId: VocabularyAutocompleteProfileId = PRODUCTION_VOCABULARY_AUTOCOMPLETE_PROFILE,
  options?: { timeout?: number; maxRetries?: number }
): Promise<VocabularyAutocompleteRunResult> {
  const profile = VOCABULARY_AUTOCOMPLETE_PROFILES[profileId];
  const startedAt = Date.now();
  const unmeasured = { requestedModel: profile.model, maxOutputTokens: profile.maxOutputTokens };
  if (!OUTPUT_SCHEMAS[request.part_of_speech]) {
    return {
      ...unmeasured,
      success: false,
      code: 'unsupported-part-of-speech',
      error: `Unsupported part of speech: ${request.part_of_speech}`,
      latencyMs: 0,
    };
  }

  let response: Response;
  try {
    const body = vocabularyAutocompleteRequestBody(request.part_of_speech, request.word);
    response = await openai.responses.create(
      {
        model: profile.model,
        reasoning: { effort: profile.reasoningEffort },
        max_output_tokens: profile.maxOutputTokens,
        instructions: body.instructions,
        input: body.input,
        text: { format: body.format },
      },
      options
    );
  } catch (error) {
    console.error('[Autocomplete] Request failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error while requesting autocomplete';
    return {
      ...unmeasured,
      success: false,
      code: 'provider-error',
      error: message,
      latencyMs: Date.now() - startedAt,
      errorDetails: {
        message,
        type: error?.constructor?.name || typeof error,
        stack: error instanceof Error ? error.stack : undefined,
        details: String(error),
      },
    };
  }

  // Usage is captured before the output is checked: a truncated response is still billed.
  const usage = parseOpenAIUsage(response.usage);
  const base: VocabularyAutocompleteRunBase = {
    ...unmeasured,
    model: response.model,
    usage,
    cost: usage ? calculateTokenUsageCost(usage, profile.pricing) : undefined,
    latencyMs: Date.now() - startedAt,
  };

  const messageItem = response.output.find(item => item.type === 'message');
  if (!messageItem || messageItem.type !== 'message') {
    return tokenBudgetFailure('OpenAI did not produce structured vocabulary JSON', response, base);
  }
  if (messageItem.status === 'incomplete') {
    return tokenBudgetFailure('OpenAI started the vocabulary JSON but did not finish it', response, base);
  }

  const textContent = messageItem.content.find(c => c.type === 'output_text');
  if (!textContent || textContent.type !== 'output_text') {
    return { ...base, success: false, code: 'missing-text', error: 'No text content in response' };
  }

  let structured: unknown;
  try {
    structured = JSON.parse(textContent.text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Malformed JSON';
    return { ...base, success: false, code: 'malformed-json', error: message };
  }
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) {
    return { ...base, success: false, code: 'missing-text', error: 'No structured output returned by the model' };
  }
  return { ...base, success: true, structured: structured as Record<string, unknown> };
}

function isValueEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isValueEmpty);
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('full_form' in obj && 'shortened_form' in obj) {
      return isValueEmpty(obj.full_form) && isValueEmpty(obj.shortened_form);
    }
    return Object.values(obj).every(isValueEmpty);
  }

  return false;
}

function isWordForm(value: unknown): value is { full_form?: string; shortened_form?: string } {
  return typeof value === 'object' && value !== null && ('full_form' in value || 'shortened_form' in value);
}

function isWordFormIncomplete(value: unknown): boolean {
  if (!isWordForm(value)) {
    return false;
  }
  return isValueEmpty(value.full_form) || isValueEmpty(value.shortened_form);
}

function mergeWordForm(
  existing: { full_form?: string; shortened_form?: string },
  incoming: { full_form?: string; shortened_form?: string }
): { full_form: string; shortened_form: string } {
  return {
    full_form: incoming.full_form || existing.full_form || '',
    shortened_form: incoming.shortened_form || existing.shortened_form || '',
  };
}

function mergeValue(existingValue: unknown, incomingValue: unknown, overwriteExisting?: boolean): unknown {
  if (overwriteExisting) {
    return incomingValue;
  }

  if (Array.isArray(incomingValue) && !Array.isArray(existingValue)) {
    return incomingValue;
  }

  if (Array.isArray(existingValue) && Array.isArray(incomingValue)) {
    if (existingValue.length === 0) {
      return incomingValue;
    }
    if (incomingValue.length === 0) {
      return existingValue;
    }
    if (existingValue.length !== incomingValue.length) {
      return incomingValue;
    }
    return existingValue.map((existingItem, index) => {
      const incomingItem = incomingValue[index];
      if (isWordForm(existingItem) && isWordForm(incomingItem)) {
        return mergeWordForm(existingItem, incomingItem);
      }
      return isValueEmpty(existingItem) ? incomingItem : existingItem;
    });
  }

  if (isWordForm(existingValue) && isWordForm(incomingValue)) {
    return mergeWordForm(existingValue, incomingValue);
  }

  return isValueEmpty(existingValue) ? incomingValue : existingValue;
}

export async function autocompleteVocabularyWord(request: AIAutocompleteRequest): Promise<AIAutocompleteResponse> {
  const result = await runVocabularyAutocomplete(request);
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      errorDetails: result.errorDetails,
      model: result.model,
      tokensUsed: result.usage?.totalTokens,
      cost: result.cost,
    };
  }

  try {
    const { structured } = result;
    const schema = OUTPUT_SCHEMAS[request.part_of_speech];
    const existing: Record<string, unknown> = request.existingData ?? {};
    const schemaFields = schema.keyof().options as AICompletableField[];
    const selectedFields = request.fieldsToComplete?.length
      ? request.fieldsToComplete.filter(field => schemaFields.includes(field))
      : schemaFields;

    const data: Record<string, unknown> = { part_of_speech: request.part_of_speech };
    for (const field of selectedFields) {
      data[field] = mergeValue(existing[field], structured[field], request.overwriteExisting);
    }

    const fieldStatus: Record<string, 'filled' | 'missing'> = {};
    for (const field of schemaFields) {
      const existingValue = existing[field];
      const mergedValue = data[field];
      const wasIncompleteOrEmpty =
        isValueEmpty(existingValue) ||
        (Array.isArray(existingValue) && existingValue.some(item => isWordFormIncomplete(item))) ||
        isWordFormIncomplete(existingValue);

      if (wasIncompleteOrEmpty) {
        const isNowComplete =
          !isValueEmpty(mergedValue) &&
          (Array.isArray(mergedValue)
            ? mergedValue.every(item => !isWordFormIncomplete(item))
            : !isWordFormIncomplete(mergedValue));
        fieldStatus[field] = isNowComplete && !isValueEmpty(structured[field]) ? 'filled' : 'missing';
      }
    }

    return {
      success: true,
      data: data as Partial<VocabularyWord>,
      tokensUsed: result.usage?.totalTokens,
      model: result.model,
      cost: result.cost,
      fieldStatus,
    };
  } catch (error) {
    console.error('[Autocomplete] Request failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error while requesting autocomplete';
    return {
      success: false,
      error: message,
      errorDetails: {
        message,
        type: error?.constructor?.name || typeof error,
        stack: error instanceof Error ? error.stack : undefined,
        details: String(error),
      },
    };
  }
}
