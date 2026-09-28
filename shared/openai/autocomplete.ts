import { zodResponseFormat } from 'openai/helpers/zod';
import type { Response } from 'openai/resources/responses/responses';
import { openai, AUTOCOMPLETE_MODEL, MAX_TOKENS } from './client';
import { calculateModelCost } from './model-registry';
import { getPromptForPartOfSpeech, SYSTEM_PROMPT } from './prompts';
import { AIAutocompleteRequest, AIAutocompleteResponse, AICompletableField } from './types';
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

function createTokenBudgetError(prefix: string, response: Response): AIAutocompleteResponse {
  const usage = response.usage;
  const outputTypes = response.output.map(item => `${item.type}${'status' in item && item.status ? `:${item.status}` : ''}`);
  const reason = response.incomplete_details?.reason;
  const tokenMessage =
    usage?.output_tokens !== undefined
      ? ` Used ${usage.output_tokens}/${MAX_TOKENS} output tokens${
          usage.output_tokens_details?.reasoning_tokens !== undefined
            ? `, including ${usage.output_tokens_details.reasoning_tokens} reasoning tokens`
            : ''
        }.`
      : '';

  return {
    success: false,
    error: `${prefix}.${tokenMessage}${reason ? ` Reason: ${reason}.` : ''}`,
    model: response.model,
    tokensUsed: usage?.total_tokens,
    errorDetails: {
      message: prefix,
      type: 'OpenAIIncompleteResponse',
      details: JSON.stringify({
        model: response.model,
        maxOutputTokens: MAX_TOKENS,
        usage,
        outputTypes,
        incompleteDetails: response.incomplete_details,
      }),
    },
  };
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
  const schema = OUTPUT_SCHEMAS[request.part_of_speech];
  if (!schema) {
    return { success: false, error: `Unsupported part of speech: ${request.part_of_speech}` };
  }

  try {
    const responseFormat = zodResponseFormat(schema, `${request.part_of_speech}_structured_output`);
    const response = await openai.responses.create({
      model: AUTOCOMPLETE_MODEL,
      reasoning: { effort: 'low' },
      max_output_tokens: MAX_TOKENS,
      instructions: SYSTEM_PROMPT,
      input: getPromptForPartOfSpeech(request.part_of_speech, request.word),
      text: {
        format: {
          type: 'json_schema',
          name: responseFormat.json_schema.name,
          schema: responseFormat.json_schema.schema as { [key: string]: unknown },
          strict: responseFormat.json_schema.strict ?? true,
        },
      },
    });

    const messageItem = response.output.find(item => item.type === 'message');
    if (!messageItem || messageItem.type !== 'message') {
      return createTokenBudgetError('OpenAI did not produce structured vocabulary JSON', response);
    }
    if (messageItem.status === 'incomplete') {
      return createTokenBudgetError('OpenAI started the vocabulary JSON but did not finish it', response);
    }

    const textContent = messageItem.content.find(c => c.type === 'output_text');
    if (!textContent || textContent.type !== 'output_text') {
      return { success: false, error: 'No text content in response' };
    }

    const structured = JSON.parse(textContent.text) as Record<string, unknown> | null;
    if (!structured) {
      return { success: false, error: 'No structured output returned by the model' };
    }

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
      tokensUsed: response.usage?.total_tokens,
      model: response.model,
      cost: response.usage ? calculateModelCost(response.usage, AUTOCOMPLETE_MODEL) : undefined,
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
