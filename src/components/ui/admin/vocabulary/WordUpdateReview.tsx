import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPillPicker } from '@/src/components/admin/shell';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
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
import { WordDiffPanel } from './WordDiffPanel';
import { WordEditPanel } from './WordEditPanel';
import { WordUpdateNotes } from './WordUpdateNotes';

const EMPTY_REQUESTS: VocabularyWordUpdateRequestSummary[] = [];

const STATUS_LABELS: Record<VocabularyWordUpdateRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  dismissed: 'Dismissed',
};
const STATUS_ICONS = { pending: Clock, approved: CheckCircle, dismissed: XCircle };

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

type View = 'current' | 'proposed' | 'changes';

function UpdateDetail({ id, onClosed }: { id: string; onClosed: () => void }) {
  const { data, isLoading, isFetching, error, refetch } = useGetVocabularyWordUpdateRequestQuery(id);
  const [view, setView] = useState<View>('changes');
  const [editing, setEditing] = useState(false);
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
  const beforeLabel = request.status === 'approved' ? 'Before' : 'Current';

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

  const handleDismiss = async () => {
    try {
      await dismiss({ id }).unwrap();
      toast.success('Update dismissed');
      onClosed();
    } catch (failure) {
      handleError(failure, 'Could not dismiss the update');
    }
  };

  const panelKey = `${view}-${request.version}-${liveFingerprint ?? 'deleted'}`;

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
              request.status === 'dismissed' && `Dismissed ${formatDate(request.updatedAt)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {pending && (
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button variant="outline" onClick={handleDismiss} disabled={busy || editing}>
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
          This word was edited after the update was staged. The views compare the word as it is now with the proposal,
          so approving replaces those edits too.
        </div>
      )}

      <div className="border-b border-gray-200 px-6 py-2">
        <AdminPillPicker<View>
          label="Update view"
          value={view}
          onValueChange={setView}
          // A proposal is edited in the Proposed view, which stays the only one available until it is saved.
          options={[
            { value: 'current', label: beforeLabel, disabled: editing },
            { value: 'proposed', label: 'Proposed' },
            { value: 'changes', label: 'Changes', disabled: editing },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {view === 'current' && <WordEditPanel key={panelKey} word={beforeWord} readOnly />}
        {view === 'proposed' &&
          (editing ? (
            <WordEditPanel
              key={`${panelKey}-editing`}
              word={proposedWord}
              onSave={handleSave}
              updating={saving}
              saveLabel="Save proposal"
              allowAIAutocomplete={false}
              actions={
                <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
              }
            />
          ) : (
            <WordEditPanel
              key={panelKey}
              word={proposedWord}
              readOnly
              actions={
                pending && liveWord ? (
                  <Button type="button" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
                    Edit proposal
                  </Button>
                ) : null
              }
            />
          ))}
        {view === 'changes' && (
          <WordDiffPanel key={panelKey} before={beforeWord} after={proposedWord} beforeLabel={beforeLabel} />
        )}
      </div>
    </>
  );
}

/** The Updates tab of Pending Review: proposed changes to existing words, each with three views. */
export function WordUpdateReview() {
  const [status, setStatus] = useState<VocabularyWordUpdateRequestStatus>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Kept here so the notes stay open or closed while the reviewer moves between updates.
  const [notesOpen, setNotesOpen] = useState(true);
  const { data, isLoading, isFetching, error } = useGetVocabularyWordUpdateRequestsQuery({ status });
  const requests = data?.requests ?? EMPTY_REQUESTS;
  // Keep the chosen request while it is listed; otherwise show the first one.
  const activeId = requests.some(request => request.id === selectedId) ? selectedId : (requests[0]?.id ?? null);

  /** After an approval or dismissal, move on to the next request in the list. */
  const selectNext = () => {
    const index = requests.findIndex(request => request.id === activeId);
    const next = requests[index + 1] ?? requests[index - 1] ?? null;
    setSelectedId(next?.id ?? null);
  };

  const countLabel = isFetching
    ? 'Loading...'
    : `${requests.length}${data?.truncated ? '+' : ''} ${STATUS_LABELS[status]}`;

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(18rem,42%)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[34%_66%] lg:grid-rows-none">
      <aside className="min-h-0 overflow-y-auto border-b border-gray-200 bg-white lg:border-b-0 lg:border-r">
        <div className="sticky top-0 z-10 space-y-3 border-b border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <Select
              value={status}
              onValueChange={value => {
                setStatus(value as VocabularyWordUpdateRequestStatus);
                setSelectedId(null);
              }}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary">{countLabel}</Badge>
          </div>
        </div>

        {error ? (
          <div className="p-6 text-sm text-red-700">{getApiErrorMessage(error, 'Could not load updates')}</div>
        ) : isLoading ? (
          <div className="p-6 text-sm text-gray-500">Loading updates...</div>
        ) : requests.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No {STATUS_LABELS[status].toLowerCase()} updates.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {requests.map(request => {
              const Icon = STATUS_ICONS[request.status];
              const isSelected = request.id === activeId;
              return (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => setSelectedId(request.id)}
                  className={`w-full p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-l-2 border-primary bg-primary/5'
                      : 'border-l-2 border-transparent hover:bg-roman-parchment/60'
                  }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{request.word}</p>
                      <p className="truncate text-sm text-gray-500">{request.translation}</p>
                    </div>
                    <Icon className="mt-1 h-4 w-4 flex-shrink-0 text-gray-500" />
                  </div>
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
            <UpdateDetail key={activeId} id={activeId} onClosed={selectNext} />
            <WordUpdateNotes key={`notes-${activeId}`} id={activeId} open={notesOpen} onOpenChange={setNotesOpen} />
          </>
        ) : (
          <WordEditPanel word={null} readOnly />
        )}
      </section>
    </main>
  );
}
