import { openai, TRANSLATION_GRADING_MODEL } from './client';
import { TranslationGradingRequest, TranslationGradingResponse, CostBreakdown } from './types';

const SYSTEM_PROMPT = `You are a Latin language expert grading student translations between Latin and English.
You may be asked to grade Latin -> English or English -> Latin. Follow the specified direction.

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
- Break the source text into logical segments (phrases/clauses)
- Each segment must have these exact properties:
  * latinSegment: The source segment (use this field even if the source is English)
  * yourTranslation: What the student wrote for this segment in the target language
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
]

REQUIRED: You MUST also provide a 'grammaticalBreakdown' array with clause-level syntactical analysis:
- For Latin → English: analyze the Latin source text
- For English → Latin: analyze the student's Latin translation
- Break the Latin text into logical segments (clauses, phrases, or grammatical units)
- For each segment, explain its syntactical role and key grammatical features
- This is high-level syntactic analysis, NOT word-by-word parsing

For each segment provide:
- latinSegment: The Latin clause or phrase
- syntacticalRole: The structural role in the sentence (e.g., "Protasis 1 (Condition)", "Apodosis (Conclusion)", "Subordinate Clause", "Relative Clause", "Object Phrase", "Participial Phrase", "Subject")
- keyGrammaticalFeatures: Prose explanation of the important grammar (e.g., "Partitive Genitive: ingeni (of talent) depends on quid", "Indirect Question: quam sit. Subjunctive: sit (present subjunctive)")
- notes: Additional context or explanation (e.g., "Quid is the indefinite pronoun after si", "Refers to his liberal arts education")

Example grammaticalBreakdown for "Si quid est in me ingeni, quod sentio quam sit exiguum, hic A. Licinius fructum repetere debet":
[
  {
    "latinSegment": "Si quid est in me ingeni",
    "syntacticalRole": "Protasis (Condition)",
    "keyGrammaticalFeatures": "Partitive Genitive: ingeni (of talent) depends on quid (anything).",
    "notes": "Quid is the indefinite pronoun after si."
  },
  {
    "latinSegment": "quod sentio quam sit exiguum",
    "syntacticalRole": "Subordinate Clause",
    "keyGrammaticalFeatures": "Indirect Question: quam sit (how it is). Subjunctive: sit (present subjunctive).",
    "notes": "The subjunctive is used because the question is indirect."
  },
  {
    "latinSegment": "hic A. Licinius",
    "syntacticalRole": "Subject",
    "keyGrammaticalFeatures": "Demonstrative Pronoun: hic (this man here).",
    "notes": "Points to the defendant in the room."
  },
  {
    "latinSegment": "fructum... repetere... debet",
    "syntacticalRole": "Apodosis (Conclusion)",
    "keyGrammaticalFeatures": "Main Verb: debet (3rd sing. pres. indic.). Complementary Infinitive: repetere.",
    "notes": "The conclusion of the conditional sentence."
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

export interface GrammaticalBreakdownItem {
  latinSegment: string;
  syntacticalRole: string;
  keyGrammaticalFeatures: string;
  notes: string;
}

export interface TranslationGradingOutput {
  grade: LetterGrade;
  notes: string;
  suggestedText: string;
  breakdown: BreakdownItem[];
  grammaticalBreakdown: GrammaticalBreakdownItem[];
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
    grammaticalBreakdown: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          latinSegment: { type: 'string' },
          syntacticalRole: { type: 'string' },
          keyGrammaticalFeatures: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['latinSegment', 'syntacticalRole', 'keyGrammaticalFeatures', 'notes'],
        additionalProperties: false,
      },
    },
  },
  required: ['grade', 'notes', 'suggestedText', 'breakdown', 'grammaticalBreakdown'],
  additionalProperties: false,
} as const;

function calculateOpenAICost(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): CostBreakdown {
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? 0;

  // gpt-5-mini pricing
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

interface GradingCallResult {
  data: TranslationGradingOutput;
  model: string;
  tokensUsed?: number;
  cost?: CostBreakdown;
}

async function callOpenAIGrading(userPrompt: string): Promise<GradingCallResult> {
  const response = await openai.responses.create({
    model: TRANSLATION_GRADING_MODEL,
    max_output_tokens: 5000,

    instructions: SYSTEM_PROMPT,
    reasoning: { effort: 'medium' },
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
    throw new Error('No response from the model');
  }

  if (messageItem.status === 'incomplete') {
    throw new Error('Response was incomplete');
  }

  const textContent = messageItem.content.find(c => c.type === 'output_text');
  if (!textContent || textContent.type !== 'output_text') {
    throw new Error('No text content in response');
  }

  const data = JSON.parse(textContent.text) as TranslationGradingOutput;
  const cost = response.usage ? calculateOpenAICost(response.usage) : undefined;

  return {
    data,
    model: response.model,
    tokensUsed: response.usage?.total_tokens,
    cost,
  };
}

export async function gradeTranslation(
  request: TranslationGradingRequest
): Promise<TranslationGradingResponse<TranslationGradingOutput>> {
  const { sourceText, userTranslation, direction } = request;
  const sourceLanguage = direction === 'english-to-latin' ? 'English' : 'Latin';
  const targetLanguage = direction === 'english-to-latin' ? 'Latin' : 'English';

  console.log(`[gradeTranslation] Starting with OpenAI`);
  console.log(`[gradeTranslation] Direction: ${direction}`);
  console.log(`[gradeTranslation] Source text: "${sourceText.substring(0, 50)}..."`);

  const userPrompt = `Grade this ${sourceLanguage} to ${targetLanguage} translation:

Source (${sourceLanguage}): ${sourceText}
Student's translation (${targetLanguage}): ${userTranslation}

Provide:
1. A letter grade
2. Notes with overall feedback (2-3 sentences)
3. A suggested translation
4. A breakdown array analyzing the translation segment-by-segment
5. A grammaticalBreakdown array with phrase-based grammatical analysis of the Latin text (source for Latin -> English, student's translation for English -> Latin)`;

  try {
    console.log(`[gradeTranslation] Calling OPENAI...`);
    const startTime = Date.now();
    const result = await callOpenAIGrading(userPrompt);

    const elapsed = Date.now() - startTime;
    console.log(`[gradeTranslation] ✅ OPENAI responded in ${elapsed}ms`);
    console.log(`[gradeTranslation] Model used: ${result.model}`);
    console.log(`[gradeTranslation] Tokens: ${result.tokensUsed}, Grade: ${result.data.grade}`);

    return {
      success: true,
      data: result.data,
      tokensUsed: result.tokensUsed,
      model: result.model,
      cost: result.cost,
    };
  } catch (error) {
    console.error(`[gradeTranslation] ❌ Error with OpenAI:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = {
      message,
      type: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    };
    return { success: false, error: message, errorDetails };
  }
}
