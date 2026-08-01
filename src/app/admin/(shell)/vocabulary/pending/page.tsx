'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { WordEditPanel } from '@/src/components/ui/admin/vocabulary/WordEditPanel';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import {
  useApproveVocabularyWordRequestMutation,
  useDismissVocabularyWordRequestMutation,
  useGetVocabularyWordRequestsQuery,
  useUpdateVocabularyWordRequestMutation,
} from '@/src/store/api/vocabularyWordRequestsApi';
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

const getRequestErrorMessage = (error: unknown): string | null => {
  if (!error) return null;

  if (typeof error === 'object' && error !== null) {
    if ('data' in error) {
      const data = (error as { data?: unknown }).data;
      if (typeof data === 'object' && data !== null && 'error' in data) {
        const message = (data as { error?: unknown }).error;
        if (typeof message === 'string') return message;
      }
      if (typeof data === 'string') return data;
    }

    if ('error' in error) {
      const message = (error as { error?: unknown }).error;
      if (typeof message === 'string') return message;
    }

    if ('status' in error) {
      return `Request failed with status ${(error as { status: unknown }).status}`;
    }
  }

  return 'Could not load vocabulary requests';
};

function PendingVocabularyPage() {
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
  const requestErrorMessage = useMemo(() => getRequestErrorMessage(requestError), [requestError]);

  useEffect(() => {
    setSelectedRequestId(null);
  }, [status]);

  useEffect(() => {
    if (!selectedRequestId && requests.length > 0) {
      setSelectedRequestId(requests[0].id);
    }
  }, [requests, selectedRequestId]);

  const selectedRequest = useMemo(
    () => requests.find(request => request.id === selectedRequestId) || null,
    [requests, selectedRequestId]
  );

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
      const message = error instanceof Error ? error.message : 'Could not save pending draft';
      toast.error(message);
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
      const message = error instanceof Error ? error.message : 'Could not approve request';
      toast.error(message);
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
      const message = error instanceof Error ? error.message : 'Could not dismiss request';
      toast.error(message);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-serif tracking-wide">Pending Vocabulary</h1>
          <p className="text-sm text-roman-stone">Review AI-generated vocabulary drafts</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/vocabulary">View All Words</Link>
        </Button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(18rem,42%)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[34%_66%] lg:grid-rows-none">
        <aside className="min-h-0 overflow-y-auto border-b border-gray-200 bg-white lg:border-b-0 lg:border-r">
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
                const isSelected = request.id === selectedRequestId;

                return (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => setSelectedRequestId(request.id)}
                    className={`w-full p-4 text-left transition-colors ${
                      isSelected
                        ? 'border-l-2 border-primary bg-primary/5'
                        : 'border-l-2 border-transparent hover:bg-roman-parchment/60'
                    }`}>
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
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="min-h-0 flex flex-col overflow-hidden bg-white">
          {selectedRequest && (
            <div className="border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-gray-500 truncate">Source: {selectedRequest.sourceText}</p>
                <p className="text-xs text-gray-400 truncate">
                  Candidate: {selectedRequest.selectedCandidate.word} ({selectedRequest.selectedCandidate.confidence})
                </p>
              </div>
              <div className="flex items-center gap-2">
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
            <WordEditPanel word={editorWord} onSave={handleSaveDraft} updating={updating} />
          </div>
        </section>
      </main>
    </div>
  );
}

export default withAdminAuth(PendingVocabularyPage);
