import { zodResponseFormat } from 'openai/helpers/zod';
import { openai, AUTOCOMPLETE_MODEL, MAX_TOKENS } from './client';
import { getPromptForPartOfSpeech, SYSTEM_PROMPT } from './prompts';
import { AIAutocompleteRequest, AIAutocompleteResponse, AICompletableField, CostBreakdown } from './types';
import { PartOfSpeech } from '../types/vocabulary/schemas/enums';
import { VocabularyWord } from '../types/vocabulary/schemas';
import {
  VerbStructuredOutputSchema,
  VerbStructuredOutput,
  NounStructuredOutputSchema,
  NounStructuredOutput,
  AdjectiveStructuredOutputSchema,
  AdjectiveStructuredOutput,
  PronounStructuredOutputSchema,
  PronounStructuredOutput,
  AdverbStructuredOutputSchema,
  AdverbStructuredOutput,
  PrepositionStructuredOutputSchema,
  PrepositionStructuredOutput,
  ConjunctionStructuredOutputSchema,
  ConjunctionStructuredOutput,
  InterjectionStructuredOutputSchema,
  InterjectionStructuredOutput,
} from '../types/vocabulary/ai';

type StructuredOutputSchema =
  | typeof VerbStructuredOutputSchema
  | typeof NounStructuredOutputSchema
  | typeof AdjectiveStructuredOutputSchema
  | typeof PronounStructuredOutputSchema
  | typeof AdverbStructuredOutputSchema
  | typeof PrepositionStructuredOutputSchema
  | typeof ConjunctionStructuredOutputSchema
  | typeof InterjectionStructuredOutputSchema;

type StructuredOutput =
  | VerbStructuredOutput
  | NounStructuredOutput
  | AdjectiveStructuredOutput
  | PronounStructuredOutput
  | AdverbStructuredOutput
  | PrepositionStructuredOutput
  | ConjunctionStructuredOutput
  | InterjectionStructuredOutput;

interface PartOfSpeechConfig {
  schema: StructuredOutputSchema;
  partOfSpeech: VocabularyWord['part_of_speech'];
}

type ResponseDiagnosticsSource = {
  model?: string;
  usage?: {
    output_tokens?: number;
    total_tokens?: number;
    output_tokens_details?: {
      reasoning_tokens?: number;
    };
  } | null;
  incomplete_details?: unknown;
  output?: Array<{
    type: string;
    status?: string;
  }>;
};

function getIncompleteReason(details: unknown): string | undefined {
  if (!details || typeof details !== 'object') {
    return undefined;
  }

  const reason = (details as Record<string, unknown>).reason;
  return typeof reason === 'string' ? reason : undefined;
}

function createResponseDiagnostics(response: ResponseDiagnosticsSource) {
  const outputTokens = response.usage?.output_tokens;
  const reasoningTokens = response.usage?.output_tokens_details?.reasoning_tokens;
  const outputTypes = response.output?.map(item => `${item.type}${item.status ? `:${item.status}` : ''}`) ?? [];
  const incompleteReason = getIncompleteReason(response.incomplete_details);

  return {
    outputTokens,
    reasoningTokens,
    totalTokens: response.usage?.total_tokens,
    outputTypes,
    incompleteReason,
    details: JSON.stringify({
      model: response.model,
      maxOutputTokens: MAX_TOKENS,
      usage: response.usage,
      outputTypes,
      incompleteDetails: response.incomplete_details,
    }),
  };
}

function createTokenBudgetError(prefix: string, response: ResponseDiagnosticsSource): AIAutocompleteResponse {
  const diagnostics = createResponseDiagnostics(response);
  const tokenMessage =
    diagnostics.outputTokens !== undefined
      ? ` Used ${diagnostics.outputTokens}/${MAX_TOKENS} output tokens${
          diagnostics.reasoningTokens !== undefined ? `, including ${diagnostics.reasoningTokens} reasoning tokens` : ''
        }.`
      : '';
  const reasonMessage = diagnostics.incompleteReason ? ` Reason: ${diagnostics.incompleteReason}.` : '';

  return {
    success: false,
    error: `${prefix}.${tokenMessage}${reasonMessage}`,
    model: response.model,
    tokensUsed: diagnostics.totalTokens,
    errorDetails: {
      message: prefix,
      type: 'OpenAIIncompleteResponse',
      details: diagnostics.details,
    },
  };
}

function getSchemaFields(schema: StructuredOutputSchema): AICompletableField[] {
  return schema.keyof().options as AICompletableField[];
}

