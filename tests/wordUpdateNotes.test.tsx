import React, { useState } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { VocabularyWordUpdateNote } from '@/shared/types/vocabulary/update-requests';

const mockBaseQuery = jest.fn();

jest.mock('@/src/store/api/baseQuery', () => ({
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

import { appApi } from '@/src/store/api/appApi';
import { WordUpdateNotes } from '@/src/components/ui/admin/vocabulary/WordUpdateNotes';

const createStore = () =>
  configureStore({
    reducer: { [appApi.reducerPath]: appApi.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }).concat(appApi.middleware),
  });

type Request = string | { url: string; method?: string; body?: { text: string } };

/** Serves the notes of update u1 from memory, as the notes routes would. */
function serveNotes(initial: VocabularyWordUpdateNote[]) {
  let notes = [...initial];
  mockBaseQuery.mockImplementation(async (request: Request) => {
    const url = typeof request === 'string' ? request : request.url;
    const method = typeof request === 'string' ? 'GET' : (request.method ?? 'GET');
    if (method === 'GET' && url === '/admin/vocabulary-word-update-requests/u1/notes') {
      return { data: { notes, truncated: false } };
    }
    if (method === 'POST' && typeof request !== 'string') {
      const note = {
        id: `n${notes.length + 1}`,
        text: request.body!.text,
        authorName: 'Ada Lovelace',
        createdAt: '2026-11-14T10:00:00.000Z',
        mine: true,
      };
      notes = [...notes, note];
      return { data: note };
    }
    if (method === 'DELETE') {
      const noteId = url.split('/').at(-1);
      notes = notes.filter(note => note.id !== noteId);
      return { data: { id: noteId } };
    }
    return { error: { status: 404, data: null } };
  });
}

function Harness() {
  const [open, setOpen] = useState(true);
  return <WordUpdateNotes id="u1" open={open} onOpenChange={setOpen} />;
}

const renderNotes = () =>
  render(
    <Provider store={createStore()}>
      <Harness />
    </Provider>
  );

const theirNote: VocabularyWordUpdateNote = {
  id: 'n1',
  text: 'The genitive plural\nis wrong too.',
  authorName: 'Bo Reviewer',
  createdAt: '2026-11-13T09:00:00.000Z',
  mine: false,
};

beforeEach(() => mockBaseQuery.mockReset());

it("shows each note with its author and offers to delete only the admin's own", async () => {
  serveNotes([theirNote, { ...theirNote, id: 'n2', text: 'Checked in Lewis & Short.', authorName: 'Ada', mine: true }]);
  renderNotes();

  const notes = await screen.findAllByRole('listitem');
  expect(notes).toHaveLength(2);
  expect(within(notes[0]).getByText('Bo Reviewer')).toBeInTheDocument();
  expect(within(notes[0]).getByText(/The genitive plural/).textContent).toBe('The genitive plural\nis wrong too.');
  expect(within(notes[0]).queryByRole('button', { name: 'Delete note' })).not.toBeInTheDocument();
  expect(within(notes[1]).getByRole('button', { name: 'Delete note' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Notes/ })).toHaveTextContent('2');
});

it('adds a note with Cmd+Enter and clears the box', async () => {
  serveNotes([theirNote]);
  renderNotes();
  await screen.findByText('Bo Reviewer');

  const box = screen.getByRole('textbox', { name: 'New note' });
  await userEvent.type(box, 'ārdor has a long a.');
  await userEvent.keyboard('{Meta>}{Enter}{/Meta}');

  expect(await screen.findByText('ārdor has a long a.')).toBeInTheDocument();
  expect(box).toHaveValue('');
  expect(mockBaseQuery).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'POST', body: { text: 'ārdor has a long a.' } }),
    expect.anything(),
    undefined
  );
});

it('deletes an own note and can be closed', async () => {
  serveNotes([{ ...theirNote, mine: true }]);
  renderNotes();

  await userEvent.click(await screen.findByRole('button', { name: 'Delete note' }));
  await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument());
  expect(screen.getByText('No notes yet.')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Notes/ }));
  expect(screen.queryByRole('textbox', { name: 'New note' })).not.toBeInTheDocument();
});
