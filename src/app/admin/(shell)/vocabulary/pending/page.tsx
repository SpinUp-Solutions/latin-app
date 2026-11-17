'use client';

import {
  VocabularyReviewLayout,
  VocabularyReviewRow,
} from '@/src/components/ui/admin/vocabulary/VocabularyReviewLayout';

import React, { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';
import { AIAssistantProvider } from '@/src/components/ui/admin/vocabulary/aiAssistantStore';
import { VocabularyAIRulesDialog } from '@/src/components/ui/admin/vocabulary/VocabularyAIRulesDialog';
import { useLearnedAIRules } from '@/src/store/api/vocabularyAIGuidanceApi';
import { WordUpdateReview } from '@/src/components/ui/admin/vocabulary/WordUpdateReview';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { getApiErrorMessage } from '@/src/store/api/baseQuery';
import { AdminPillPicker } from '@/src/components/admin/shell';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import {
  useApproveVocabularyWordRequestMutation,
  useDismissVocabularyWordRequestMutation,
  useGetVocabularyWordRequestsQuery,
  useUpdateVocabularyWordRequestMutation,
} from '@/src/store/api/vocabularyWordRequestsApi';
import { useGetVocabularyWordUpdateRequestsQuery } from '@/src/store/api/vocabularyWordUpdateRequestsApi';
import type { VocabularyWordRequestStatus } from '@/shared/types/vocabulary/requests';
import type { VocabularyWord, VocabularyWordWithId } from '@/shared/types/vocabulary/schemas';

const STATUS_LABELS: Record<VocabularyWordRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  dismissed: 'Dismissed',
};

const statusIcon = {
  pending: Clock,
  approved: CheckCircle,
  dismissed: XCircle,
};

