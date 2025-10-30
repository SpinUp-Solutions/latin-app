import { zodResponseFormat } from 'openai/helpers/zod';
import { openai, DEFAULT_MODEL, DEFAULT_TEMPERATURE, MAX_TOKENS } from './client';
import { getPromptForPartOfSpeech, SYSTEM_PROMPT } from './prompts';
import { AIAutocompleteRequest, AIAutocompleteResponse, AICompletableField, CostBreakdown } from './types';
import { PartOfSpeech } from '@/src/types/vocabulary/schemas/enums';
import { VocabularyWord } from '@/src/types/vocabulary/schemas';
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
} from '@/src/types/vocabulary/ai';

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

function shouldOverwrite(existingValue: unknown, overwriteExisting?: boolean) {
  if (overwriteExisting) {
    return true;
  }
  return existingValue === undefined || existingValue === null;
}

function calculateCost(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): CostBreakdown {
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? 0;

  const inputCostPer1M = 0.25;
  const outputCostPer1M = 2.0;

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
  console.log('[Autocomplete] Model:', DEFAULT_MODEL);
  console.log('[Autocomplete] Temperature:', DEFAULT_TEMPERATURE);
  console.log('[Autocomplete] Max tokens:', MAX_TOKENS);

  try {
    console.log('[Autocomplete] Calling OpenAI API...');
    const response = await openai.chat.completions.parse({
      model: DEFAULT_MODEL,
      reasoning_effort: 'low',
      max_completion_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: getPromptForPartOfSpeech(request.part_of_speech, request.word) },
      ],
      response_format: zodResponseFormat(config.schema, `${request.part_of_speech}_structured_output`),
    });

    console.log('[Autocomplete] OpenAI API response received');
    console.log('[Autocomplete] Response status:', response.id ? 'Success' : 'No ID');
    console.log('[Autocomplete] Choices:', response.choices?.length || 0);
    console.log('[Autocomplete] Usage:', response.usage);

    const choice = response.choices[0];
    if (!choice) {
      console.error('[Autocomplete] No choice in response');
      return { success: false, error: 'No response from the model' };
    }

    console.log('[Autocomplete] Finish reason:', choice.finish_reason);

    if (choice.finish_reason === 'length') {
      console.error('[Autocomplete] Response truncated');
      return { success: false, error: 'Response was truncated due to max_tokens limit' };
    }

    if (choice.message.refusal) {
      console.error('[Autocomplete] Model refused:', choice.message.refusal);
      return { success: false, error: choice.message.refusal };
    }

    console.log('[Autocomplete] Parsing structured output...');
    const structured = choice.message.parsed as StructuredOutput | null;

    if (!structured) {
      console.error('[Autocomplete] No structured output in message');
      console.error('[Autocomplete] Message content:', choice.message.content);
      return { success: false, error: 'No structured output returned by the model' };
    }

    console.log('[Autocomplete] Structured output received:', Object.keys(structured));
    console.log('[Autocomplete] Full structured output:', JSON.stringify(structured, null, 2));

    if ('conjugation_table' in structured && structured.conjugation_table) {
      const participles = structured.conjugation_table?.nonFinite?.participle;
      console.log('[Autocomplete] Participles in AI response:', JSON.stringify(participles, null, 2));
      console.log('[Autocomplete] Present active participle:', participles?.present?.active);
      console.log('[Autocomplete] Perfect passive participle:', participles?.perfect?.passive);
      console.log('[Autocomplete] Future active participle:', participles?.future?.active);
    }

    const existing = request.existingData ?? {};
    const selectedFields = request.fieldsToComplete
      ? selectFields(request.part_of_speech, request.fieldsToComplete)
      : getSchemaFields(config.schema);

    const notes = (structured as Record<string, unknown>).notes as string | null | undefined;

    const data: Partial<VocabularyWord> = {
      part_of_speech: config.partOfSpeech,
    };

    for (const field of selectedFields) {
      const structuredValue = (structured as Record<string, unknown>)[field];
      const existingValue = (existing as Record<string, unknown>)[field];

      if (shouldOverwrite(existingValue, request.overwriteExisting)) {
        (data as Record<string, unknown>)[field] = structuredValue;
      }
    }

    const cost = response.usage ? calculateCost(response.usage) : undefined;

    // Calculate field status for visual feedback
    const fieldStatus: Record<string, 'filled' | 'missing'> = {};
    const allExpectedFields = getSchemaFields(config.schema);

    for (const field of allExpectedFields) {
      const existingValue = (existing as Record<string, unknown>)[field];
      const structuredValue = (structured as Record<string, unknown>)[field];

      // Check if field was empty
      const wasEmpty =
        existingValue === undefined ||
        existingValue === null ||
        existingValue === '' ||
        (Array.isArray(existingValue) && existingValue.length === 0);

      if (wasEmpty) {
        // Check if AI provided a value
        const aiProvidedValue =
          structuredValue !== undefined &&
          structuredValue !== null &&
          structuredValue !== '' &&
          !(Array.isArray(structuredValue) && structuredValue.length === 0);

        fieldStatus[field] = aiProvidedValue ? 'filled' : 'missing';
      }
    }

    console.log('[Autocomplete] Field status:', fieldStatus);
    console.log('[Autocomplete] Notes from AI:', notes);
    console.log('[Autocomplete] Success! Generated fields:', Object.keys(data));
    console.log('[Autocomplete] Data being returned to client:', JSON.stringify(data, null, 2));
    console.log('[Autocomplete] Tokens used:', response.usage?.total_tokens);
    console.log('[Autocomplete] Cost:', cost?.totalCost.toFixed(4));

    return {
      success: true,
      data,
      tokensUsed: response.usage?.total_tokens,
      model: response.model,
      cost,
      fieldStatus,
      notes: notes || undefined,
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
