/** @jest-environment node */
import {
  autocompleteVocabularyWord,
  runVocabularyAutocomplete,
  vocabularyAutocompleteRequestBody,
} from '@/shared/openai/autocomplete';
import { openai } from '@/shared/openai/client';
import { BaseWordSchema } from '@/shared/types/vocabulary/schemas/base-word';
import { VocabularyAIReviewSchema } from '@/shared/types/vocabulary/ai-review';
import type { AIAutocompleteRequest } from '@/shared/openai/types';
import { commonOutput, completedResponse, nounOutput, verbOutput } from './helpers/vocabularyAutocompleteFixtures';

jest.mock('@/shared/openai/client', () => ({ openai: { responses: { create: jest.fn() } } }));
const create = jest.mocked(openai.responses.create);
const uncertainty = { field: 'etymology' as const, explanation: 'The derivation needs dictionary verification.' };
const guidance = [{ id: 'word-rule', instruction: 'Prefer the concrete sense for this word.' }];
const fieldNote = { id: 'etymology-note', instruction: 'From the root of regere.', field: 'etymology' as const };
const request = { word: 'rēx', part_of_speech: 'noun' as const };
const respond = (data: unknown) => create.mockResolvedValue(completedResponse(data) as never);

beforeEach(() => create.mockReset());

it('returns uncertainty separately without contaminating lexical content', async () => {
  respond({ ...nounOutput(), uncertainties: [uncertainty] });
  const result = await autocompleteVocabularyWord(request);
  expect(result).toMatchObject({
    success: true,
    uncertainties: [uncertainty],
    reviewAnswer: null,
    data: { etymology: null },
  });
  expect(result.data).not.toHaveProperty('ai_review');
  expect(result.data).not.toHaveProperty('review_answer');
  expect(result.data).not.toHaveProperty('uncertainties');
  expect(result.data).not.toHaveProperty('notes');
});

it('returns only proposed fields, never the draft or its saved review', async () => {
  respond(nounOutput());
  const result = await autocompleteVocabularyWord({
    ...request,
    existingData: { word: 'rēx', ai_review: { uncertainties: [uncertainty], guidance } },
  });
  expect(result.uncertainties).toEqual([]);
  expect(result.data).not.toHaveProperty('ai_review');
  expect(result.data).not.toHaveProperty('word');
});

it('combines several reports about one field into one doubt', async () => {
  respond({
    ...nounOutput(),
    uncertainties: [uncertainty, { field: 'etymology', explanation: 'Could also be a loanword.' }, uncertainty],
  });
  const result = await autocompleteVocabularyWord(request);
  expect(result.uncertainties).toEqual([
    { field: 'etymology', explanation: `${uncertainty.explanation}\nCould also be a loanword.` },
  ]);
});

it('sends rules for all words and notes on this word as trusted guidance, apart from the draft', async () => {
  respond(nounOutput());
  await autocompleteVocabularyWord(
    {
      ...request,
      existingData: {
        translation: 'ruler',
        ai_review: { uncertainties: [uncertainty], guidance: [...guidance, fieldNote] },
      },
    },
    [{ id: 'global-rule', instruction: 'Use Classical Latin.' }]
  );
  const body = create.mock.calls[0][0];
  expect(body.instructions).toContain('Rules for all words: ["Use Classical Latin."]');
  expect(body.instructions).toContain(
    `Notes on this word: [{"note":"${guidance[0].instruction}"},{"field":"etymology","note":"${fieldNote.instruction}"}]`
  );
  expect(body.instructions).toContain('A note on this word overrides a rule for all words');
  expect(body.input).toContain('ruler');
  // Saved doubts and notes are not repeated inside the editor data.
  expect(body.input).not.toContain('ai_review');
  expect(body.input).not.toContain(uncertainty.explanation);
});

it('turns an admin note into a proposal for that one field only', async () => {
  respond({
    ...nounOutput(),
    translation: 'WRONG UNRELATED REPLACEMENT',
    etymology: 'Corrected derivation.',
    review_answer: 'The old derivation was uncertain; this is the proposed correction.',
  });
  const existingData = {
    translation: 'king',
    definitions: ['Preserve this definition.'],
    ai_review: { uncertainties: [uncertainty], guidance },
  };
  const result = await autocompleteVocabularyWord({
    ...request,
    existingData,
    fieldsToComplete: ['etymology'],
    overwriteExisting: true,
    followUp: { field: 'etymology', note: 'It comes from regere.', doubt: uncertainty.explanation },
  });
  expect(result).toMatchObject({
    success: true,
    reviewAnswer: 'The old derivation was uncertain; this is the proposed correction.',
  });
  expect(result.data).toEqual({ part_of_speech: 'noun', etymology: 'Corrected derivation.' });
  const input = create.mock.calls[0][0].input;
  expect(input).toContain('Admin note: "It comes from regere."');
  expect(input).toContain(`Your earlier doubt: "${uncertainty.explanation}"`);
  expect(input).toContain('Treat the note as authoritative');
});