const PART_OF_SPEECH_CONFIG: Record<PartOfSpeech, PartOfSpeechConfig> = {
  verb: {
    schema: VerbStructuredOutputSchema,
    partOfSpeech: 'verb',
  },
  noun: {
    schema: NounStructuredOutputSchema,
    partOfSpeech: 'noun',
  },
  adjective: {
    schema: AdjectiveStructuredOutputSchema,
    partOfSpeech: 'adjective',
  },
  pronoun: {
    schema: PronounStructuredOutputSchema,
    partOfSpeech: 'pronoun',
  },
  adverb: {
    schema: AdverbStructuredOutputSchema,
    partOfSpeech: 'adverb',
  },
  preposition: {
    schema: PrepositionStructuredOutputSchema,
    partOfSpeech: 'preposition',
  },
  conjunction: {
    schema: ConjunctionStructuredOutputSchema,
    partOfSpeech: 'conjunction',
  },
  interjection: {
    schema: InterjectionStructuredOutputSchema,
    partOfSpeech: 'interjection',
  },
};

function selectFields(partOfSpeech: PartOfSpeech, fields?: AICompletableField[]) {
  const config = PART_OF_SPEECH_CONFIG[partOfSpeech];
  if (!config) {
    return [];
  }

  const schemaFields = getSchemaFields(config.schema);

  if (!fields || fields.length === 0) {
    return schemaFields;
  }
  return fields.filter(field => schemaFields.includes(field));
}

function isValueEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return true;
    }
    return value.every(item => isValueEmpty(item));
  }

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    if ('full_form' in obj && 'shortened_form' in obj) {
      const fullFormEmpty = isValueEmpty(obj.full_form);
      const shortenedFormEmpty = isValueEmpty(obj.shortened_form);
      return fullFormEmpty && shortenedFormEmpty;
    }

    const objValues = Object.values(obj);
    if (objValues.length === 0) {
      return true;
    }
    return objValues.every(v => isValueEmpty(v));
  }

  return false;
}

function shouldOverwrite(existingValue: unknown, overwriteExisting?: boolean) {
  if (overwriteExisting) {
    return true;
  }
  return isValueEmpty(existingValue);
}

function isWordForm(value: unknown): value is { full_form?: string; shortened_form?: string } {
  return typeof value === 'object' && value !== null && ('full_form' in value || 'shortened_form' in value);
}

function isWordFormIncomplete(value: unknown): boolean {
  if (!isWordForm(value)) {
    return false;
  }
  const fullFormEmpty = isValueEmpty(value.full_form);
  const shortenedFormEmpty = isValueEmpty(value.shortened_form);
  return fullFormEmpty || shortenedFormEmpty;
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
      return shouldOverwrite(existingItem, overwriteExisting) ? incomingItem : existingItem;
    });
  }

  if (isWordForm(existingValue) && isWordForm(incomingValue)) {
    return mergeWordForm(existingValue, incomingValue);
  }

  return shouldOverwrite(existingValue, overwriteExisting) ? incomingValue : existingValue;
}

function calculateCost(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): CostBreakdown {
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? 0;

  const inputCostPer1M = 0.75;
  const outputCostPer1M = 4.5;

  const inputCost = (promptTokens / 1_000_000) * inputCostPer1M;
  const outputCost = (completionTokens / 1_000_000) * outputCostPer1M;
  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
    tokens: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
  };
}

