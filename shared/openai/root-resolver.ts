import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { openai, DEFAULT_MODEL } from './client';
import { PartOfSpeechSchema } from '../types/vocabulary/schemas/enums';
import type { RootWordCandidate } from '../types/vocabulary/requests';

const RootWordCandidateSchema = z.object({
  word: z.string().min(1),
  part_of_speech: PartOfSpeechSchema,
  dictionary_entry: z.string().nullable().optional(),
  translation_hint: z.string().nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string().nullable().optional(),
});

const RootResolverOutputSchema = z.object({
  candidates: z.array(RootWordCandidateSchema).min(1).max(5),
});

export type ResolveRootWordRequest = {
  selectedText: string;
  context?: string;
};

export type ResolveRootWordResponse = {
  success: boolean;
  candidates?: RootWordCandidate[];
  error?: string;
  model?: string;
  tokensUsed?: number;
};

const SYSTEM_PROMPT = [
  'You identify the likely Latin dictionary headword or root for an inflected selected word.',
  'Return only plausible vocabulary entries suitable for a Latin learning app.',
  'If the selected text is ambiguous, return multiple candidates ordered from most likely to least likely.',
  'Use macrons only when you are confident. Prefer standard dictionary forms.',
].join(' ');

const buildPrompt = ({ selectedText, context }: ResolveRootWordRequest) => {
  const trimmedContext = context?.trim();
  return [
    `Selected text: ${selectedText.trim()}`,
    trimmedContext ? `Surrounding context: ${trimmedContext}` : '',
    'Return 1 to 5 root/headword candidates with part of speech and a short reason.',
  ]
    .filter(Boolean)
    .join('\n');
};

export async function resolveRootWord(request: ResolveRootWordRequest): Promise<ResolveRootWordResponse> {
  if (!request.selectedText.trim()) {
    return { success: false, error: 'Selected text is required' };
  }

  try {
    const responseFormat = zodResponseFormat(RootResolverOutputSchema, 'root_word_candidates');
    const response = await openai.responses.create({
      model: DEFAULT_MODEL,
      reasoning: { effort: 'low' },
      max_output_tokens: 2000,
      instructions: SYSTEM_PROMPT,
      input: buildPrompt(request),
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
      return { success: false, error: 'No response from the model', model: response.model };
    }

    const textContent = messageItem.content.find(c => c.type === 'output_text');
    if (!textContent || textContent.type !== 'output_text') {
      return { success: false, error: 'No text content in response', model: response.model };
    }

    const parsed = RootResolverOutputSchema.parse(JSON.parse(textContent.text));

    return {
      success: true,
      candidates: parsed.candidates,
      model: response.model,
      tokensUsed: response.usage?.total_tokens,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error while resolving root word',
    };
  }
}