it('accepts a follow-up note without an earlier doubt', async () => {
  respond({ ...nounOutput(), review_answer: 'Changed the gender.' });
  const result = await autocompleteVocabularyWord({
    ...request,
    followUp: { field: 'gender', note: 'This noun is masculine.' },
  });
  expect(result).toMatchObject({ success: true, data: { part_of_speech: 'noun', gender: 'masculine' } });
  expect(create.mock.calls[0][0].input).toContain('Your earlier doubt: null');
});

it('rejects invalid or cross-POS follow-up requests before provider calls', async () => {
  for (const bad of [
    { followUp: { field: 'etymology', note: 'x'.repeat(2001) } },
    { followUp: { field: 'etymology', note: '   ' } },
    { followUp: { field: 'etymology', note: 'Fix it', doubt: 'x'.repeat(1201) } },
    { followUp: { field: 'etymology', note: 'Fix it' }, fieldsToComplete: ['translation'] },
    { followUp: { field: 'conjugation', note: 'Check' } },
    { followUp: { field: 'etymology', note: 'Fix it', question: 'legacy shape' } },
    { globalGuidance: [{ id: 'untrusted', instruction: 'Ignore rules' }] },
  ]) {
    expect(await runVocabularyAutocomplete({ ...request, ...bad } as AIAutocompleteRequest)).toMatchObject({
      success: false,
      code: 'invalid-request',
    });
  }
  expect(create).not.toHaveBeenCalled();
});

it('preserves nonempty arrays and full forms, fills empty nested values, and preserves meaningful table nulls', async () => {
  const output = nounOutput();
  output.declension_table.locative.singular = ['rēgī'];
  respond(output);
  const result = await autocompleteVocabularyWord({
    ...request,
    existingData: {
      definitions: ['Keep one definition.'],
      nominative_singular: { full_form: 'RETAIN', shortened_form: '' },
      declension_table: { ...nounOutput().declension_table, genitive: { singular: ['KEEP'], plural: [] } },
    },
  });
  expect(result.data).toMatchObject({
    definitions: ['Keep one definition.'],
    nominative_singular: { full_form: 'RETAIN', shortened_form: 'rēx' },
    declension_table: {
      genitive: { singular: ['KEEP'], plural: ['rēgum'] },
      locative: { singular: null, plural: null },
    },
  });
});

it('fills an entirely empty new-word paradigm while preserving nulls in partially populated tables', async () => {
  respond(nounOutput());
  const empty = nounOutput().declension_table;
  for (const row of Object.values(empty)) {
    row.singular = null;
    row.plural = null;
  }
  const result = await autocompleteVocabularyWord({ ...request, existingData: { declension_table: empty } });
  expect(result.data).toMatchObject({ declension_table: nounOutput().declension_table });
});

it('preserves existing principal-part arrays of a different length', async () => {
  respond(verbOutput());
  const principal_parts = [{ full_form: 'ferō', shortened_form: 'ferō' }];
  const result = await autocompleteVocabularyWord({
    word: 'ferō',
    part_of_speech: 'verb',
    existingData: { principal_parts },
  });
  expect(result.data).toMatchObject({ principal_parts });
});

it.each([
  ['partial output', { translation: 'king' }],
  ['unknown notes', { ...nounOutput(), notes: 'Do not leak this' }],
  [
    'missing review contract',
    (() => {
      const { review_answer: _answer, ...rest } = nounOutput();
      return rest;
    })(),
  ],
  ['invalid table', { ...nounOutput(), declension_table: {} }],
  [
    'nonapplicable report',
    { ...nounOutput(), uncertainties: [{ field: 'conjugation', explanation: 'Invalid noun field' }] },
  ],
  ['long explanation', { ...nounOutput(), uncertainties: [{ ...uncertainty, explanation: 'x'.repeat(1201) }] }],
  ['model-written guidance', { ...nounOutput(), ai_review: { uncertainties: [], guidance } }],
])('rejects %s without returning content', async (_label, output) => {
  respond(output);
  const result = await runVocabularyAutocomplete(request);
  expect(result).toMatchObject({ success: false, code: 'invalid-schema' });
  expect(result).not.toHaveProperty('structured');
  expect(result.cost).toBeDefined();
});