export async function autocompleteVocabularyWord(request: AIAutocompleteRequest): Promise<AIAutocompleteResponse> {
  console.log('[Autocomplete] Starting autocomplete for:', request.word, request.part_of_speech);

  const config = PART_OF_SPEECH_CONFIG[request.part_of_speech];
  if (!config) {
    console.error('[Autocomplete] Unsupported part of speech:', request.part_of_speech);
    return { success: false, error: `Unsupported part of speech: ${request.part_of_speech}` };
  }

  console.log('[Autocomplete] Using schema:', config.schema.constructor.name);
  console.log('[Autocomplete] Model:', AUTOCOMPLETE_MODEL);
  console.log('[Autocomplete] Max tokens:', MAX_TOKENS);

  try {
    console.log('[Autocomplete] Calling OpenAI API...');
    console.log('[Autocomplete] Request details:', {
      model: AUTOCOMPLETE_MODEL,
      maxTokens: MAX_TOKENS,
      schemaName: `${request.part_of_speech}_structured_output`,
    });

    const responseFormat = zodResponseFormat(config.schema, `${request.part_of_speech}_structured_output`);

    const startTime = Date.now();
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
    const endTime = Date.now();

    console.log('[Autocomplete] OpenAI API response received in', endTime - startTime, 'ms');
    console.log('[Autocomplete] Response ID:', response.id);
    console.log('[Autocomplete] Response model:', response.model);
    console.log('[Autocomplete] Output items count:', response.output?.length || 0);
    console.log('[Autocomplete] Usage:', JSON.stringify(response.usage, null, 2));
    console.log('[Autocomplete] Full response object keys:', Object.keys(response));

    const messageItem = response.output.find(item => item.type === 'message');
    if (!messageItem || messageItem.type !== 'message') {
      console.error('[Autocomplete] No message item in response');
      return createTokenBudgetError('OpenAI did not produce structured vocabulary JSON', response);
    }

    console.log('[Autocomplete] Message status:', messageItem.status);

    if (messageItem.status === 'incomplete') {
      console.error('[Autocomplete] Response incomplete');
      return createTokenBudgetError('OpenAI started the vocabulary JSON but did not finish it', response);
    }

    const textContent = messageItem.content.find(c => c.type === 'output_text');
    if (!textContent || textContent.type !== 'output_text') {
      console.error('[Autocomplete] No text content in message');
      return { success: false, error: 'No text content in response' };
    }

    console.log('[Autocomplete] Parsing structured output...');
    const structured = JSON.parse(textContent.text) as StructuredOutput;

    if (!structured) {
      console.error('[Autocomplete] No structured output in message');
      console.error('[Autocomplete] Message content:', textContent.text);
      return { success: false, error: 'No structured output returned by the model' };
    }

    console.log('[Autocomplete] Structured output received:', Object.keys(structured));
    console.log('[Autocomplete] Full structured output:', JSON.stringify(structured, null, 2));

    if ('principal_parts' in structured) {
      console.log(
        '[Autocomplete] Principal parts in AI response:',
        JSON.stringify(structured.principal_parts, null, 2)
      );
    }

    if ('nominative_singular' in structured) {
      console.log(
        '[Autocomplete] Nominative singular in AI response:',
        JSON.stringify(structured.nominative_singular, null, 2)
      );
    }

    if ('genitive_singular' in structured) {
      console.log(
        '[Autocomplete] Genitive singular in AI response:',
        JSON.stringify(structured.genitive_singular, null, 2)
      );
    }

    if ('alternate_form' in structured) {
      console.log('[Autocomplete] Alternate form in AI response:', JSON.stringify(structured.alternate_form, null, 2));
    }

    if ('conjugation_table' in structured && structured.conjugation_table) {
      const participles = structured.conjugation_table?.nonFinite?.participle;
      console.log('[Autocomplete] Participles in AI response:', JSON.stringify(participles, null, 2));
      console.log('[Autocomplete] Present active participle:', participles?.present?.active);
      console.log('[Autocomplete] Perfect passive participle:', participles?.perfect?.passive);
      console.log('[Autocomplete] Future active participle:', participles?.future?.active);
    }

    const existing = request.existingData ?? {};
    console.log('[Autocomplete] Existing data fields:', Object.keys(existing));
    console.log('[Autocomplete] Existing principal_parts:', (existing as any).principal_parts);
    console.log('[Autocomplete] Existing alternate_form:', (existing as any).alternate_form);

    const selectedFields = request.fieldsToComplete
      ? selectFields(request.part_of_speech, request.fieldsToComplete)
      : getSchemaFields(config.schema);

    console.log('[Autocomplete] Selected fields to process:', selectedFields);

    const data: Partial<VocabularyWord> = {
      part_of_speech: config.partOfSpeech,
    };

    for (const field of selectedFields) {
      const structuredValue = (structured as Record<string, unknown>)[field];
      const existingValue = (existing as Record<string, unknown>)[field];

      (data as Record<string, unknown>)[field] = mergeValue(existingValue, structuredValue, request.overwriteExisting);
    }

    const cost = response.usage ? calculateCost(response.usage) : undefined;

    const fieldStatus: Record<string, 'filled' | 'missing'> = {};
    const allExpectedFields = getSchemaFields(config.schema);

    for (const field of allExpectedFields) {
      const existingValue = (existing as Record<string, unknown>)[field];
      const structuredValue = (structured as Record<string, unknown>)[field];
      const mergedValue = (data as Record<string, unknown>)[field];

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

        const aiProvidedValue = !isValueEmpty(structuredValue);
        fieldStatus[field] = isNowComplete && aiProvidedValue ? 'filled' : 'missing';
      }
    }

    console.log('[Autocomplete] Field status:', fieldStatus);
    console.log('[Autocomplete] Success! Generated fields:', Object.keys(data));
    console.log('[Autocomplete] Data being returned to client:', JSON.stringify(data, null, 2));
    console.log('[Autocomplete] Tokens used:', response.usage?.total_tokens);
    console.log('[Autocomplete] Cost:', cost?.totalCost.toFixed(4));
    console.log(`[Autocomplete] ✅ OPENAI CALL COMPLETED: ${((endTime - startTime) / 1000).toFixed(2)}s`);

    return {
      success: true,
      data,
      tokensUsed: response.usage?.total_tokens,
      model: response.model,
      cost,
      fieldStatus,
    };
  } catch (error) {
    console.error('[Autocomplete] Error caught:', error);
    console.error('[Autocomplete] Error type:', error?.constructor?.name);
    console.error('[Autocomplete] Error message:', error instanceof Error ? error.message : 'Unknown');
    console.error('[Autocomplete] Error stack:', error instanceof Error ? error.stack : 'No stack');

    const message = error instanceof Error ? error.message : 'Unknown error while requesting autocomplete';
    const errorDetails = {
      message,
      type: error?.constructor?.name || typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      details: error instanceof Error ? String(error) : String(error),
    };
    return { success: false, error: message, errorDetails };
  }
}
