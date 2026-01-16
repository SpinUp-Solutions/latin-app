import { openai, DEFAULT_MODEL, MAX_TOKENS } from './client';
import { gemini, DEFAULT_GEMINI_MODEL, GEMINI_MAX_TOKENS } from './gemini-client';
import { TranslationGradingRequest, TranslationGradingResponse, CostBreakdown, AIProvider } from './types';

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
]

REQUIRED: You MUST also provide a 'grammaticalBreakdown' array with phrase-based grammatical analysis:
- Group related words together (e.g., "puella pulchra" as one phrase, not separate entries)
- For each phrase, provide complete morphological parsing
- Use null for grammatical properties that don't apply (e.g., tense is null for nouns)

Phrase grouping guidelines:
- Group noun + adjective phrases together (e.g., "puella pulchra", "vir bonus")
- Group preposition + noun phrases together (e.g., "in urbe", "cum amicis")
- Keep verbs as single entries with all their grammatical information
- Group relative pronouns with their referent if clear

For each phrase provide:
- latinPhrase: The Latin word(s)
- translation: English meaning of this specific phrase
- lemma: Dictionary form of the main word
- partOfSpeech: noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection, participle, infinitive, gerund, gerundive, or supine
- case: nominative, genitive, dative, accusative, ablative, vocative, locative (or null)
- number: singular, plural (or null)
- gender: masculine, feminine, neuter (or null)
- tense: present, imperfect, future, perfect, pluperfect, future_perfect (or null)
- mood: indicative, subjunctive, imperative, infinitive, participle (or null)
- voice: active, passive (or null)
- person: first, second, third (or null)
- syntacticFunction: The role in the sentence (subject, direct_object, indirect_object, main_verb, ablative_of_means, genitive_of_possession, prepositional_phrase, etc.)
- notes: Brief explanation if helpful (or null)

