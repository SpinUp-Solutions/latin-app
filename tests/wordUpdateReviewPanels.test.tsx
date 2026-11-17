jest.mock('@/src/components/ui/admin/vocabulary/VocabularyAIReviewPanel', () => ({
  VocabularyAIReviewPanel: () => null,
}));
jest.mock('@/src/components/ui/admin/vocabulary/VocabularyAIGlobalGuidance', () => ({
  VocabularyAIGlobalGuidance: () => null,
}));
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { WordDiffPanel } from '@/src/components/ui/admin/vocabulary/WordDiffPanel';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';

jest.mock('@/src/components/ui/admin/vocabulary/AIAutocompleteButton', () => ({
  AIAutocompleteButton: () => <button type="button">AI Autocomplete</button>,
}));

const row = (s: string[] | null, p: string[] | null) => ({ singular: s, plural: p });
const current = {
  id: 'w1',
  word: 'rosa',
  part_of_speech: 'noun',
  translation: 'rose',
  definitions: ['rose'],
  etymology: 'Perhaps from Greek',
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
  declension_table: {
    nominative: row(['rosa'], ['rosae']),
    genitive: row(['rosae'], ['rosārum']),
    dative: row(['rosae'], ['rosīs']),
    accusative: row(['rosam'], ['rosās']),
    ablative: row(['rosa'], ['rosīs']),
    vocative: row(['rosa'], ['rosae']),
    locative: row(null, null),
  },
};
const proposed = {
  ...current,
  translation: 'rose, flower',
  declension_table: { ...current.declension_table, ablative: row(['rosā'], ['rosīs']) },
};

it('reports unsaved edits to the form or the table, and clears the report when it goes away', () => {
  const onDirtyChange = jest.fn();
  const { unmount } = render(
    <WordEditPanel word={current as never} onSave={async () => true} updating={false} onDirtyChange={onDirtyChange} />
  );
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);

  fireEvent.doubleClick(screen.getByText('rosam'));
  fireEvent.change(screen.getByPlaceholderText('Enter value...'), { target: { value: 'rosām' } });
  fireEvent.keyDown(screen.getByPlaceholderText('Enter value...'), { key: 'Enter' });
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);

  unmount();
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
});

it('lays out a change like the editor, with old and new values and changed cells marked', () => {
  render(<WordDiffPanel before={current} after={proposed} />);

  expect(screen.getByText('noun · 1 field and 1 form changed')).toBeTruthy();
  expect(screen.getAllByText('Before:')).toHaveLength(2);
  // Only the part that changed is marked: the added words, and the one letter in the table cell.
  expect(screen.getByText(', flower').tagName).toBe('MARK');
  expect(screen.getByText('ā').tagName).toBe('MARK');
  expect(screen.getByText('Perhaps from Greek')).toBeTruthy();
  expect(screen.getByText('Genitive')).toBeTruthy();
});

it('hides unchanged fields and table rows when showing changes only', () => {
  render(<WordDiffPanel before={current} after={proposed} />);

  fireEvent.click(screen.getByRole('switch', { name: 'Changes only' }));

  expect(screen.queryByText('Perhaps from Greek')).toBeNull();
  expect(screen.queryByText('Etymology')).toBeNull();
  expect(screen.getByText('Translation')).toBeTruthy();
  expect(screen.queryByText('Genitive')).toBeNull();
  expect(screen.getByText('Ablative')).toBeTruthy();
});

it('lists changed forms the table has no slot for, and shows an added value without an empty "before"', () => {
  const withStrayForm = {
    ...current,
    definitions: ['rose'],
    declension_table: { ...current.declension_table, nominative: { ...row(['rosa'], ['rosae']), dual: ['rosae'] } },
  };
  render(<WordDiffPanel before={withStrayForm} after={{ ...current, definitions: ['rose', 'garland'] }} />);

  expect(screen.getByText('Forms the table has no place for')).toBeTruthy();
  expect(screen.getByText('Nominative › Dual')).toBeTruthy();
  // The added definition shows only its new value; the removed stray form only its old one.
  expect(screen.getAllByText('Before:')).toHaveLength(1);
  expect(screen.getAllByText('After:')).toHaveLength(1);
});
