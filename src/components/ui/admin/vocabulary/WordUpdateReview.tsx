import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/src/components/ui/alert-dialog';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { Textarea } from '@/src/components/ui/textarea';
import type { VocabularyWord, VocabularyWordWithId } from '@/shared/types/vocabulary/schemas';
import type {
  VocabularyWordUpdateRequestStatus,
  VocabularyWordUpdateRequestSummary,
  WordChangeSummary,
} from '@/shared/types/vocabulary/update-requests';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import {
  useApproveVocabularyWordUpdateMutation,
  useDismissVocabularyWordUpdateMutation,
  useGetVocabularyWordUpdateRequestQuery,
  useGetVocabularyWordUpdateRequestsQuery,
  useSaveVocabularyWordUpdateProposalMutation,
} from '@/src/store/api/vocabularyWordUpdateRequestsApi';
import { stripMacrons } from '@/src/utils/exercises/helpers';
import { WordDiffPanel } from './WordDiffPanel';
import { WordEditPanel } from './WordEditPanel';
import { WordUpdateNotes } from './WordUpdateNotes';

const EMPTY_REQUESTS: VocabularyWordUpdateRequestSummary[] = [];
const DISMISS_REASON_MAX_LENGTH = 2000;

const STATUS_LABELS: Record<VocabularyWordUpdateRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  dismissed: 'Dismissed',
};

/** The editor's label for each field, so a list row names changes the way the editor does. */
const FIELD_LABELS: Record<string, string> = {
  word: 'Word',
  type: 'Word type',
  translation: 'Translation',
  definitions: 'Definitions',
  etymology: 'Etymology',
  pronunciation: 'Pronunciation',
  alternate_form: 'Alternate form',
  dictionary_entry: 'Dictionary entry',
  gender: 'Gender',
  declension: 'Declension',
  nominative_singular: 'Nominative',
  genitive_singular: 'Genitive',
  pronoun_type: 'Pronoun type',
  person: 'Person',
  conjugation: 'Conjugation',
  is_deponent: 'Deponent',
  principal_parts: 'Principal parts',
  case: 'Case',
};

/** "Translation, Etymology · 12 forms" */
export function describeChanges({ fields, tableCells }: WordChangeSummary): string {
  const names = fields.map(field => FIELD_LABELS[field] ?? field.replace(/_/g, ' '));
  const shown = names.length > 2 ? [...names.slice(0, 2), `${names.length - 2} more`] : names;
  const forms = tableCells > 0 ? `${tableCells} form${tableCells === 1 ? '' : 's'}` : null;
  return [shown.join(', '), forms].filter(Boolean).join(' · ') || 'No changes';
}

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '');
const formatDay = (iso: string) => new Date(iso).toLocaleDateString();

/** Lower case and without macrons, so "ardor" finds "ārdor". */
const searchText = (text: string) => stripMacrons(text).toLowerCase();

/** Runs a step that would drop unsaved edits; the page asks the reviewer first. */
type RequestNavigation = (navigate: () => void) => void;
const navigateNow: RequestNavigation = navigate => navigate();

