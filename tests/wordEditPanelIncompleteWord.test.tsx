import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';
import { toFormDefaultValues } from '@/src/types/vocabulary/form-schemas/builder';
import type { VocabularyWordWithId } from '@/shared/types/vocabulary/schemas';

jest.mock('@/src/components/ui/admin/vocabulary/AIAutocompleteButton', () => ({ AIAutocompleteButton: () => null }));
// The verb form's Radix controls measure themselves; jsdom has no ResizeObserver.
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

/** A minimal verb, like the e2e seed's `amo`: no definitions, tables or principal parts. */
const minimalVerb = {
  id: 'e2e-amo',
  word: 'amo',
  root_word: 'amo',
  selected_form: 'amo',
  dictionary_entry: 'amo, amare',
  translation: 'love',
  part_of_speech: 'verb',
  random_index: 0.5,
  sort_key: 'amo',
} as unknown as VocabularyWordWithId;

it('opens a word that has no definitions instead of crashing, and saves a definition added to it', async () => {
  const onSave = jest.fn(async (_updates: unknown) => true);
  // An adverb has no table, so only the missing definitions are in play.
  const adverb = {
    id: 'w-semper',
    word: 'semper',
    part_of_speech: 'adverb',
    translation: 'always',
    dictionary_entry: 'semper',
    type: 'core',
    sort_key: 'semper',
    random_index: 0.3,
  } as unknown as VocabularyWordWithId;
  render(<WordEditPanel word={adverb} onSave={onSave} updating={false} />);
  expect(screen.getByRole('heading', { name: 'semper' })).toBeInTheDocument();
  expect(screen.getByLabelText('Translation')).toHaveValue('always');

  const definitions = screen.getByText('Definitions').parentElement!;
  expect(within(definitions).queryAllByRole('textbox')).toHaveLength(0);
  fireEvent.click(within(definitions).getByRole('button', { name: 'Add definition' }));
  fireEvent.change(within(definitions).getByRole('textbox'), { target: { value: 'at all times' } });
  fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0]).toMatchObject({ definitions: ['at all times'], translation: 'always' });
});

it('opens a minimal verb like the e2e seed, and shows what is missing when it is saved', async () => {
  const onSave = jest.fn(async (_updates: unknown) => true);
  render(<WordEditPanel word={minimalVerb} onSave={onSave} updating={false} />);
  expect(screen.getByRole('heading', { name: 'amo' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
  // Its type is missing too: the admin is told, and nothing is saved.
  expect(await screen.findByText('Validation Errors:')).toBeInTheDocument();
  expect(screen.getByText(/expected one of "core"\|"non-core"/)).toBeInTheDocument();
  expect(onSave).not.toHaveBeenCalled();
});

it.each([
  ['missing', undefined],
  ['null', null],
  ['not a list', 'love'],
])('starts the editor with no definitions when they are %s', (_case, definitions) => {
  const values = toFormDefaultValues({ ...minimalVerb, definitions } as unknown as VocabularyWordWithId);
  expect(values.definitions).toEqual([]);
});

it('copies existing definitions, so editing the form does not change the word', () => {
  const word = { ...minimalVerb, definitions: ['to love', 'to like'] } as VocabularyWordWithId;
  const values = toFormDefaultValues(word);
  expect(values.definitions).toEqual(['to love', 'to like']);
  expect(values.definitions).not.toBe(word.definitions);
});
