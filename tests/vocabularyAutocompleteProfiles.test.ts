/** @jest-environment node */
import { autocompleteVocabularyWord, runVocabularyAutocomplete } from '@/shared/openai/autocomplete';
import { openai } from '@/shared/openai/client';

jest.mock('@/shared/openai/client', () => {
  const create = jest.fn();
  return { openai: { responses: { create } } };
});

const create = jest.mocked(openai.responses.create);

const completed = (model: string, text: string) => ({
  model,
  status: 'completed',
  output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text }] }],
  usage: {
    input_tokens: 1_000,
    output_tokens: 4_000,
    total_tokens: 5_000,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 500 },
  },
});

describe('vocabulary autocomplete profiles', () => {
  beforeEach(() => create.mockReset());

  it('keeps the admin editor on GPT-5.4 Mini at low effort', async () => {
    create.mockResolvedValue(completed('gpt-5.4-mini', JSON.stringify({ translation: 'king' })) as never);

    const result = await autocompleteVocabularyWord({ word: 'rēx', part_of_speech: 'noun' });

    expect(create.mock.calls[0][0]).toMatchObject({
      model: 'gpt-5.4-mini',
      reasoning: { effort: 'low' },
      max_output_tokens: 32_000,
    });
    expect(result).toMatchObject({ success: true, model: 'gpt-5.4-mini', data: { translation: 'king' } });
    // 1,000 input at $0.75/M plus 4,000 output at $4.50/M.
    expect(result.cost?.totalCost).toBeCloseTo(0.01875, 12);
  });

  it('runs the candidate on GPT-6.1 Terra at medium effort and prices it', async () => {
    create.mockResolvedValue(completed('gpt-6.1-terra', JSON.stringify({ translation: 'to carry' })) as never);

    const result = await runVocabularyAutocomplete({ word: 'ferō', part_of_speech: 'verb' }, 'candidate', {
      timeout: 1_000,
      maxRetries: 0,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-6.1-terra', reasoning: { effort: 'medium' }, max_output_tokens: 32_000 }),
      { timeout: 1_000, maxRetries: 0 }
    );
    expect(result.success).toBe(true);
    // 1,000 input at $1/M plus 4,000 output at $5/M.
    expect(result.cost?.totalCost).toBeCloseTo(0.021, 12);
  });

  it('reports a verb that runs out of output tokens with the tokens it used and their cost', async () => {
    create.mockResolvedValue({
      model: 'gpt-6.1-terra',
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [
        { type: 'reasoning', status: 'completed' },
        { type: 'message', status: 'incomplete', content: [] },
      ],
      usage: {
        input_tokens: 1_000,
        output_tokens: 32_000,
        total_tokens: 33_000,
        output_tokens_details: { reasoning_tokens: 21_000 },
      },
    } as never);

    const result = await runVocabularyAutocomplete({ word: 'ferō', part_of_speech: 'verb' }, 'candidate');

    expect(result).toMatchObject({
      success: false,
      code: 'token-budget',
      incompleteReason: 'max_output_tokens',
      error:
        'OpenAI started the vocabulary JSON but did not finish it. Used 32000/32000 output tokens, including 21000 reasoning tokens. Reason: max_output_tokens.',
      usage: { completionTokens: 32_000, reasoningTokens: 21_000 },
    });
    expect(result.cost?.totalCost).toBeCloseTo(0.161, 12);
  });
});
