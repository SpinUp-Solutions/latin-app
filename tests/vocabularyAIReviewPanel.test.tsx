import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';
import {
  applyFormValuesToWord,
  toFormDefaultValues,
  VocabularyFormSchema,
} from '@/src/types/vocabulary/form-schemas/builder';
import type { VocabularyWordWithId } from '@/shared/types/vocabulary/schemas';

const mockCallable = jest.fn();
const mockSaveGlobal = jest.fn();
const mockRefetch = jest.fn();
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(), httpsCallable: () => mockCallable }));
jest.mock('@/src/store/api/vocabularyAIGuidanceApi', () => ({
  useGetVocabularyAIGuidanceQuery: () => ({ refetch: mockRefetch }),
  useSaveVocabularyAIGuidanceMutation: () => [mockSaveGlobal, { isLoading: false }],
}));
jest.mock('@/src/components/ui/admin/vocabulary/VocabularyAIGlobalGuidance', () => ({
  VocabularyAIGlobalGuidance: () => null,
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const issue = { field: 'etymology' as const, explanation: 'The proposed derivation is uncertain.' };
const row = (singular: string[] | null, plural: string[] | null) => ({ singular, plural });
const noun: VocabularyWordWithId = {
  id: 'rosa',
  word: 'rosa',
  part_of_speech: 'noun',
  translation: 'rose',
  definitions: ['rose'],
  etymology: 'An uncertain derivation',
  pronunciation: null,
  type: 'core',
  alternate_form: null,
  dictionary_entry: 'rosa, rosae',
  sort_key: 'rosa',
  random_index: 0.5,
  createdAt: 'x',
  updatedAt: 'x',
  gender: 'feminine',
  declension: '1',
  nominative_singular: null,
  genitive_singular: null,
  ai_review: { uncertainties: [issue], guidance: [] },
  declension_table: {
    nominative: row(['rosa'], ['rosae']),
    genitive: row(['rosae'], ['rosārum']),
    dative: row(['rosae'], ['rosīs']),
    accusative: row(['rosam'], ['rosās']),
    ablative: row(['rosā'], ['rosīs']),
    vocative: row(['rosa'], ['rosae']),
    locative: row(null, null),
  },
};
const cloneNoun = () => JSON.parse(JSON.stringify(noun)) as VocabularyWordWithId;
const ask = () => {
  fireEvent.change(screen.getByLabelText('Question for AI about Etymology'), {
    target: { value: 'Can this be left unknown?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
};
const saveWord = async (save: jest.Mock) => {
  fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  return save.mock.calls.at(-1)![0];
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => 'approved-rule-id' });
  mockRefetch.mockReturnValue({
    unwrap: async () => ({ revision: 7, rules: [{ id: 'existing', instruction: 'Keep existing convention.' }] }),
  });
  mockSaveGlobal.mockReturnValue({ unwrap: async () => ({ revision: 8, rules: [] }) });
});

it('rejects an overflowing report without filling any fields or dropping existing issues', async () => {
  const word = cloneNoun();
  word.ai_review = {
    uncertainties: Array.from({ length: 20 }, (_, index) => ({ ...issue, explanation: `Existing issue ${index}` })),
    guidance: [],
  };
  mockCallable.mockResolvedValue({
    data: {
      success: true,
      uncertainties: [{ ...issue, explanation: 'A new issue' }],
      data: { pronunciation: 'must not apply' },
    },
  });
  const onSave = jest.fn(async () => true);
  render(<WordEditPanel word={word} onSave={onSave} updating={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'AI Autocomplete' })).not.toBeDisabled());
  const payload = await saveWord(onSave);
  expect(payload.pronunciation).toBeNull();
  expect(payload.ai_review).toEqual(word.ai_review);
});

it('discards initial autocomplete after a word switch and leaves the new word unchanged', async () => {
  let finish!: (value: unknown) => void;
  mockCallable.mockReturnValue(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  const onSave = jest.fn(async () => true);
  const view = render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
  view.rerender(
    <WordEditPanel word={{ ...cloneNoun(), id: 'new-word', word: 'silva' }} onSave={onSave} updating={false} />
  );
  await act(async () => finish({ data: { success: true, data: { pronunciation: 'stale sound' }, uncertainties: [] } }));
  expect((await saveWord(onSave)).pronunciation).toBeNull();
});

it('shows an answer without applying it, then accepts a null field and persists resolution with the normal save', async () => {
  const onSave = jest.fn(async () => true);
  mockCallable.mockResolvedValue({
    data: {
      success: true,
      data: { etymology: null, translation: 'must not replace' },
      reviewAnswer: 'Leaving this unknown is appropriate.',
      uncertainties: [],
    },
  });
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  ask();
  expect(await screen.findByText('Leaving this unknown is appropriate.')).toBeInTheDocument();
  expect(mockCallable).toHaveBeenCalledWith(
    expect.objectContaining({
      fieldsToComplete: ['etymology'],
      overwriteExisting: true,
      followUp: { question: 'Can this be left unknown?', uncertainty: issue },
      existingData: expect.objectContaining({ ai_review: noun.ai_review, declension_table: noun.declension_table }),
    })
  );
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByText(issue.explanation)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Apply answer' }));
  expect(screen.queryByText(issue.explanation)).not.toBeInTheDocument();
  const payload = await saveWord(onSave);
  expect(payload.etymology).toBeNull();
  expect(payload.translation).toBe('rose');
  expect(payload.ai_review).toEqual({ uncertainties: [], guidance: [] });
});

it('sends edited table cells, explicitly replaces a proposed table including null cells, and keeps other edits', async () => {
  const word = cloneNoun();
  word.ai_review = {
    uncertainties: [{ field: 'declension_table', explanation: 'Check the accusative.' }],
    guidance: [],
  };
  const proposed = { ...noun.declension_table, accusative: row(null, ['rosās']) };
  mockCallable.mockResolvedValue({
    data: {
      success: true,
      data: { declension_table: proposed },
      reviewAnswer: 'Leave that cell empty.',
      uncertainties: [],
    },
  });
  const onSave = jest.fn(async () => true);
  render(<WordEditPanel word={word} onSave={onSave} updating={false} />);
  fireEvent.doubleClick(screen.getByText('rosam'));
  fireEvent.change(screen.getByPlaceholderText('Enter value...'), { target: { value: 'manual form' } });
  fireEvent.keyDown(screen.getByPlaceholderText('Enter value...'), { key: 'Enter' });
  fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'edited rose' } });
  fireEvent.change(screen.getByLabelText('Question for AI about declension table'), {
    target: { value: 'Clear the unsupported cell?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
  await screen.findByText('Leave that cell empty.');
  expect(mockCallable.mock.calls[0][0].existingData.declension_table.accusative.singular).toEqual(['manual form']);
  fireEvent.click(screen.getByRole('button', { name: 'Apply answer' }));
  const payload = await saveWord(onSave);
  expect(payload.declension_table.accusative.singular).toBeNull();
  expect(payload.translation).toBe('edited rose');
});

it('keeps existing reports when initial autocomplete returns no uncertainty and fills only empty values', async () => {
  const onSave = jest.fn(async () => true);
  mockCallable.mockResolvedValue({
    data: {
      success: true,
      data: {
        translation: 'replacement',
        pronunciation: 'new sound',
        ai_review: { uncertainties: [], guidance: [{ id: 'model', instruction: 'unapproved rule' }] },
      },
      uncertainties: [],
    },
  });
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
  await waitFor(() => expect(screen.getByLabelText('Pronunciation')).toHaveValue('new sound'));
  const payload = await saveWord(onSave);
  expect(payload.translation).toBe('rose');
  expect(payload.ai_review).toEqual(noun.ai_review);
});

it('does not accept an old answer after switching to a different word', async () => {
  let finish!: (value: unknown) => void;
  mockCallable.mockReturnValue(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  const onSave = jest.fn(async () => true);
  const view = render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  ask();
  view.rerender(
    <WordEditPanel word={{ ...cloneNoun(), id: 'new-word', word: 'silva' }} onSave={onSave} updating={false} />
  );
  await act(async () => finish({ data: { success: true, data: { etymology: null }, reviewAnswer: 'stale answer' } }));
  expect(screen.queryByText('stale answer')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Apply answer' })).not.toBeInTheDocument();
  expect((await saveWord(onSave)).etymology).toBe('An uncertain derivation');
});

it('invalidates a pending answer and a displayed proposal when editing changes', async () => {
  let finish!: (value: unknown) => void;
  mockCallable.mockReturnValueOnce(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  ask();
  fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'manual edit' } });
  await act(async () => finish({ data: { success: true, data: { etymology: null }, reviewAnswer: 'stale answer' } }));
  expect(screen.queryByText('stale answer')).not.toBeInTheDocument();
  mockCallable.mockResolvedValue({ data: { success: true, data: { etymology: null }, reviewAnswer: 'fresh answer' } });
  ask();
  await screen.findByText('fresh answer');
  fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'another edit' } });
  expect(screen.queryByRole('button', { name: 'Apply answer' })).not.toBeInTheDocument();
  expect(screen.getByText('The word changed. Ask again before applying an answer.')).toBeInTheDocument();
});