/** AI-generated drafts of words that do not exist yet. */
function NewWordRequestsReview() {
  const learnedRules = useLearnedAIRules();
  const [status, setStatus] = useState<VocabularyWordRequestStatus>('pending');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const {
    data: requests = [],
    isLoading,
    isFetching,
    error: requestError,
  } = useGetVocabularyWordRequestsQuery({ status });
  const [updateRequest, { isLoading: updating }] = useUpdateVocabularyWordRequestMutation();
  const [approveRequest, { isLoading: approving }] = useApproveVocabularyWordRequestMutation();
  const [dismissRequest, { isLoading: dismissing }] = useDismissVocabularyWordRequestMutation();
  const requestErrorMessage = requestError
    ? getApiErrorMessage(requestError, 'Could not load vocabulary requests')
    : null;
  const selectedRequest = requests.find(request => request.id === selectedRequestId) ?? requests[0] ?? null;

  const editorWord: VocabularyWordWithId | null = selectedRequest
    ? ({ id: selectedRequest.id, ...selectedRequest.draftWord } as VocabularyWordWithId)
    : null;

  const handleSaveDraft = async (updates: Partial<VocabularyWord>) => {
    if (!selectedRequest) return false;

    try {
      await updateRequest({
        id: selectedRequest.id,
        draftWord: updates as VocabularyWord,
      }).unwrap();
      toast.success('Pending draft saved');
      return true;
    } catch (error) {
      console.error('Save pending draft error:', error);
      toast.error(getApiErrorMessage(error, 'Could not save pending draft'));
      return false;
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;

    try {
      const result = await approveRequest(selectedRequest.id).unwrap();
      toast.success(`Approved and created word ${result.wordId}`);
      setSelectedRequestId(null);
    } catch (error) {
      console.error('Approve vocabulary request error:', error);
      toast.error(getApiErrorMessage(error, 'Could not approve request'));
    }
  };

  const handleDismiss = async () => {
    if (!selectedRequest) return;

    try {
      await dismissRequest({ id: selectedRequest.id }).unwrap();
      toast.success('Request dismissed');
      setSelectedRequestId(null);
    } catch (error) {
      console.error('Dismiss vocabulary request error:', error);
      toast.error(getApiErrorMessage(error, 'Could not dismiss request'));
    }
  };

  return (
    <VocabularyReviewLayout
      list={
        <>
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Select value={status} onValueChange={value => setStatus(value as VocabularyWordRequestStatus)}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="secondary">
                {isFetching ? 'Loading...' : `${requests.length} ${STATUS_LABELS[status]}`}
              </Badge>
            </div>
          </div>

          {requestErrorMessage ? (
            <div className="p-6 text-sm text-red-700">Could not load requests: {requestErrorMessage}</div>
          ) : isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading requests...</div>
          ) : requests.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No {STATUS_LABELS[status].toLowerCase()} requests.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {requests.map(request => {
                const Icon = statusIcon[request.status];
                const isSelected = request.id === selectedRequest?.id;

                return (
                  <VocabularyReviewRow
                    key={request.id}
                    selected={isSelected}
                    onSelect={() => setSelectedRequestId(request.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{request.draftWord.word}</p>
                        <p className="text-sm text-gray-500 truncate">{request.draftWord.translation}</p>
                      </div>
                      <Icon className="h-4 w-4 text-gray-500 mt-1 flex-shrink-0" />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline">{request.draftWord.part_of_speech}</Badge>
                      <span className="text-xs text-gray-500">{new Date(request.updatedAt).toLocaleString()}</span>
                    </div>
                  </VocabularyReviewRow>
                );
              })}
            </div>
          )}
        </>
      }>
      {selectedRequest && (
        <div className="border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-gray-500 truncate">Source: {selectedRequest.sourceText}</p>
            <p className="text-xs text-gray-400 truncate">
              Candidate: {selectedRequest.selectedCandidate.word} ({selectedRequest.selectedCandidate.confidence})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <VocabularyAIRulesDialog />
            {selectedRequest.status === 'pending' && (
              <>
                <Button variant="outline" onClick={handleDismiss} disabled={dismissing || approving || updating}>
                  {dismissing ? 'Dismissing...' : 'Dismiss'}
                </Button>
                <Button onClick={handleApprove} disabled={approving || dismissing || updating}>
                  {approving ? 'Approving...' : 'Approve'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <WordEditPanel word={editorWord} onSave={handleSaveDraft} updating={updating} learnedRules={learnedRules} />
      </div>
    </VocabularyReviewLayout>
  );
}

type PendingTab = 'new' | 'updates';

function PendingVocabularyPage() {
  const [tab, setTab] = useState<PendingTab>('new');
  const [proposalDirty, setProposalDirty] = useState(false);
  const navigationGuard = useUnsavedNavigationGuard(
    proposalDirty,
    'You have unsaved edits to this proposal. Leave it without saving?'
  );
  const { data: newWords } = useGetVocabularyWordRequestsQuery({ status: 'pending' });
  const { data: updates } = useGetVocabularyWordUpdateRequestsQuery({ status: 'pending' });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-serif tracking-wide">Pending Vocabulary</h1>
            <p className="text-sm text-roman-stone">Review new words and changes to existing words</p>
          </div>
          <AdminPillPicker<PendingTab>
            label="Pending vocabulary"
            value={tab}
            onValueChange={next => navigationGuard.requestNavigation(() => setTab(next))}
            options={[
              { value: 'new', label: 'New words', count: newWords?.length },
              {
                value: 'updates',
                label: 'Updates',
                count: updates && `${updates.requests.length}${updates.truncated ? '+' : ''}`,
              },
            ]}
          />
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/vocabulary">View All Words</Link>
        </Button>
      </header>

      {tab === 'new' ? (
        <AIAssistantProvider>
          <NewWordRequestsReview />
        </AIAssistantProvider>
      ) : (
        <WordUpdateReview requestNavigation={navigationGuard.requestNavigation} onDirtyChange={setProposalDirty} />
      )}

      <ConfirmationDialog
        isOpen={navigationGuard.isOpen}
        onClose={navigationGuard.stayOnPage}
        onConfirm={navigationGuard.leavePage}
        title="Leave without saving?"
        description={navigationGuard.message}
        confirmText="Leave without saving"
        confirmVariant="destructive"
      />
    </div>
  );
}

export default withAdminAuth(PendingVocabularyPage);
