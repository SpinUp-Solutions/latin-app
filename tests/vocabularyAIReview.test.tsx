import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';
import {
  applyFormValuesToWord,
  toFormDefaultValues,
  VocabularyFormSchema,
} from '@/src/types/vocabulary/form-schemas/builder';
import type { VocabularyWordWithId } from '@/shared/types/vocabulary/schemas';
import { getPronounTableSchema } from '@/src/components/ui/admin/vocabulary/wordTables';
import { buildEmptyFromSchema } from '@/src/utils/schema-defaults';

const mockCallable = jest.fn();
jest.mock('firebase/functions', () => ({ getFunctions: jest.fn(), httpsCallable: () => mockCallable }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const doubt = { field: 'etymology' as const, explanation: 'The proposed derivation is uncertain.' };
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
  ai_review: { uncertainties: [doubt], guidance: [] },
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
const answer = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  data: { success: true, uncertainties: [], data, ...extra },
});
const writeNote = (label: string, text: string) =>
  fireEvent.change(screen.getByLabelText(`Your note for the AI about ${label}`), { target: { value: text } });
const fixWithAI = () => fireEvent.click(screen.getByRole('button', { name: 'Fix with AI' }));
const saveWord = async (save: jest.Mock) => {
  fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  return save.mock.calls.at(-1)![0];
};
const doubtCard = (label: string) => screen.queryByRole('group', { name: `AI doubt about ${label}` });

beforeEach(() => {
  jest.clearAllMocks();
  let uuid = 0;
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `note-${++uuid}` });
});

it('flags the doubtful field in place and links to it from the top of the editor', () => {
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  const summary = screen.getByRole('region', { name: 'AI review' });
  expect(within(summary).getByText('AI is unsure about 1 field:')).toBeInTheDocument();
  expect(within(summary).getByRole('button', { name: 'Etymology' })).toBeInTheDocument();

  // The doubt sits with the field it is about, next to the value.
  const card = doubtCard('Etymology')!;
  expect(within(card).getByText(doubt.explanation)).toBeInTheDocument();
  const fieldBlock = card.parentElement!;
  expect(within(fieldBlock).getByLabelText('Etymology')).toHaveValue('An uncertain derivation');
  expect(doubtCard('Translation')).toBeNull();

  // The link lands in the note box, not in the (also multiline) field above it.
  fireEvent.click(within(summary).getByRole('button', { name: 'Etymology' }));
  expect(screen.getByLabelText('Your note for the AI about Etymology')).toHaveFocus();
});