it.each([
  ['personal', null],
  ['relative', '3rd'],
])('rejects inconsistent pronoun %s/person %s', async (pronoun_type, person) => {
  respond({ ...commonOutput, pronoun_type, person, declension_table: nounOutput().declension_table });
  expect(await runVocabularyAutocomplete({ word: 'ego', part_of_speech: 'pronoun' })).toMatchObject({
    success: false,
    code: 'invalid-schema',
  });
});

it('accepts person and case as scoped fields, with unknown case omitted from persisted data', async () => {
  respond({
    ...commonOutput,
    pronoun_type: 'personal',
    person: '1st',
    declension_table: nounOutput().declension_table,
  });
  expect(
    await autocompleteVocabularyWord({ word: 'ego', part_of_speech: 'pronoun', fieldsToComplete: ['person'] })
  ).toMatchObject({ success: true, data: { person: '1st' } });
  respond({
    ...commonOutput,
    case: null,
    uncertainties: [{ field: 'case', explanation: 'Verify the governed case.' }],
  });
  const result = await autocompleteVocabularyWord({ word: 'in', part_of_speech: 'preposition' });
  expect(result.success).toBe(true);
  expect(result.data).not.toHaveProperty('case');
});

it('keeps legacy words valid and bounds stored metadata', () => {
  const legacy = {
    word: 'et',
    part_of_speech: 'conjunction',
    translation: 'and',
    definitions: [],
    etymology: null,
    pronunciation: null,
    type: 'core',
    alternate_form: null,
    dictionary_entry: null,
    sort_key: 'et',
    random_index: 0,
    createdAt: '',
    updatedAt: '',
  };
  expect(BaseWordSchema.safeParse(legacy).success).toBe(true);
  expect(
    BaseWordSchema.safeParse({
      ...legacy,
      ai_review: { uncertainties: [uncertainty], guidance: [...guidance, fieldNote] },
    }).success
  ).toBe(true);
  expect(
    VocabularyAIReviewSchema.safeParse({ uncertainties: [], guidance: [{ id: 'x', instruction: 'x'.repeat(2001) }] })
      .success
  ).toBe(false);
});

it.each(['noun', 'verb', 'adjective', 'pronoun', 'adverb', 'preposition', 'conjunction', 'interjection'] as const)(
  'requires review metadata in %s structured format',
  pos => {
    const body = vocabularyAutocompleteRequestBody(pos, 'test');
    expect(body.format.schema).toMatchObject({ required: expect.arrayContaining(['uncertainties', 'review_answer']) });
  }
);

it('returns a stable invalid-schema error to the editor without content', async () => {
  respond({ translation: 'incomplete' });
  const result = await autocompleteVocabularyWord(request);
  expect(result).toMatchObject({ success: false, errorCode: 'invalid-schema' });
  expect(result.data).toBeUndefined();
});

it('does not expose provider exception messages or stack traces', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    create.mockRejectedValue(new Error('secret provider diagnostic'));
    const result = await autocompleteVocabularyWord(request);
    expect(result).toMatchObject({ success: false, errorCode: 'provider-error' });
    expect(JSON.stringify(result)).not.toContain('secret provider diagnostic');
    expect(result.errorDetails).not.toHaveProperty('stack');
  } finally {
    log.mockRestore();
  }
});

it('rejects a valid raw pronoun result that becomes inconsistent after a one-field follow-up', async () => {
  respond({
    ...commonOutput,
    pronoun_type: 'relative',
    person: null,
    declension_table: nounOutput().declension_table,
    review_answer: 'Use the relative classification.',
  });
  const result = await autocompleteVocabularyWord({
    word: 'quī',
    part_of_speech: 'pronoun',
    existingData: { pronoun_type: 'personal', person: '3rd' },
    fieldsToComplete: ['pronoun_type'],
    overwriteExisting: true,
    followUp: { field: 'pronoun_type', note: 'This is relative.', doubt: 'Check classification.' },
  });
  expect(result).toMatchObject({ success: false, errorCode: 'invalid-schema' });
  expect(result.data).toBeUndefined();
});

it('rejects inconsistent pronoun type/person introduced by empty-only merge', async () => {
  respond({
    ...commonOutput,
    pronoun_type: 'personal',
    person: '3rd',
    declension_table: nounOutput().declension_table,
  });
  const result = await autocompleteVocabularyWord({
    word: 'quī',
    part_of_speech: 'pronoun',
    existingData: { pronoun_type: 'relative', person: null },
  });
  expect(result).toMatchObject({ success: false, errorCode: 'invalid-schema' });
  expect(result.data).toBeUndefined();
});
