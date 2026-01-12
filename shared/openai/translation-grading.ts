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

Provide a suggested translation.

REQUIRED: You MUST provide a 'breakdown' array with segment-by-segment analysis:
- Break the Latin text into logical segments (phrases/clauses)
- Each segment must have these exact properties:
  * latinSegment: The Latin phrase/clause
  * yourTranslation: What the student wrote for this segment
  * feedback: Specific instructive feedback (e.g., "Excellent. Correct partitive genitive.")
  * type: Use "✓" for correct, "⚠" for issues, or descriptive text like "Grammar" or "Vocabulary"
- Be specific and instructive in feedback for each segment

Example breakdown format:
[
  {
    "latinSegment": "Si quid est in me ingeni",
    "yourTranslation": "If there is any talent in me",
    "feedback": "Excellent. Correct partitive genitive.",
    "type": "✓"
  },
  {
    "latinSegment": "prope suo iure",
    "yourTranslation": "by his own right",
    "feedback": "Missed 'prope' (almost/nearly). Should be 'almost by his own right'.",
    "type": "⚠"
  }
]`;

const LETTER_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'] as const;

export type LetterGrade = (typeof LETTER_GRADES)[number];

export interface BreakdownItem {
  latinSegment: string;
  yourTranslation: string;
  feedback: string;
  type: string;
}

export interface TranslationGradingOutput {
  grade: LetterGrade;
  notes: string;
  suggestedText: string;
  breakdown: BreakdownItem[];
}

const TRANSLATION_GRADING_JSON_SCHEMA = {
  type: 'object',
  properties: {
    grade: {
      type: 'string',
      enum: LETTER_GRADES,
    },
    notes: { type: 'string' },
    suggestedText: { type: 'string' },
    breakdown: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          latinSegment: { type: 'string' },
          yourTranslation: { type: 'string' },
          feedback: { type: 'string' },
          type: { type: 'string' },
        },
        required: ['latinSegment', 'yourTranslation', 'feedback', 'type'],
        additionalProperties: false,
      },
    },
  },
  required: ['grade', 'notes', 'suggestedText', 'breakdown'],
  additionalProperties: false,
} as const;

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

Provide:
1. A letter grade
2. Notes with overall feedback (2-3 sentences)
3. A suggested translation
4. A breakdown array analyzing the translation segment-by-segment`;

  try {
    const response = await openai.responses.create({
      model: DEFAULT_MODEL,
      max_output_tokens: MAX_TOKENS,
      instructions: SYSTEM_PROMPT,
      reasoning: { effort: 'low' },
      input: userPrompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'translation_grading_output',
          schema: TRANSLATION_GRADING_JSON_SCHEMA as Record<string, unknown>,
          strict: true,
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
