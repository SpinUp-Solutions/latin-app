import { z } from 'zod';
import { openai } from './client';
import {
  calculateProfileCost,
  parseOpenAIUsage,
  TRANSLATION_GRADING_PROFILES,
  type TranslationGradingProfile,
} from './model-registry';
import {
  CostMeasurement,
  TranslationGradingRequest,
  TranslationGradingResponse,
  CostBreakdown,
  LETTER_GRADES,
  type LetterGrade,
  TokenUsage,
} from './types';

const SYSTEM_PROMPT = `You are a warm, encouraging Latin tutor helping students grow through thoughtful feedback on their translations.
You may be asked to grade Latin -> English or English -> Latin. Follow the specified direction.

Grading scale:
- A: Accurate meaning, correct grammar, natural English
- B: Minor errors (word choice, articles) but meaning clear
- C: Some errors but shows understanding of structure
- D: Significant errors but some correct elements
- F: Completely wrong or nonsensical

Use +/- for finer distinction. Celebrate effort and progress. Frame corrections as opportunities to grow.

In notes: lead with genuine praise for what the student did well, then gently suggest areas to improve. Keep it to 2-3 sentences.

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

const breakdownItemSchema = z
  .object({
    latinSegment: z.string(),
    yourTranslation: z.string(),
    feedback: z.string(),
    type: z.string(),
  })
  .strict();

const grammaticalBreakdownItemSchema = z
  .object({
    latinSegment: z.string(),
    syntacticalRole: z.string(),
    keyGrammaticalFeatures: z.string(),
    notes: z.string(),
  })
  .strict();

export const translationGradingOutputSchema = z
  .object({
    grade: z.enum(LETTER_GRADES),
    notes: z.string(),
    suggestedText: z.string(),
    breakdown: z.array(breakdownItemSchema),
    grammaticalBreakdown: z.array(grammaticalBreakdownItemSchema),
  })
  .strict();

export function parseTranslationGradingOutput(value: unknown): TranslationGradingOutput {
  return translationGradingOutputSchema.parse(value) as TranslationGradingOutput;
}

export type TranslationGradingFailureCode =
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

export interface TranslationGradingRunSuccess extends TranslationGradingRunBase {
  success: true;
  data: TranslationGradingOutput;
}

export interface TranslationGradingRunFailure extends TranslationGradingRunBase {
  success: false;
  code: TranslationGradingFailureCode;
  /** Stable, safe-to-display message. Raw provider details stay in server logs. */
  error: string;
}

export type TranslationGradingRunResult = TranslationGradingRunSuccess | TranslationGradingRunFailure;

const PROMPT_INSTRUCTIONS = `Grade the supplied translation according to the requested direction.