function DismissDialog({
  word,
  onClose,
  onConfirm,
}: {
  word: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <AlertDialog open onOpenChange={open => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dismiss the update to {word}?</AlertDialogTitle>
          <AlertDialogDescription>
            The word stays as it is. A dismissed update cannot be reopened; it would have to be staged again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          aria-label="Reason for dismissing (optional)"
          value={reason}
          onChange={event => setReason(event.target.value)}
          maxLength={DISMISS_REASON_MAX_LENGTH}
          rows={3}
          placeholder="Reason (optional)"
        />
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive" onClick={() => onConfirm(reason.trim())}>
              Dismiss update
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function UpdateDetail({
  id,
  onClosed,
  requestNavigation,
  onDirtyChange,
}: {
  id: string;
  onClosed: () => void;
  requestNavigation: RequestNavigation;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { data, isLoading, isFetching, error, refetch } = useGetVocabularyWordUpdateRequestQuery(id);
  const [editing, setEditing] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [saveProposal, { isLoading: saving }] = useSaveVocabularyWordUpdateProposalMutation();
  const [approve, { isLoading: approving }] = useApproveVocabularyWordUpdateMutation();
  const [dismiss, { isLoading: dismissing }] = useDismissVocabularyWordUpdateMutation();

  if (error) {
    return <div className="p-6 text-sm text-red-700">{getApiErrorMessage(error, 'Could not load this update')}</div>;
  }
  if (isLoading || !data) {
    return <div className="p-6 text-sm text-gray-500">Loading update...</div>;
  }

  const { request, liveWord, liveFingerprint } = data;
  const pending = request.status === 'pending';
  const busy = saving || approving || dismissing || isFetching;
  const editedSinceStaged = pending && liveWord !== null && liveFingerprint !== request.baseFingerprint;
  // An approved update is shown against the word it replaced; anything else against the word as it is now.
  const before = ((request.status === 'approved' ? request.appliedFromWord : liveWord) ??
    request.baseWord) as VocabularyWord;
  const beforeWord = { ...before, id: request.wordId } as VocabularyWordWithId;
  const proposedWord = { ...request.proposedWord, id: request.wordId } as VocabularyWordWithId;

  const handleError = (failure: unknown, fallback: string) => {
    toast.error(getApiErrorMessage(failure, fallback));
    // A conflict means the word or the proposal moved on; show the reviewer what is there now.
    if ((failure as { status?: unknown })?.status === 409) refetch();
  };

  const handleSave = async (updates: Partial<VocabularyWord>) => {
    try {
      await saveProposal({ id, proposedWord: updates as VocabularyWord, version: request.version }).unwrap();
      toast.success('Proposal saved');
      setEditing(false);
      return true;
    } catch (failure) {
      handleError(failure, 'Could not save the proposal');
      return false;
    }
  };

  const handleApprove = async () => {
    if (!liveFingerprint) return;
    try {
      await approve({
        id,
        wordId: request.wordId,
        version: request.version,
        wordFingerprint: liveFingerprint,
      }).unwrap();
      toast.success(`Updated ${request.word}`);
      onClosed();
    } catch (failure) {
      handleError(failure, 'Could not approve the update');
    }
  };

  const handleDismiss = async (reason: string) => {
    try {
      await dismiss({ id, reason: reason || undefined }).unwrap();
      toast.success('Update dismissed');
      onClosed();
    } catch (failure) {
      handleError(failure, 'Could not dismiss the update');
    }
  };

  const panelKey = `${request.version}-${liveFingerprint ?? 'deleted'}`;

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-6 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-gray-700">{request.reason || 'No reason given'}</p>
          <p className="truncate text-xs text-gray-400">
            {[
              request.source,
              `Staged ${formatDate(request.createdAt)}`,
              request.status === 'approved' && `Approved ${formatDate(request.approvedAt)}`,
              request.status === 'dismissed' &&
                `Dismissed ${formatDate(request.updatedAt)}${request.dismissedReason ? `: ${request.dismissedReason}` : ''}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {pending && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => setDismissOpen(true)} disabled={busy || editing}>
              {dismissing ? 'Dismissing...' : 'Dismiss'}
            </Button>
            <Button onClick={handleApprove} disabled={busy || editing || !liveWord}>
              {approving ? 'Approving...' : 'Approve'}
            </Button>
          </div>
        )}
      </div>

      {pending && !liveWord && (
        <div className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          This word has been deleted, so the update can only be dismissed.
        </div>
      )}
      {editedSinceStaged && (
        <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          This word was edited after the update was staged. The changes compare the word as it is now with the proposal,
          so approving replaces those edits too.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {editing ? (
          <WordEditPanel
            key={`${panelKey}-editing`}
            word={proposedWord}
            onSave={handleSave}
            updating={saving}
            saveLabel="Save proposal"
            allowAIAutocomplete={false}
            onDirtyChange={onDirtyChange}
            actions={
              <Button
                type="button"
                variant="outline"
                onClick={() => requestNavigation(() => setEditing(false))}
                disabled={saving}>
                Cancel
              </Button>
            }
          />
        ) : (
          <WordDiffPanel
            key={panelKey}
            before={beforeWord}
            after={proposedWord}
            beforeLabel={request.status === 'approved' ? 'Before' : 'Current'}
            actions={
              pending && liveWord ? (
                <Button type="button" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
                  Edit proposal
                </Button>
              ) : null
            }
          />
        )}
      </div>

      {dismissOpen && (
        <DismissDialog word={request.word} onClose={() => setDismissOpen(false)} onConfirm={handleDismiss} />
      )}
    </>
  );
}

/**
 * The Updates tab of Pending Review: proposed changes to existing words, each
 * shown as its changes against the word. `requestNavigation` and
 * `onDirtyChange` let the page ask before unsaved proposal edits are dropped.
 */
export function WordUpdateReview({
  requestNavigation = navigateNow,
  onDirtyChange,
}: {
  requestNavigation?: RequestNavigation;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [status, setStatus] = useState<VocabularyWordUpdateRequestStatus>('pending');
  const [partOfSpeech, setPartOfSpeech] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Kept here so the notes stay open or closed while the reviewer moves between updates.
  const [notesOpen, setNotesOpen] = useState(false);
  // While a proposal has unsaved edits the filters are locked, so narrowing the list cannot swap the update away.
  const [dirty, setDirty] = useState(false);
  const reportDirty = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange?.(value);
    },
    [onDirtyChange]
  );
  const { data, isLoading, isFetching, error } = useGetVocabularyWordUpdateRequestsQuery({ status });
  const requests = data?.requests ?? EMPTY_REQUESTS;

  const partsOfSpeech = useMemo(() => [...new Set(requests.map(request => request.part_of_speech))].sort(), [requests]);
  const shownPartOfSpeech = partsOfSpeech.some(part => part === partOfSpeech) ? partOfSpeech : 'all';
  const visible = useMemo(() => {
    const words = searchText(query).split(/\s+/).filter(Boolean);
    return requests.filter(request => {
      if (shownPartOfSpeech !== 'all' && request.part_of_speech !== shownPartOfSpeech) return false;
      const haystack = searchText(`${request.word} ${request.translation} ${request.source ?? ''}`);
      return words.every(word => haystack.includes(word));
    });
  }, [requests, query, shownPartOfSpeech]);
  const filtering = visible.length !== requests.length;

  // Keep the chosen request while it is listed; otherwise show the first one.
  const activeId = visible.some(request => request.id === selectedId) ? selectedId : (visible[0]?.id ?? null);

  /** After an approval or dismissal, move on to the next request in the list. */
  const selectNext = () => {
    const index = visible.findIndex(request => request.id === activeId);
    const next = visible[index + 1] ?? visible[index - 1] ?? null;
    setSelectedId(next?.id ?? null);
  };

  const total = `${requests.length}${data?.truncated ? '+' : ''}`;
  const countLabel = isFetching
    ? 'Loading...'
    : filtering
      ? `${visible.length} of ${total} shown`
      : status === 'pending'
        ? null
        : `${total} ${STATUS_LABELS[status].toLowerCase()}`;

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(18rem,42%)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[34%_66%] lg:grid-rows-none">
      <aside className="min-h-0 overflow-y-auto border-b border-gray-200 bg-white lg:border-b-0 lg:border-r">
        <div className="sticky top-0 z-10 space-y-2 border-b border-gray-200 bg-white p-4">
          <div className="flex gap-2">
            <Select
              value={status}
              onValueChange={value =>
                requestNavigation(() => {
                  setStatus(value as VocabularyWordUpdateRequestStatus);
                  setSelectedId(null);
                })
              }>
              <SelectTrigger className="h-9 min-w-0 flex-1" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={shownPartOfSpeech} onValueChange={setPartOfSpeech} disabled={dirty}>
              <SelectTrigger className="h-9 min-w-0 flex-1" aria-label="Part of speech">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All parts of speech</SelectItem>
                {partsOfSpeech.map(part => (
                  <SelectItem key={part} value={part}>
                    {part}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search word, translation or source"
              aria-label="Search updates"
              disabled={dirty}
              className="h-9 pl-8 text-sm"
            />
          </div>
          {countLabel && (
            <p className="text-xs text-gray-500" aria-live="polite">
              {countLabel}
            </p>
          )}
        </div>

        {error ? (
          <div className="p-6 text-sm text-red-700">{getApiErrorMessage(error, 'Could not load updates')}</div>
        ) : isLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading updates...</div>
        ) : requests.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No {STATUS_LABELS[status].toLowerCase()} updates.</div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No updates match.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {visible.map(request => {
              const isSelected = request.id === activeId;
              return (
                <button
                  key={request.id}
                  type="button"
                  aria-current={isSelected}
                  onClick={() => request.id !== activeId && requestNavigation(() => setSelectedId(request.id))}
                  className={`w-full p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-l-2 border-primary bg-primary/5'
                      : 'border-l-2 border-transparent hover:bg-roman-parchment/60'
                  }`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium text-gray-900">{request.word}</p>
                    <span className="flex-shrink-0 text-xs text-gray-400">{formatDay(request.createdAt)}</span>
                  </div>
                  <p className="truncate text-sm text-gray-500">{request.translation}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{request.part_of_speech}</Badge>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900">
                      {describeChanges(request.changes)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden bg-white">
        {activeId ? (
          <>
            <UpdateDetail
              key={activeId}
              id={activeId}
              onClosed={selectNext}
              requestNavigation={requestNavigation}
              onDirtyChange={reportDirty}
            />
            <WordUpdateNotes key={`notes-${activeId}`} id={activeId} open={notesOpen} onOpenChange={setNotesOpen} />
          </>
        ) : (
          <div className="p-8 text-center text-sm text-gray-500">Select an update to review it.</div>
        )}
      </section>
    </main>
  );
}
