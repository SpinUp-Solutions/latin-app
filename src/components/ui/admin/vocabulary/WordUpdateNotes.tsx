import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { VOCABULARY_WORD_UPDATE_NOTE_MAX_LENGTH } from '@/shared/types/vocabulary/update-requests';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  useAddVocabularyWordUpdateNoteMutation,
  useDeleteVocabularyWordUpdateNoteMutation,
  useGetVocabularyWordUpdateNotesQuery,
} from '@/src/store/api/vocabularyWordUpdateRequestsApi';

const formatDate = (iso: string) => new Date(iso).toLocaleString();

/** Admins' notes on an update, such as why the word is wrong, docked under the update views. */
export function WordUpdateNotes({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error } = useGetVocabularyWordUpdateNotesQuery(id);
  const [addNote, { isLoading: adding }] = useAddVocabularyWordUpdateNoteMutation();
  const [deleteNote] = useDeleteVocabularyWordUpdateNoteMutation();
  const [draft, setDraft] = useState('');
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  const listRef = useRef<HTMLOListElement>(null);
  const notes = data?.notes;
  const count = notes ? `${notes.length}${data.truncated ? '+' : ''}` : null;

  // Keep the newest note in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [notes?.length, open]);

  const handleAdd = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || adding) return;
    try {
      await addNote({ id, text }).unwrap();
      setDraft('');
    } catch (failure) {
      toast.error(getApiErrorMessage(failure, 'Could not add the note'));
    }
  };

  const handleDelete = async (noteId: string) => {
    setDeletingIds(current => new Set(current).add(noteId));
    try {
      await deleteNote({ id, noteId }).unwrap();
    } catch (failure) {
      toast.error(getApiErrorMessage(failure, 'Could not delete the note'));
    } finally {
      setDeletingIds(current => {
        const next = new Set(current);
        next.delete(noteId);
        return next;
      });
    }
  };

  const Chevron = open ? ChevronDown : ChevronUp;

  return (
    <section aria-label="Notes" className="flex-shrink-0 border-t border-gray-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between px-6 py-2.5 text-left hover:bg-roman-parchment/40">
        <span className="flex items-center gap-2 font-serif text-sm font-medium text-gray-900">
          Notes
          {count && <span className="text-[11px] tabular-nums text-roman-stone/70">{count}</span>}
        </span>
        <Chevron className="h-4 w-4 text-roman-stone" />
      </button>

      {open && (
        <div className="space-y-3 px-6 pb-4">
          {error ? (
            <p className="text-sm text-red-700">{getApiErrorMessage(error, 'Could not load the notes')}</p>
          ) : isLoading ? (
            <p className="text-sm text-gray-500">Loading notes...</p>
          ) : notes && notes.length > 0 ? (
            <ol ref={listRef} className="max-h-40 space-y-2 overflow-y-auto">
              {data.truncated && <li className="text-xs text-roman-stone">Older notes are not shown.</li>}
              {notes.map(note => (
                <li key={note.id} className="rounded-lg bg-roman-marble px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-roman-stone">
                    <span>
                      <span className="font-medium text-gray-900">{note.authorName}</span> ·{' '}
                      {formatDate(note.createdAt)}
                    </span>
                    {note.mine && (
                      <button
                        type="button"
                        aria-label="Delete note"
                        title="Delete note"
                        disabled={deletingIds.has(note.id)}
                        onClick={() => handleDelete(note.id)}
                        className="rounded p-1 text-roman-stone hover:bg-white hover:text-red-700 disabled:opacity-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">{note.text}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-roman-stone">No notes yet.</p>
          )}

          <form onSubmit={handleAdd} className="flex items-end gap-2">
            <Textarea
              aria-label="New note"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) handleAdd();
              }}
              maxLength={VOCABULARY_WORD_UPDATE_NOTE_MAX_LENGTH}
              rows={2}
              placeholder="Why is this word wrong, or why do you think it is?"
              className="min-h-[60px] resize-y"
            />
            <Button type="submit" size="sm" disabled={!draft.trim() || adding}>
              {adding ? 'Adding...' : 'Add note'}
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}