it('turns a note into a readable proposal, and accepting it updates the field and remembers the note', async () => {
  const onSave = jest.fn(async () => true);
  mockCallable.mockResolvedValue(
    answer(
      { part_of_speech: 'noun', etymology: 'Borrowed from Greek rhódon.' },
      { reviewAnswer: 'Rewrote the etymology as a Greek loan, as you noted.' }
    )
  );
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  writeNote('Etymology', 'It is a loan from Greek rhódon.');
  fixWithAI();

  expect(await screen.findByText('Rewrote the etymology as a Greek loan, as you noted.')).toBeInTheDocument();
  expect(mockCallable).toHaveBeenCalledWith(
    expect.objectContaining({
      fieldsToComplete: ['etymology'],
      overwriteExisting: true,
      followUp: { field: 'etymology', note: 'It is a loan from Greek rhódon.', doubt: doubt.explanation },
      existingData: expect.objectContaining({ ai_review: noun.ai_review, declension_table: noun.declension_table }),
    })
  );
  // Proposed, not applied: the field keeps its value until the admin accepts.
  expect(screen.getByLabelText('Etymology')).toHaveValue('An uncertain derivation');
  expect(screen.getByText('Borrowed from Greek rhódon.')).toBeInTheDocument();
  expect(screen.getAllByText('An uncertain derivation').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(screen.getByLabelText('Etymology')).toHaveValue('Borrowed from Greek rhódon.');
  expect(doubtCard('Etymology')).toBeNull();
  expect(screen.queryByRole('region', { name: 'AI review' })).toBeNull();
  expect(screen.getByText('It is a loan from Greek rhódon.')).toBeInTheDocument();

  const payload = await saveWord(onSave);
  expect(payload.etymology).toBe('Borrowed from Greek rhódon.');
  expect(payload.translation).toBe('rose');
  expect(payload.ai_review).toEqual({
    uncertainties: [],
    guidance: [{ id: 'note-1', instruction: 'It is a loan from Greek rhódon.', field: 'etymology' }],
  });
  const savedWord = { ...payload, id: noun.id } as VocabularyWordWithId;
  const roundtrip = applyFormValuesToWord(savedWord, VocabularyFormSchema.parse(toFormDefaultValues(savedWord)));
  expect(roundtrip.ai_review).toEqual(payload.ai_review);
});

it('keeps the current value without asking the AI, remembering a note only if one was written', async () => {
  const onSave = jest.fn(async () => true);
  const word = cloneNoun();
  word.ai_review = { uncertainties: [doubt, { field: 'gender', explanation: 'Could be masculine.' }], guidance: [] };
  render(<WordEditPanel word={word} onSave={onSave} updating={false} />);

  within(doubtCard('Etymology')!).getByRole('button', { name: 'Keep current value' }).click();
  await waitFor(() => expect(doubtCard('Etymology')).toBeNull());
  writeNote('Gender', 'Feminine, like most first-declension nouns.');
  fireEvent.click(within(doubtCard('Gender')!).getByRole('button', { name: 'Keep current value' }));
  await waitFor(() => expect(doubtCard('Gender')).toBeNull());

  expect(mockCallable).not.toHaveBeenCalled();
  expect((await saveWord(onSave)).ai_review).toEqual({
    uncertainties: [],
    guidance: [{ id: 'note-1', instruction: 'Feminine, like most first-declension nouns.', field: 'gender' }],
  });
});

it('lists the changed table cells, and accepting replaces the table including null cells while keeping other edits', async () => {
  const word = cloneNoun();
  word.ai_review = {
    uncertainties: [{ field: 'declension_table', explanation: 'Check the accusative.' }],
    guidance: [],
  };
  const proposed = { ...noun.declension_table, accusative: row(null, ['rosās']) };
  mockCallable.mockResolvedValue(answer({ declension_table: proposed }, { reviewAnswer: 'Left that cell empty.' }));
  const onSave = jest.fn(async () => true);
  render(<WordEditPanel word={word} onSave={onSave} updating={false} />);

  fireEvent.doubleClick(screen.getByText('rosam'));
  fireEvent.change(screen.getByPlaceholderText('Enter value...'), { target: { value: 'manual form' } });
  fireEvent.keyDown(screen.getByPlaceholderText('Enter value...'), { key: 'Enter' });
  fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'edited rose' } });
  writeNote('Declension table', 'The accusative singular is not used.');
  fixWithAI();

  await screen.findByText('Left that cell empty.');
  expect(mockCallable.mock.calls[0][0].existingData.declension_table.accusative.singular).toEqual(['manual form']);
  expect(screen.getByText('1 cell changes')).toBeInTheDocument();
  expect(screen.getByText('accusative · singular')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  const payload = await saveWord(onSave);
  expect(payload.declension_table.accusative.singular).toBeNull();
  expect(payload.translation).toBe('edited rose');
});

it('blocks a proposal whose field changed while the AI was answering, but not one where another field changed', async () => {
  let finish!: (value: unknown) => void;
  mockCallable.mockReturnValueOnce(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  render(<WordEditPanel word={cloneNoun()} onSave={async () => true} updating={false} />);
  writeNote('Etymology', 'From Greek.');
  fixWithAI();
  fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'another field' } });
  await act(async () => finish(answer({ etymology: 'From Greek rhódon.' })));
  expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();

  fireEvent.change(screen.getByLabelText('Etymology'), { target: { value: 'typed by the admin' } });
  expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
  expect(screen.getByText('Etymology changed while the AI was answering. Discard and ask again.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(screen.getByLabelText('Your note for the AI about Etymology')).toHaveValue('From Greek.');
  expect(screen.getByRole('button', { name: 'Fix with AI' })).toBeEnabled();
});

it('does not show an answer for the previous word after switching words', async () => {
  let finish!: (value: unknown) => void;
  mockCallable.mockReturnValue(
    new Promise(resolve => {
      finish = resolve;
    })
  );
  const onSave = jest.fn(async () => true);
  const view = render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  writeNote('Etymology', 'From Greek.');
  fixWithAI();
  view.rerender(
    <WordEditPanel word={{ ...cloneNoun(), id: 'new-word', word: 'silva' }} onSave={onSave} updating={false} />
  );
  await act(async () => finish(answer({ etymology: null }, { reviewAnswer: 'stale answer' })));
  expect(screen.queryByText('stale answer')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  expect((await saveWord(onSave)).etymology).toBe('An uncertain derivation');
});

it('adds new doubts from autocomplete without replacing open ones, filling only empty values', async () => {
  const onSave = jest.fn(async () => true);
  mockCallable.mockResolvedValue(
    answer(
      { translation: 'replacement', pronunciation: 'new sound' },
      {
        uncertainties: [
          { field: 'etymology', explanation: 'A rewritten doubt that must not replace the open one.' },
          { field: 'pronunciation', explanation: 'Vowel length is unclear.' },
        ],
      }
    )
  );
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'AI Autocomplete' }));
  await waitFor(() => expect(screen.getByLabelText('Pronunciation')).toHaveValue('new sound'));

  expect(toast.warning).toHaveBeenCalledWith('AI is unsure about 2 fields', expect.anything());
  expect(within(doubtCard('Pronunciation')!).getByText('Vowel length is unclear.')).toBeInTheDocument();
  expect(within(doubtCard('Etymology')!).getByText(doubt.explanation)).toBeInTheDocument();
  const payload = await saveWord(onSave);
  expect(payload.translation).toBe('rose');
  expect(payload.ai_review.uncertainties).toEqual([
    doubt,
    { field: 'pronunciation', explanation: 'Vowel length is unclear.' },
  ]);
});