it('adds, edits and removes word guidance in the draft, and persists unresolved issues across the form roundtrip', async () => {
  const onSave = jest.fn(async () => true);
  const dirty = jest.fn();
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} onDirtyChange={dirty} />);
  fireEvent.change(screen.getByLabelText('Instruction to remember'), {
    target: { value: 'Preserve this convention.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save guidance' }));
  expect(mockSaveGlobal).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  expect(dirty).toHaveBeenLastCalledWith(true);
  fireEvent.change(screen.getByLabelText('Word instruction 1'), { target: { value: 'Approved edited instruction.' } });
  const payload = await saveWord(onSave);
  expect(payload.ai_review).toEqual({
    uncertainties: [issue],
    guidance: [{ id: 'approved-rule-id', instruction: 'Approved edited instruction.' }],
  });
  const savedWord = { ...payload, id: noun.id } as VocabularyWordWithId;
  const roundtrip = applyFormValuesToWord(savedWord, VocabularyFormSchema.parse(toFormDefaultValues(savedWord)));
  expect(roundtrip.ai_review).toEqual(payload.ai_review);
  fireEvent.click(screen.getByRole('button', { name: 'Remove instruction 1' }));
  expect((await saveWord(onSave)).ai_review.guidance).toEqual([]);
});

it('saves explicit global guidance against the fresh revision without replacing existing rules or the word', async () => {
  const onSave = jest.fn(async () => true);
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  fireEvent.change(screen.getByLabelText('Instruction to remember'), {
    target: { value: 'A global approved convention.' },
  });
  fireEvent.change(screen.getByLabelText('Remember for'), { target: { value: 'global' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save guidance' }));
  await waitFor(() =>
    expect(mockSaveGlobal).toHaveBeenCalledWith({
      revision: 7,
      rules: [
        { id: 'existing', instruction: 'Keep existing convention.' },
        { id: 'approved-rule-id', instruction: 'A global approved convention.' },
      ],
    })
  );
  expect(onSave).not.toHaveBeenCalled();
});

it('keeps the proposed instruction after a global revision conflict', async () => {
  mockSaveGlobal.mockReturnValue({
    unwrap: async () => {
      throw { status: 409 };
    },
  });
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  fireEvent.change(screen.getByLabelText('Instruction to remember'), { target: { value: 'Keep my draft' } });
  fireEvent.change(screen.getByLabelText('Remember for'), { target: { value: 'global' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save guidance' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save guidance' })).not.toBeDisabled());
  expect(screen.getByLabelText('Instruction to remember')).toHaveValue('Keep my draft');
});

it('lets an admin resolve an issue manually without requesting AI or saving guidance', async () => {
  const onSave = jest.fn(async () => true);
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Resolved manually' }));
  expect(mockCallable).not.toHaveBeenCalled();
  expect((await saveWord(onSave)).ai_review).toEqual({ uncertainties: [], guidance: [] });
});

it('preserves explicit null metadata and adjective dictionary forms through normal form saving', () => {
  const word = cloneNoun();
  const values = VocabularyFormSchema.parse(toFormDefaultValues(word));
  if (values.part_of_speech !== 'noun') throw new Error('Expected noun');
  values.declension = null;
  values.gender = null;
  expect(applyFormValuesToWord(word, values)).toMatchObject({ declension: null, gender: null });
  const adjective = {
    ...word,
    part_of_speech: 'adjective',
    declension: '1-2',
    dictionary_forms: [{ full_form: 'bonus', shortened_form: 'bonus' }],
    degrees_table: {},
  } as unknown as VocabularyWordWithId;
  const adjectiveValues = VocabularyFormSchema.parse(toFormDefaultValues(adjective));
  if (adjectiveValues.part_of_speech !== 'adjective') throw new Error('Expected adjective');
  adjectiveValues.dictionary_forms = null;
  expect(applyFormValuesToWord(adjective, adjectiveValues)).toMatchObject({ dictionary_forms: null });
});
