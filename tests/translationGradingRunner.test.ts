import { TRANSLATION_GRADING_PROFILES } from '@/shared/openai/model-registry';
import { runTranslationGrading } from '@/shared/openai/translation-grading';
import { openai } from '@/shared/openai/client';

jest.mock('@/shared/openai/client', () => ({
  openai: { responses: { create: jest.fn() } },
  DEFAULT_MODEL: 'gpt-5.4-mini',
  AUTOCOMPLETE_MODEL: 'gpt-5.4-mini',
  TRANSLATION_GRADING_MODEL: 'gpt-5.4-mini',
  DEFAULT_TEMPERATURE: 0.2,
  MAX_TOKENS: 32000,
}));

const createResponse = jest.mocked(openai.responses.create);

const output = {
  grade: 'A',
  notes: 'Strong work.',
  suggestedText: 'All Gaul is divided.',
  breakdown: [],
  grammaticalBreakdown: [],
};

const usage = {
  input_tokens: 100,
  output_tokens: 50,
  total_tokens: 150,
  input_tokens_details: { cached_tokens: 20 },
  output_tokens_details: { reasoning_tokens: 12 },
};

const responseFor = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'response-1',
    object: 'response',
    created_at: 0,
    model: TRANSLATION_GRADING_PROFILES.candidate.model,
    output: [
      {
        type: 'message',
        id: 'message-1',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text: JSON.stringify(output), annotations: [] }],
      },
    ],
    usage,
    ...overrides,
  }) as never;

const request = {
  sourceText: 'Gallia est omnis divisa.',
  userTranslation: 'All Gaul is divided.',
  direction: 'latin-to-english' as const,
};

describe('translation grading runner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createResponse.mockResolvedValue(responseFor());
  });

  it('reuses the production schema/prompt runner for the high-reasoning candidate profile', async () => {
    const result = await runTranslationGrading(request, TRANSLATION_GRADING_PROFILES.candidate);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual(output);
    expect(result.requestedModel).toBe('gpt-5.6-luna');
    expect(result.usage?.cachedInputTokens).toBe(20);
    expect(result.usage?.reasoningTokens).toBe(12);
    expect(result.cost?.pricingVersion).toBe('2026-08-01');

    const call = createResponse.mock.calls[0][0];
    expect(call).toEqual(
      expect.objectContaining({
        model: 'gpt-5.6-luna',
        reasoning: { effort: 'high' },
        prompt_cache_key: expect.stringMatching(/^translation-grading-v2:candidate:shard-[0-3]$/),
        prompt_cache_options: { mode: 'explicit', ttl: '30m' },
        service_tier: 'default',
        store: false,
      })
    );
    expect(call.input).toEqual([
      expect.objectContaining({
        type: 'message',
        role: 'user',
        content: [
          expect.objectContaining({
            type: 'input_text',
            text: expect.stringContaining('Provide:'),
            prompt_cache_breakpoint: { mode: 'explicit' },
          }),
          expect.objectContaining({
            type: 'input_text',
            text: expect.stringContaining("Student's translation (English): All Gaul is divided."),
          }),
        ],
      }),
    ]);
  });

  it('keeps pre-GPT-5.6 profiles on automatic caching without unsupported fields', async () => {
    await runTranslationGrading(request, TRANSLATION_GRADING_PROFILES.baseline);

    const call = createResponse.mock.calls[0][0];
    expect(call.prompt_cache_options).toBeUndefined();
    expect(call.prompt_cache_key).toBe('translation-grading-v2:baseline');
    expect(typeof call.input).toBe('string');
    expect(String(call.input)).toContain("Student's translation (English): All Gaul is divided.");
  });

  it.each([
    ['incomplete', 'response-incomplete', 'Response was incomplete'],
    ['malformed JSON', 'response-malformed-json', 'not-json'],
  ])('preserves billable usage when the provider returns %s', async (_label, code, text) => {
    const response = responseFor({
      output: [
        {
          type: 'message',
          id: 'message-1',
          status: code === 'response-incomplete' ? 'incomplete' : 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text, annotations: [] }],
        },
      ],
    });
    createResponse.mockResolvedValue(response);

    const result = await runTranslationGrading(request, TRANSLATION_GRADING_PROFILES.candidate);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe(code);
    expect(result.error).toBe(
      code === 'response-incomplete'
        ? 'The translation grader returned an incomplete response.'
        : 'The translation grader returned malformed structured output.'
    );
    expect(result.model).toBe('gpt-5.6-luna');
    expect(result.usage?.totalTokens).toBe(150);
    expect(result.costMeasurement.status).toBe('measured');
    expect(result.cost?.totalCost).toBeGreaterThan(0);
  });

  it('marks cost unavailable instead of fabricating zero when usage is absent', async () => {
    createResponse.mockResolvedValue(responseFor({ usage: undefined }));

    const result = await runTranslationGrading(request, TRANSLATION_GRADING_PROFILES.candidate);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.usage).toBeUndefined();
    expect(result.cost).toBeUndefined();
    expect(result.costMeasurement).toEqual({
      status: 'unavailable',
      reason: 'The provider did not return complete token usage.',
    });
  });

  it('returns a stable public error and unavailable cost for network failures', async () => {
    createResponse.mockRejectedValue(new Error('private provider request id and response body'));

    const result = await runTranslationGrading(request, TRANSLATION_GRADING_PROFILES.candidate);

    expect(result).toMatchObject({
      success: false,
      code: 'provider-error',
      error: 'The translation grader could not complete this request.',
      costMeasurement: { status: 'unavailable' },
    });
    expect(JSON.stringify(result)).not.toContain('private provider request id');
  });
});
