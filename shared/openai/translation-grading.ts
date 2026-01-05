import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { openai, DEFAULT_MODEL, MAX_TOKENS } from './client';
import { TranslationGradingRequest, TranslationGradingResponse, CostBreakdown } from './types';

const SYSTEM_PROMPT = `You are a Latin language expert grading student translations.

Grading scale:
- A: Accurate meaning, correct grammar, natural English
- B: Minor errors (word choice, articles) but meaning clear
- C: Some errors but shows understanding of structure
- D: Significant errors but some correct elements
- F: Completely wrong or nonsensical

Use +/- for finer distinction. Be encouraging, not harsh.

In notes: mention strengths first, then areas to improve. Keep it to 2-3 sentences.

Provide a suggested translation.`;

const LetterGradeSchema = z.enum(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']);

const TranslationGradingOutputSchema = z.object({
  grade: LetterGradeSchema,
  notes: z.string(),
  suggestedText: z.string(),
});

export type LetterGrade = z.infer<typeof LetterGradeSchema>;
export type TranslationGradingOutput = z.infer<typeof TranslationGradingOutputSchema>;

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

export async function gradeTranslation(
  request: TranslationGradingRequest
): Promise<TranslationGradingResponse<TranslationGradingOutput>> {
  const { latinText, userTranslation } = request;

  const userPrompt = `Grade this Latin to English translation:

Latin: ${latinText}
Student's translation: ${userTranslation}

Provide a letter grade, notes with feedback, and a suggested translation.`;

  try {
    const responseFormat = zodResponseFormat(TranslationGradingOutputSchema, 'translation_grading_output');

    const response = await openai.responses.create({
      model: DEFAULT_MODEL,
      max_output_tokens: MAX_TOKENS,
      instructions: SYSTEM_PROMPT,
      reasoning: { effort: 'low' },
      input: userPrompt,
      text: {
        format: {
          type: 'json_schema',
          name: responseFormat.json_schema.name,
          schema: responseFormat.json_schema.schema as Record<string, unknown>,
          strict: responseFormat.json_schema.strict ?? true,
        },
      },
    });

    const messageItem = response.output.find(item => item.type === 'message');
    if (!messageItem || messageItem.type !== 'message') {
      return { success: false, error: 'No response from the model' };
    }

    if (messageItem.status === 'incomplete') {
      return { success: false, error: 'Response was incomplete' };
    }

    const textContent = messageItem.content.find(c => c.type === 'output_text');
    if (!textContent || textContent.type !== 'output_text') {
      return { success: false, error: 'No text content in response' };
    }

    const data = JSON.parse(textContent.text) as TranslationGradingOutput;
    const cost = response.usage ? calculateCost(response.usage) : undefined;

    return {
      success: true,
      data,
      tokensUsed: response.usage?.total_tokens,
      model: response.model,
      cost,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = {
      message,
      type: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    };
    return { success: false, error: message, errorDetails };
  }
}