Example grammaticalBreakdown:
[
  {
    "latinPhrase": "Puella pulchra",
    "translation": "The beautiful girl",
    "lemma": "puella",
    "partOfSpeech": "noun",
    "case": "nominative",
    "number": "singular",
    "gender": "feminine",
    "tense": null,
    "mood": null,
    "voice": null,
    "person": null,
    "syntacticFunction": "subject",
    "notes": "pulchra agrees with puella in case, number, and gender"
  },
  {
    "latinPhrase": "amat",
    "translation": "loves",
    "lemma": "amo",
    "partOfSpeech": "verb",
    "case": null,
    "number": "singular",
    "gender": null,
    "tense": "present",
    "mood": "indicative",
    "voice": "active",
    "person": "third",
    "syntacticFunction": "main_verb",
    "notes": null
  },
  {
    "latinPhrase": "puerum",
    "translation": "the boy",
    "lemma": "puer",
    "partOfSpeech": "noun",
    "case": "accusative",
    "number": "singular",
    "gender": "masculine",
    "tense": null,
    "mood": null,
    "voice": null,
    "person": null,
    "syntacticFunction": "direct_object",
    "notes": null
  }
]`;

const LETTER_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'] as const;

export type LetterGrade = (typeof LETTER_GRADES)[number];

// Grammatical breakdown constants
const GRAMMATICAL_PARTS_OF_SPEECH = [
  'noun', 'verb', 'adjective', 'adverb', 'pronoun',
  'preposition', 'conjunction', 'interjection',
  'participle', 'infinitive', 'gerund', 'gerundive', 'supine'
] as const;

const GRAMMATICAL_CASES = [
  'nominative', 'genitive', 'dative', 'accusative',
  'ablative', 'vocative', 'locative'
] as const;

const GRAMMATICAL_NUMBERS = ['singular', 'plural'] as const;

const GRAMMATICAL_GENDERS = ['masculine', 'feminine', 'neuter'] as const;

const GRAMMATICAL_TENSES = [
  'present', 'imperfect', 'future',
  'perfect', 'pluperfect', 'future_perfect'
] as const;

const GRAMMATICAL_MOODS = [
  'indicative', 'subjunctive', 'imperative', 'infinitive', 'participle'
] as const;

const GRAMMATICAL_VOICES = ['active', 'passive'] as const;

const GRAMMATICAL_PERSONS = ['first', 'second', 'third'] as const;

const SYNTACTIC_FUNCTIONS = [
  'subject', 'direct_object', 'indirect_object',
  'predicate_nominative', 'predicate_adjective',
  'genitive_of_possession', 'partitive_genitive', 'genitive_of_description',
  'dative_of_reference', 'dative_of_purpose', 'dative_of_agent',
  'ablative_of_means', 'ablative_of_manner', 'ablative_of_time',
  'ablative_of_place', 'ablative_of_separation', 'ablative_of_agent',
  'ablative_of_comparison', 'ablative_absolute',
  'accusative_of_extent', 'accusative_of_place',
  'vocative_address', 'locative_of_place',
  'prepositional_phrase', 'adverbial_modifier',
  'attributive_adjective', 'appositive',
  'main_verb', 'subordinate_clause', 'relative_clause',
  'purpose_clause', 'result_clause', 'temporal_clause',
  'causal_clause', 'conditional_clause',
  'indirect_statement', 'indirect_question', 'indirect_command'
] as const;

export interface BreakdownItem {
  latinSegment: string;
  yourTranslation: string;
  feedback: string;
  type: string;
}

export interface GrammaticalBreakdownItem {
  latinPhrase: string;
  translation: string;
  lemma: string;
  partOfSpeech: (typeof GRAMMATICAL_PARTS_OF_SPEECH)[number];
  case: (typeof GRAMMATICAL_CASES)[number] | null;
  number: (typeof GRAMMATICAL_NUMBERS)[number] | null;
  gender: (typeof GRAMMATICAL_GENDERS)[number] | null;
  tense: (typeof GRAMMATICAL_TENSES)[number] | null;
  mood: (typeof GRAMMATICAL_MOODS)[number] | null;
  voice: (typeof GRAMMATICAL_VOICES)[number] | null;
  person: (typeof GRAMMATICAL_PERSONS)[number] | null;
  syntacticFunction: (typeof SYNTACTIC_FUNCTIONS)[number];
  notes: string | null;
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
          latinPhrase: { type: 'string' },
          translation: { type: 'string' },
          lemma: { type: 'string' },
          partOfSpeech: {
            type: 'string',
            enum: GRAMMATICAL_PARTS_OF_SPEECH,
          },
          case: {
            type: ['string', 'null'],
            enum: [...GRAMMATICAL_CASES, null],
          },
          number: {
            type: ['string', 'null'],
            enum: [...GRAMMATICAL_NUMBERS, null],
          },
          gender: {
            type: ['string', 'null'],
            enum: [...GRAMMATICAL_GENDERS, null],
          },
          tense: {
            type: ['string', 'null'],
            enum: [...GRAMMATICAL_TENSES, null],
          },
          mood: {
            type: ['string', 'null'],
            enum: [...GRAMMATICAL_MOODS, null],
          },
          voice: {
            type: ['string', 'null'],
            enum: [...GRAMMATICAL_VOICES, null],
          },
          person: {
            type: ['string', 'null'],
            enum: [...GRAMMATICAL_PERSONS, null],
          },
          syntacticFunction: {
            type: 'string',
            enum: SYNTACTIC_FUNCTIONS,
          },
          notes: {
            type: ['string', 'null'],
          },
        },
        required: [
          'latinPhrase', 'translation', 'lemma', 'partOfSpeech',
          'case', 'number', 'gender', 'tense', 'mood', 'voice',
          'person', 'syntacticFunction', 'notes'
        ],
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

function calculateGeminiCost(usage: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}): CostBreakdown {
  const promptTokens = usage.promptTokenCount ?? 0;
  const completionTokens = usage.candidatesTokenCount ?? 0;
  const totalTokens = usage.totalTokenCount ?? 0;

  // gemini-2.0-flash pricing (per 1M tokens)
  const inputCostPer1M = 0.10;
  const outputCostPer1M = 0.40;

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
  provider: AIProvider;
  tokensUsed?: number;
  cost?: CostBreakdown;
}

async function callOpenAIGrading(userPrompt: string): Promise<GradingCallResult> {
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
    provider: 'openai',
    tokensUsed: response.usage?.total_tokens,
    cost,
  };
}

async function callGeminiGrading(userPrompt: string): Promise<GradingCallResult> {
  console.log(`[callGeminiGrading] Using model: ${DEFAULT_GEMINI_MODEL}`);
  console.log(`[callGeminiGrading] GEMINI_API_KEY present: ${!!process.env.GEMINI_API_KEY}`);

  const prompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

  const response = await gemini.models.generateContent({
    model: DEFAULT_GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: TRANSLATION_GRADING_JSON_SCHEMA as Record<string, unknown>,
      maxOutputTokens: GEMINI_MAX_TOKENS,
    },
  });

  console.log(`[callGeminiGrading] Got response from Gemini`);

  const text = response.text;
  if (!text) {
    throw new Error('No text response from Gemini');
  }

  const data = JSON.parse(text) as TranslationGradingOutput;
  const cost = response.usageMetadata ? calculateGeminiCost(response.usageMetadata) : undefined;

  return {
    data,
    model: DEFAULT_GEMINI_MODEL,
    provider: 'gemini',
    tokensUsed: response.usageMetadata?.totalTokenCount,
    cost,
  };
}

export async function gradeTranslation(
  request: TranslationGradingRequest
): Promise<TranslationGradingResponse<TranslationGradingOutput>> {
  const { latinText, userTranslation, provider = 'openai' } = request;

  console.log(`[gradeTranslation] Starting with provider: ${provider}`);
  console.log(`[gradeTranslation] Latin text: "${latinText.substring(0, 50)}..."`);

  const userPrompt = `Grade this Latin to English translation:

Latin: ${latinText}
Student's translation: ${userTranslation}

Provide:
1. A letter grade
2. Notes with overall feedback (2-3 sentences)
3. A suggested translation
4. A breakdown array analyzing the translation segment-by-segment
5. A grammaticalBreakdown array with phrase-based grammatical analysis of the Latin text`;

  try {
    console.log(`[gradeTranslation] Calling ${provider === 'gemini' ? 'GEMINI' : 'OPENAI'}...`);
    const startTime = Date.now();

    const result = provider === 'gemini'
      ? await callGeminiGrading(userPrompt)
      : await callOpenAIGrading(userPrompt);

    const elapsed = Date.now() - startTime;
    console.log(`[gradeTranslation] ✅ ${result.provider.toUpperCase()} responded in ${elapsed}ms`);
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
    console.error(`[gradeTranslation] ❌ Error with provider ${provider}:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = {
      message,
      type: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
    };
    return { success: false, error: message, errorDetails };
  }
}