Provide:
1. A letter grade
2. Notes with overall feedback (2-3 sentences)
3. A suggested translation
4. A breakdown array analyzing the translation segment-by-segment
5. A grammaticalBreakdown array with phrase-based grammatical analysis of the Latin text (source for Latin -> English, student's translation for English -> Latin)`;

export function buildTranslationGradingPrompt(request: TranslationGradingRequest): string {
  const { stablePrefix, variableSuffix } = buildTranslationGradingPromptParts(request);
  return `${stablePrefix}\n\n${variableSuffix}`;
}

export function buildTranslationGradingPromptParts(request: TranslationGradingRequest): {
  stablePrefix: string;
  variableSuffix: string;
} {
  const { sourceText, userTranslation, direction } = request;
  const sourceLanguage = direction === 'english-to-latin' ? 'English' : 'Latin';
  const targetLanguage = direction === 'english-to-latin' ? 'Latin' : 'English';

  return {
    stablePrefix: PROMPT_INSTRUCTIONS,
    variableSuffix: `Direction: ${sourceLanguage} to ${targetLanguage}\nSource (${sourceLanguage}): ${sourceText}\nStudent's translation (${targetLanguage}): ${userTranslation}`,
  };
}

const PROMPT_CACHE_SHARDS = 4;

/**
 * Automatic prompt caching benefits from one stable routing key. Explicit
 * caching uses shards so an evaluation burst is spread across cache routes.
 */
export function promptCacheKeyFor(profile: TranslationGradingProfile, variableSuffix: string): string {
  if (profile.promptCacheMode === 'automatic') return profile.promptCacheKey;

  let hash = 2166136261;
  for (let index = 0; index < variableSuffix.length; index += 1) {
    hash ^= variableSuffix.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${profile.promptCacheKey}:shard-${(hash >>> 0) % PROMPT_CACHE_SHARDS}`;
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

async function callOpenAIGrading(
  prompt: ReturnType<typeof buildTranslationGradingPromptParts>,
  profile: TranslationGradingProfile
): Promise<TranslationGradingRunResult> {
  const startTime = Date.now();
  let response: Awaited<ReturnType<typeof openai.responses.create>>;
  try {
    const explicitPromptCaching = profile.promptCacheMode === 'explicit';
    response = await openai.responses.create({
      model: profile.model,
      max_output_tokens: profile.maxOutputTokens,
      instructions: SYSTEM_PROMPT,
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
      prompt_cache_key: promptCacheKeyFor(profile, prompt.variableSuffix),
      ...(explicitPromptCaching ? { prompt_cache_options: { mode: 'explicit' as const, ttl: '30m' as const } } : {}),
      service_tier: 'default',
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'translation_grading_output',
          schema: TRANSLATION_GRADING_JSON_SCHEMA as Record<string, unknown>,
          strict: true,
        },
      },
    });
  } catch (error) {
    // The raw SDK error is useful in server logs, but never send it to an
    // admin browser response where it may contain request or provider data.
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

  // Capture usage immediately while the complete provider response is still
  // available. Validation failures below must retain these billable metrics.
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

  const parsed = translationGradingOutputSchema.safeParse(parsedJson);
  if (!parsed.success) {
    console.error('[translation-grading] invalid structured response', parsed.error);
    return {
      ...base,
      success: false,
      code: 'response-invalid-output',
      error: 'The translation grader returned invalid structured output.',
    };
  }

  return {
    ...base,
    success: true,
    data: parsed.data as TranslationGradingOutput,
  };
}

export async function runTranslationGrading(
  request: TranslationGradingRequest,
  profile: TranslationGradingProfile = TRANSLATION_GRADING_PROFILES.baseline
): Promise<TranslationGradingRunResult> {
  return callOpenAIGrading(buildTranslationGradingPromptParts(request), profile);
}

export async function gradeTranslation(
  request: TranslationGradingRequest
): Promise<TranslationGradingResponse<TranslationGradingOutput>> {
  console.log(`[gradeTranslation] Starting with OpenAI`);
  console.log(`[gradeTranslation] Direction: ${request.direction}`);
  console.log(`[gradeTranslation] Source text: "${request.sourceText.substring(0, 50)}..."`);

  try {
    console.log(`[gradeTranslation] Calling OPENAI...`);
    const result = await runTranslationGrading(request, TRANSLATION_GRADING_PROFILES.baseline);

    if (!result.success) {
      console.warn(`[gradeTranslation] ${result.code}: ${result.error}`);
      return {
        success: false,
        error: result.error,
        errorDetails: { message: result.error, type: result.code },
        tokensUsed: result.tokensUsed,
        model: result.model,
        cost: result.cost,
      };
    }

    console.log(`[gradeTranslation] ✅ OPENAI responded in ${result.latencyMs}ms`);
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
    console.error(`[gradeTranslation] ❌ Unexpected grading error:`, error);
    return {
      success: false,
      error: 'The translation grader could not complete this request.',
      errorDetails: { message: 'The translation grader could not complete this request.', type: 'unexpected-error' },
    };
  }
}