it('discards an autocomplete result that arrives after switching words', async () => {
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
  await act(async () => finish(answer({ pronunciation: 'stale sound' })));
  expect((await saveWord(onSave)).pronunciation).toBeNull();
});

it('shows remembered notes under their field and removes one with the next save', async () => {
  const onSave = jest.fn(async () => true);
  const word = cloneNoun();
  word.ai_review = {
    uncertainties: [],
    guidance: [
      { id: 'n1', instruction: 'Loan from Greek.', field: 'etymology' },
      { id: 'n2', instruction: 'A note from before field notes existed.' },
    ],
  };
  render(<WordEditPanel word={word} onSave={onSave} updating={false} />);
  expect(screen.getByText('Loan from Greek.')).toBeInTheDocument();
  const summary = screen.getByRole('region', { name: 'AI review' });
  expect(within(summary).getByText('A note from before field notes existed.')).toBeInTheDocument();
  expect(within(summary).queryByText('Loan from Greek.')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Remove note: Loan from Greek.' }));
  expect(screen.queryByText('Loan from Greek.')).toBeNull();
  expect((await saveWord(onSave)).ai_review.guidance).toEqual([word.ai_review.guidance[1]]);
});

it('answers a doubt about a field the form does not show from the top of the editor', () => {
  const adjective = {
    ...cloneNoun(),
    id: 'bonus',
    word: 'bonus',
    part_of_speech: 'adjective',
    declension: '1-2',
    dictionary_forms: [
      { full_form: 'bonus', shortened_form: 'bonus' },
      { full_form: 'bona', shortened_form: '-a' },
    ],
    degrees_table: {},
    ai_review: { uncertainties: [{ field: 'dictionary_forms', explanation: 'Check the neuter.' }], guidance: [] },
  } as unknown as VocabularyWordWithId;
  render(<WordEditPanel word={adjective} onSave={async () => true} updating={false} />);
  const summary = screen.getByRole('region', { name: 'AI review' });
  expect(within(summary).getByText('bonus, bona (-a)')).toBeInTheDocument();
  expect(within(summary).getByRole('group', { name: 'AI doubt about Dictionary forms' })).toBeInTheDocument();
});

it('keeps a doubt resolvable when the form hides its field for this word', async () => {
  const onSave = jest.fn(async () => true);
  const relative = {
    ...cloneNoun(),
    id: 'qui',
    word: 'quī',
    part_of_speech: 'pronoun',
    pronoun_type: 'relative',
    person: null,
    declension_table: buildEmptyFromSchema(getPronounTableSchema('relative', null)),
    ai_review: { uncertainties: [{ field: 'person', explanation: 'Relative pronouns take no person.' }], guidance: [] },
  } as unknown as VocabularyWordWithId;
  render(<WordEditPanel word={relative} onSave={onSave} updating={false} />);
  expect(screen.queryByText('Select person')).toBeNull();
  const card = doubtCard('Person')!;
  fireEvent.click(within(card).getByRole('button', { name: 'Keep current value' }));
  expect(doubtCard('Person')).toBeNull();
  expect((await saveWord(onSave)).ai_review.uncertainties).toEqual([]);
});

it('shows no AI review where AI is off, and keeps the saved review untouched', async () => {
  const onSave = jest.fn(async () => true);
  render(<WordEditPanel word={cloneNoun()} onSave={onSave} updating={false} allowAIAutocomplete={false} />);
  expect(screen.queryByRole('region', { name: 'AI review' })).toBeNull();
  expect(doubtCard('Etymology')).toBeNull();
  fireEvent.change(screen.getByLabelText('Translation'), { target: { value: 'edited' } });
  expect((await saveWord(onSave)).ai_review).toEqual(noun.ai_review);
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
