import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockBaseQuery = jest.fn();

jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
jest.mock('@/src/components/ui/admin/vocabulary/AIAutocompleteButton', () => ({
  AIAutocompleteButton: () => null,
}));

import { appApi } from '@/src/store/api/appApi';
import { WordUpdateReview } from '@/src/components/ui/admin/vocabulary/WordUpdateReview';

const createStore = () =>
  configureStore({
    reducer: { [appApi.reducerPath]: appApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }).concat(appApi.middleware),
  });

const word = (name: string, translation: string) => ({
  word: name,
  part_of_speech: 'adverb',
  translation,
  definitions: ['adverb of frequency'],
  etymology: null,
  pronunciation: null,
  type: 'core',
  alternate_form: null,
  dictionary_entry: name,
  sort_key: name,
  random_index: 0.5,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
});

const summary = (id: string, name: string, translation: string) => ({
  id,
  status: 'pending',
  wordId: `w-${id}`,
  word: name,
  part_of_speech: 'adverb',
  translation,
  changes: { fields: ['translation'], tableCells: 0 },
  reason: 'Audit fix',
  source: 'audit-2026-11',
  createdAt: '2026-11-13T09:00:00.000Z',
  updatedAt: '2026-11-13T09:00:00.000Z',
});

const SUMMARIES = [summary('u1', 'saepe', 'often'), summary('u2', 'diū', 'for a long time')];

type Request = string | { url: string; method?: string; body?: unknown };

/** Serves the update routes from memory. */
function serveUpdates(invalidCount = 0) {
  mockBaseQuery.mockImplementation(async (request: Request) => {
    const url = typeof request === 'string' ? request : request.url;
    const method = typeof request === 'string' ? 'GET' : (request.method ?? 'GET');
    const base = '/admin/vocabulary-word-update-requests';
    if (method === 'GET' && url === `${base}?status=pending`)
      return { data: { requests: SUMMARIES, truncated: false, invalidCount } };
    if (method === 'GET' && url.endsWith('/notes')) return { data: { notes: [], truncated: false } };
    const found = SUMMARIES.find(item => url === `${base}/${item.id}` || url === `${base}/${item.id}/dismiss`);
    if (!found) return { error: { status: 404, data: null } };
    const live = word(found.word, 'oft');
    return {
      data: {
        request: {
          ...found,
          proposedWord: word(found.word, found.translation),
          baseWord: live,
          baseFingerprint: 'f1',
          version: 'v1',
          createdBy: 'admin',
          approvedBy: null,
          approvedAt: null,
          dismissedBy: null,
          dismissedReason: null,
        },
        liveWord: { ...live, id: found.wordId },
        liveFingerprint: 'f1',
      },
    };
  });
}

const renderReview = (props: React.ComponentProps<typeof WordUpdateReview> = {}) =>
  render(
    <Provider store={createStore()}>
      <WordUpdateReview {...props} />
    </Provider>
  );

beforeEach(() => {
  mockBaseQuery.mockReset();
  serveUpdates();
});

it('opens on the changes with the edit button in reach and the notes closed', async () => {
  renderReview();

  expect(await screen.findByRole('button', { name: 'Edit proposal' })).toBeInTheDocument();
  expect(screen.getByText('adverb · 1 field changed')).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Update view' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Notes/ })).toHaveAttribute('aria-expanded', 'false');
});

it('searches the list without macrons and says how many are shown', async () => {
  renderReview();
  await screen.findByRole('button', { name: /saepe/ });

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search updates' }), 'diu');

  expect(screen.queryByRole('button', { name: /saepe/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /diū/ })).toHaveAttribute('aria-current', 'true');
  expect(screen.getByText('1 of 2 shown')).toBeInTheDocument();
});

it('asks before dismissing and sends the reason', async () => {
  renderReview();

  await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
  const dialog = screen.getByRole('alertdialog');
  expect(mockBaseQuery).not.toHaveBeenCalledWith(
    expect.objectContaining({ method: 'POST' }),
    expect.anything(),
    undefined
  );

  await userEvent.type(within(dialog).getByRole('textbox'), 'Already correct in Lewis & Short');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Dismiss update' }));

  await waitFor(() =>
    expect(mockBaseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/admin/vocabulary-word-update-requests/u1/dismiss',
        method: 'POST',
        body: { reason: 'Already correct in Lewis & Short' },
      }),
      expect.anything(),
      undefined
    )
  );
});

it('reports unsaved proposal edits, locks the filters and asks before another update is opened', async () => {
  const requestNavigation = jest.fn();
  const onDirtyChange = jest.fn();
  renderReview({ requestNavigation, onDirtyChange });

  await userEvent.click(await screen.findByRole('button', { name: 'Edit proposal' }));
  // Opening the editor alone is not an edit.
  expect(screen.getByRole('searchbox', { name: 'Search updates' })).toBeEnabled();
  await userEvent.type(screen.getByDisplayValue('often'), ', frequently');

  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole('searchbox', { name: 'Search updates' })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: /diū/ }));
  expect(requestNavigation).toHaveBeenCalledTimes(1);
  // Nothing moves until the page lets the navigation through.
  expect(screen.getByDisplayValue('often, frequently')).toBeInTheDocument();
});

it('reports malformed updates while keeping valid reviews available', async () => {
  serveUpdates(1);
  renderReview();

  expect(await screen.findByRole('alert')).toHaveTextContent('1 invalid update could not be loaded.');
  expect(await screen.findByRole('button', { name: 'Edit proposal' })).toBeEnabled();
});
