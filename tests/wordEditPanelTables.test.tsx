import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';

let mockAutocomplete: ((data: unknown, status?: unknown, id?: string) => void) | null = null;
jest.mock('@/src/components/ui/admin/vocabulary/AIAutocompleteButton', () => ({
  AIAutocompleteButton: (props: { onAutocomplete: (data: unknown, status?: unknown, id?: string) => void }) => {
    mockAutocomplete = props.onAutocomplete;
    return null;
  },
}));

const row = (s: string[] | null, p: string[] | null) => ({ singular: s, plural: p });
const noun = {
  id: 'w1',
  word: 'rosa',
  part_of_speech: 'noun',
  translation: 'rose',
  definitions: ['rose'],
  etymology: null,
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
    ablative: row(['rosā'], ['rosīs']),
    vocative: row(['rosa'], ['rosae']),
    locative: row(null, null),
  },
};

it('saves manual cell edits and AI-filled table cells with the word', async () => {
  const onSave = jest.fn(async (_updates: unknown) => true);
  render(<WordEditPanel word={noun as never} onSave={onSave} updating={false} />);
  expect(screen.getByText('Declension Table')).toBeTruthy();
  fireEvent.doubleClick(screen.getByText('rosam'));
  const input = screen.getByPlaceholderText('Enter value...');
  fireEvent.change(input, { target: { value: 'rosam, rosamm' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByText('rosam, rosamm')).toBeTruthy();

  act(() => {
    mockAutocomplete!(
      { declension_table: { locative: { singular: ['rosae'], plural: ['rosīs'] } } },
      { translation: 'filled' },
      'w1'
    );
  });
  fireEvent.click(screen.getByText('Apply'));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  const payload = onSave.mock.calls[0][0] as { id?: string; declension_table: Record<string, unknown> };
  expect(payload.id).toBeUndefined();
  expect(payload.declension_table).toMatchObject({
    nominative: row(['rosa'], ['rosae']),
    accusative: row(['rosam', 'rosamm'], ['rosās']),
    locative: row(['rosae'], ['rosīs']),
  });
});
